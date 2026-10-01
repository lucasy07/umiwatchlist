// Walks the Sequel/Prequel relation graph on Jikan (MAL) for an anime, then
// fetches details for each related entry. Used to import an entire series
// as one anime grouped by its seasons.

import { isValidIsoDate, parseJikanDuration, type ReleasePrecision } from "@/lib/anime-storage";
import { getJikanAnime, getJikanRelations, type JikanAnimeDetails } from "@/lib/jikan-client";

export type ChainSeason = {
  malId: number;
  title: string;
  year: number | null;
  malScore: number | null;
  imageUrl: string | null;
  type: string | null;
  status: string | null;
  airedFrom: string | null;
  genres: string[];
  episodes: number | null;
  durationMin: number | null;
  /** Premiere date (ISO YYYY-MM-DD), padded per `releasePrecision`. */
  releaseDate: string | null;
  releasePrecision: ReleasePrecision | null;
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Premiere date from Jikan's `aired`. Built from `prop.from` parts, never from the UTC
 * `aired.from`; that one is only a fallback (with unknown precision) when `prop` is missing.
 */
export function deriveReleaseDate(aired: JikanAnimeDetails["aired"]): {
  releaseDate: string | null;
  releasePrecision: ReleasePrecision | null;
} {
  const parts = aired?.prop?.from;
  if (parts) {
    const { year, month, day } = parts;
    if (year == null) return { releaseDate: null, releasePrecision: null };
    if (month == null) return { releaseDate: `${year}-01-01`, releasePrecision: "year" };
    if (day == null) return { releaseDate: `${year}-${pad(month)}-01`, releasePrecision: "month" };
    return { releaseDate: `${year}-${pad(month)}-${pad(day)}`, releasePrecision: "day" };
  }
  const fallback = aired?.from?.slice(0, 10);
  return { releaseDate: isValidIsoDate(fallback) ? fallback : null, releasePrecision: null };
}

const KEEP_TYPES = new Set(["TV", "ONA", "Movie", "OVA", "Special", "TV Special"]);
const MAX_ENTRIES = 15;

async function getRelations(malId: number, signal?: AbortSignal): Promise<number[]> {
  const relations = await getJikanRelations(malId, { signal, priority: "background" });
  const ids: number[] = [];
  for (const rel of relations) {
    if (rel.relation !== "Sequel" && rel.relation !== "Prequel") continue;
    for (const e of rel.entry ?? []) {
      if (e.type === "anime") ids.push(e.mal_id);
    }
  }
  return ids;
}

async function getDetails(malId: number, signal?: AbortSignal): Promise<JikanAnimeDetails | null> {
  try {
    return await getJikanAnime(malId, { signal, priority: "background" });
  } catch {
    return null;
  }
}

export type ChainProgress = {
  current: number;
  total: number;
};

export type BuildChainOptions = {
  knownMalIds?: Set<number>;
};

/**
 * Build the season chain for a given malId by walking Sequel/Prequel
 * relations recursively. Sequential requests with rate-limit delay.
 *
 * Returns seasons of type TV/ONA, sorted by year ascending.
 */
export async function buildChain(
  rootMalId: number,
  onProgress?: (p: ChainProgress) => void,
  signal?: AbortSignal,
  options?: BuildChainOptions,
): Promise<ChainSeason[]> {
  const visited = new Set<number>([rootMalId]);
  const queue: number[] = [rootMalId];
  const idsToFetch: number[] = [];

  // Discovery phase: BFS the relation graph collecting unique ids.
  while (queue.length > 0 && idsToFetch.length < MAX_ENTRIES) {
    const id = queue.shift()!;
    idsToFetch.push(id);
    if (idsToFetch.length >= MAX_ENTRIES) break;
    try {
      const related = await getRelations(id, signal);
      for (const r of related) {
        if (visited.has(r)) continue;
        if (visited.size >= MAX_ENTRIES) break;
        visited.add(r);
        queue.push(r);
      }
    } catch {
      // ignore relation errors for a single node
    }
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  }

  const detailIds = options?.knownMalIds
    ? idsToFetch.filter((id) => !options.knownMalIds?.has(id))
    : idsToFetch;
  const total = detailIds.length;
  onProgress?.({ current: 0, total });

  const seasons: ChainSeason[] = [];
  for (let i = 0; i < detailIds.length; i++) {
    const id = detailIds[i];
    const d = await getDetails(id, signal);
    if (d && d.type && KEEP_TYPES.has(d.type)) {
      const year = d.year ?? (d.aired?.from ? new Date(d.aired.from).getFullYear() : null);
      seasons.push({
        malId: d.mal_id,
        title: d.title,
        year: Number.isFinite(year as number) ? (year as number) : null,
        malScore: d.score ?? null,
        imageUrl: d.images?.jpg?.large_image_url ?? d.images?.jpg?.image_url ?? null,
        type: d.type,
        status: d.status ?? null,
        airedFrom: d.aired?.from ?? null,
        ...deriveReleaseDate(d.aired),
        episodes: d.episodes ?? null,
        durationMin: parseJikanDuration(d.duration),
        genres: [
          ...new Set(
            (Array.isArray(d.genres) ? d.genres : [])
              .map((g) => (typeof g?.name === "string" ? g.name.trim() : ""))
              .filter((n) => n.length > 0),
          ),
        ],
      });
    }
    onProgress?.({ current: i + 1, total });
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  }

  seasons.sort((a, b) => {
    const ay = a.year ?? Number.POSITIVE_INFINITY;
    const by = b.year ?? Number.POSITIVE_INFINITY;
    if (ay !== by) return ay - by;
    return a.malId - b.malId;
  });
  return seasons;
}
