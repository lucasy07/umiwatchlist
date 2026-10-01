import {
  type Anime,
  type Season,
  isExcludedFromAverage,
  mergeLegacyUpcoming,
  tierFromAverage,
  updateAnimeMeta,
  updateSeasons,
  updateTier,
  updateUpcoming,
  parseJikanDuration,
} from "@/lib/anime-storage";
import { getJikanAnime, searchJikanAnime } from "@/lib/jikan-client";

const MIGRATIONS_KEY_PREFIX = "anime-watchlist:migrations:";
const IMG_TRIED_KEY_PREFIX = "anime-watchlist:img-tried:";

const TIER_MIGRATION_VERSION = 2;

function readVersion(userId: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(MIGRATIONS_KEY_PREFIX + userId);
    if (!raw) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeVersion(userId: string, version: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MIGRATIONS_KEY_PREFIX + userId, String(version));
  } catch {
    // ignore
  }
}

function readImgTried(userId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(IMG_TRIED_KEY_PREFIX + userId);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function writeImgTried(userId: string, set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(IMG_TRIED_KEY_PREFIX + userId, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

export type MigrationParams = {
  userId: string;
  animes: Anime[];
  onPatch: (id: string, patch: Partial<Anime>) => void;
  signal: AbortSignal;
};

/**
 * Converts legacy `upcoming` into an unreleased season. Not versioned: runs whenever an anime still
 * has `upcoming`, because the new-seasons check keeps writing there.
 */
async function backfillLegacyUpcoming({ animes, onPatch, signal }: MigrationParams): Promise<void> {
  for (const anime of animes) {
    if (signal.aborted) return;
    const upcoming = anime.upcoming;
    if (!upcoming) continue;
    const merged = mergeLegacyUpcoming(anime.seasons, upcoming);
    if (merged === null) {
      console.warn("upcoming com data inválida não convertido:", anime.name, upcoming);
      continue;
    }
    try {
      if (merged !== anime.seasons) {
        await updateSeasons(anime.id, merged);
        // Keep the shared snapshot in sync so later backfills see the new season.
        anime.seasons = merged;
        if (signal.aborted) return;
        onPatch(anime.id, { seasons: merged });
      }
      await updateUpcoming(anime.id, null);
      anime.upcoming = undefined;
      if (signal.aborted) return;
      // Seasons again: an aborted earlier run may have saved them without patching the page.
      onPatch(anime.id, { seasons: anime.seasons, upcoming: undefined });
    } catch (err) {
      console.error(err);
    }
  }
}

async function backfillImageUrl({
  userId,
  animes,
  onPatch,
  signal,
}: MigrationParams): Promise<void> {
  const tried = readImgTried(userId);
  const missing = animes.filter((a) => !a.imageUrl && !tried.has(a.name));
  if (missing.length === 0) return;

  for (const anime of missing) {
    if (signal.aborted) return;
    try {
      let malId: number | null = null;
      let imageUrl: string | undefined;
      let malScore: number | null = null;

      let jikanOk = false;
      try {
        const top = (
          await searchJikanAnime(anime.name, 1, {
            signal,
            priority: "background",
          })
        )[0];
        const img: string | undefined =
          top?.images?.jpg?.large_image_url ?? top?.images?.jpg?.image_url;
        if (img) {
          jikanOk = true;
          imageUrl = img;
          malId = top?.mal_id ?? null;
          malScore = top?.score ?? null;
        }
      } catch {
        // fall through to AniList fallback
      }

      if (!jikanOk) {
        try {
          const alRes = await fetch("https://graphql.anilist.co", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              query:
                "query ($search: String) { Page(perPage: 1) { media(search: $search, type: ANIME, isAdult: false) { idMal coverImage { large } } } }",
              variables: { search: anime.name },
            }),
          });
          if (!alRes.ok) {
            tried.add(anime.name);
            writeImgTried(userId, tried);
            continue;
          }
          const alJson = await alRes.json();
          const media = alJson?.data?.Page?.media?.[0];
          const idMal: number | null = media?.idMal ?? null;
          if (!idMal) {
            tried.add(anime.name);
            writeImgTried(userId, tried);
            continue;
          }

          let gotDetails = false;
          try {
            const data = await getJikanAnime(idMal, { signal, priority: "background" });
            const img: string | undefined =
              data?.images?.jpg?.large_image_url ?? data?.images?.jpg?.image_url;
            if (img) {
              gotDetails = true;
              malId = data?.mal_id ?? idMal;
              imageUrl = img;
              malScore = data?.score ?? null;
            }
          } catch {
            // fall through to AniList cover
          }

          if (!gotDetails) {
            malId = idMal;
            imageUrl = media?.coverImage?.large ?? undefined;
            malScore = null;
          }
        } catch {
          tried.add(anime.name);
          writeImgTried(userId, tried);
          continue;
        }
      }

      if (!imageUrl) {
        tried.add(anime.name);
        writeImgTried(userId, tried);
        continue;
      }
      await updateAnimeMeta(anime.id, { malId, imageUrl, malScore });
      if (signal.aborted) return;
      onPatch(anime.id, { malId, imageUrl, malScore });
    } catch {
      // ignore
    }
  }
}

async function backfillSeasonDetails({ animes, onPatch, signal }: MigrationParams): Promise<void> {
  const targets = animes.filter((a) =>
    a.seasons.some(
      (s) =>
        s.malId &&
        (s.type == null || s.type === "" || s.episodes === undefined || s.imageUrl === undefined),
    ),
  );
  if (targets.length === 0) return;

  for (const anime of targets) {
    if (signal.aborted) return;
    const seasons = [...anime.seasons];
    let changed = false;
    let genresPatch: string[] | undefined;

    for (let i = 0; i < seasons.length; i++) {
      if (signal.aborted) return;
      const s = seasons[i];
      const missingType = s.type == null || s.type === "";
      const missingEpisodes = s.episodes === undefined;
      const missingImage = s.imageUrl === undefined;
      if (!s.malId || (!missingType && !missingEpisodes && !missingImage)) continue;

      try {
        const data = await getJikanAnime(s.malId, { signal, priority: "background" });
        const patch: Partial<Season> = {};

        if (missingType && data.type) patch.type = data.type;
        if (missingEpisodes) {
          patch.episodes = data.episodes ?? null;
          patch.durationMin = parseJikanDuration(data.duration);
        }
        if (missingImage) {
          patch.imageUrl = data.images?.jpg?.large_image_url ?? data.images?.jpg?.image_url ?? null;
        }

        if (Object.keys(patch).length > 0) {
          seasons[i] = { ...s, ...patch };
          changed = true;
        }

        if (anime.genres == null && data.mal_id === anime.malId) {
          genresPatch = [
            ...new Set(
              (Array.isArray(data.genres) ? data.genres : [])
                .map((g: { name?: unknown }) => (typeof g?.name === "string" ? g.name.trim() : ""))
                .filter((name: string) => name.length > 0),
            ),
          ];
        }
      } catch {
        // ignore; retried in a future session
      }
    }

    if (genresPatch !== undefined && !signal.aborted) {
      try {
        await updateAnimeMeta(anime.id, { genres: genresPatch });
        anime.genres = genresPatch;
        if (signal.aborted) return;
        onPatch(anime.id, { genres: genresPatch });
      } catch {
        // ignore
      }
    }

    if (changed && !signal.aborted) {
      try {
        await updateSeasons(anime.id, seasons);
        // Keep the shared snapshot in sync so later backfills don't write stale seasons back.
        anime.seasons = seasons;
        if (signal.aborted) return;
        onPatch(anime.id, { seasons });
      } catch {
        // ignore
      }
    }
  }
}

async function backfillGenres({ animes, onPatch, signal }: MigrationParams): Promise<void> {
  const targets = animes.filter((a) => a.genres == null && typeof a.malId === "number");
  if (targets.length === 0) return;

  for (const anime of targets) {
    if (signal.aborted) return;
    try {
      const data = await getJikanAnime(anime.malId as number, {
        signal,
        priority: "background",
      });
      if (signal.aborted) return;
      const raw = data?.genres;
      const genres = [
        ...new Set(
          (Array.isArray(raw) ? raw : [])
            .map((g: { name?: unknown }) => (typeof g?.name === "string" ? g.name.trim() : ""))
            .filter((n: string) => n.length > 0),
        ),
      ] as string[];
      await updateAnimeMeta(anime.id, { genres });
      if (signal.aborted) return;
      onPatch(anime.id, { genres });
    } catch {
      // ignore; retried in a future session
    }
  }
}

async function migrateTierFromRatings({
  userId,
  animes,
  onPatch,
  signal,
}: MigrationParams): Promise<void> {
  if (readVersion(userId) >= TIER_MIGRATION_VERSION) return;
  const candidates = animes.filter(
    (a) =>
      a.tier == null &&
      a.seasons.some((s) => typeof s.rating === "number" && !isExcludedFromAverage(s)),
  );
  for (const a of candidates) {
    if (signal.aborted) return;
    const rated = a.seasons.filter(
      (s): s is Season & { rating: number } =>
        typeof s.rating === "number" && !isExcludedFromAverage(s),
    );
    if (rated.length === 0) continue;
    const avg = rated.reduce((sum, s) => sum + s.rating, 0) / rated.length;
    const tier = tierFromAverage(avg);
    try {
      await updateTier(a.id, tier);
      if (signal.aborted) return;
      onPatch(a.id, { tier });
    } catch (err) {
      console.error(err);
    }
  }
  if (!signal.aborted) writeVersion(userId, TIER_MIGRATION_VERSION);
}

export async function runMigrations(params: MigrationParams): Promise<void> {
  await backfillLegacyUpcoming(params);
  if (params.signal.aborted) return;
  await backfillImageUrl(params);
  if (params.signal.aborted) return;
  await backfillSeasonDetails(params);
  if (params.signal.aborted) return;
  await backfillGenres(params);
  if (params.signal.aborted) return;
  await migrateTierFromRatings(params);
}
