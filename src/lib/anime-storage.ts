import { supabase } from "@/integrations/supabase/client";

export type Season = {
  id: string;
  name: string;
  /** Dado legado do antigo localStorage, somente leitura; não há UI de edição. */
  rating?: number | null;
  malId?: number | null;
  year?: number | null;
  malScore?: number | null;
  /** Jikan/MAL type: TV, Movie, OVA, ONA, Special, Music, etc. */
  type?: string | null;
  /** Override explícito de inclusão na média. undefined = usa o default por tipo. */
  includeInAverage?: boolean;
  /** Quantidade de episódios. undefined = nunca buscado; null = buscado e indisponível. */
  episodes?: number | null;
  /** Duração em minutos POR episódio. undefined = nunca buscado; null = indisponível. */
  durationMin?: number | null;
  /** URL da capa no CDN do MAL. undefined = nunca buscado; null = buscado e indisponível. */
  imageUrl?: string | null;
};

/**
 * A Jikan devolve `duration` como string livre ("24 min per ep", "1 hr 47 min").
 * Retorna o total em minutos ou null quando desconhecido.
 */
export function parseJikanDuration(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  const s = raw.toLowerCase().trim();
  if (!s || s.includes("unknown")) return null;
  const hr = s.match(/(\d+)\s*(?:hr|hour)s?/);
  const min = s.match(/(\d+)\s*(?:min|minute)s?/);
  const sec = s.match(/(\d+)\s*(?:sec|second)s?/);
  let total = 0;
  if (hr) total += parseInt(hr[1], 10) * 60;
  if (min) total += parseInt(min[1], 10);
  if (!hr && !min && sec) total += Math.round(parseInt(sec[1], 10) / 60);
  return total > 0 ? total : null;
}

/** Minutos totais da temporada (episódios × duração). null se dado incompleto. */
export function seasonMinutes(season: Season): number | null {
  const eps = season.episodes;
  const dur = season.durationMin;
  if (typeof eps !== "number" || typeof dur !== "number") return null;
  if (!eps || !dur) return null;
  return eps * dur;
}

/**
 * Soma o tempo de TODAS as temporadas (inclui OVA/Special —
 * `isExcludedFromAverage` vale só para média de nota).
 */
export function animeMinutes(anime: Anime): {
  minutes: number;
  episodes: number;
  missing: number;
} {
  let minutes = 0;
  let episodes = 0;
  let missing = 0;
  for (const s of anime.seasons) {
    const m = seasonMinutes(s);
    if (m === null) {
      missing += 1;
      continue;
    }
    minutes += m;
    episodes += typeof s.episodes === "number" ? s.episodes : 0;
  }
  return { minutes, episodes, missing };
}

/** "3 d 7 h" / "14 h 20 min" / "45 min" */
export function formatMinutes(min: number): string {
  const total = Math.max(0, Math.round(min));
  if (total >= 1440) {
    const days = Math.floor(total / 1440);
    const hours = Math.floor((total % 1440) / 60);
    return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  }
  if (total >= 60) {
    const hours = Math.floor(total / 60);
    const rest = total % 60;
    return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
  }
  return `${total} min`;
}

export function isExcludedFromAverage(season: Season): boolean {
  if (season.includeInAverage === true) return false;
  if (season.includeInAverage === false) return true;

  const t = typeof season.type === "string" ? season.type.toLowerCase() : "";
  return t === "ova" || t === "special" || t === "tv special";
}

export type Tier = "S" | "A" | "B" | "C" | "D" | "E";

export const TIER_VALUE: Record<Tier, number> = { S: 5, A: 4, B: 3, C: 2, D: 1, E: 0 };

export function tierFromAverage(avg: number): Tier {
  if (avg >= 9) return "S";
  if (avg >= 8) return "A";
  if (avg >= 7) return "B";
  if (avg >= 5) return "C";
  if (avg >= 3) return "D";
  return "E";
}

/** Tierlist order: tier desc (no tier last), then manual `tierPosition` asc with null last. Ties return 0 so a stable sort keeps input order. */
export function compareTierlistOrder(
  a: Pick<Anime, "tier" | "tierPosition">,
  b: Pick<Anime, "tier" | "tierPosition">,
): number {
  const va = a.tier === null ? -1 : TIER_VALUE[a.tier];
  const vb = b.tier === null ? -1 : TIER_VALUE[b.tier];
  if (vb !== va) return vb - va;
  const pa = a.tierPosition;
  const pb = b.tierPosition;
  if (pa == null && pb == null) return 0;
  if (pa == null) return 1;
  if (pb == null) return -1;
  return pa - pb;
}

export const AWARD_GENRE = "Award Winning";

export function isAwardWinning(anime: Anime): boolean {
  return (
    Array.isArray(anime.genres) &&
    anime.genres.some((g) => g.trim().toLowerCase() === AWARD_GENRE.toLowerCase())
  );
}

export type UpcomingSeason = {
  title: string;
  /** ISO date string (YYYY-MM-DD) */
  releaseDate: string;
  /** Origin: "auto" from continuation scan, "manual" from user. Missing = manual (legacy). */
  source?: "auto" | "manual";
  /** MAL id of the detected continuation season (only when source === "auto"). */
  malId?: number | null;
};

export type Anime = {
  id: string;
  name: string;
  seasons: Season[];
  cover?: string;
  upcoming?: UpcomingSeason;
  watched: boolean;
  malId?: number | null;
  imageUrl?: string | null;
  malScore?: number | null;
  tier: Tier | null;
  /** Manual position inside the tier row. null = unpositioned (falls back to created_at order). */
  tierPosition: number | null;
  /** ISO timestamp of the last new-seasons check. null = never checked. */
  lastCheckedAt: string | null;
  /** MAL genres. null = never fetched; [] = fetched and none. */
  genres: string[] | null;
};

/** Legacy localStorage key — used only for one-time auto-import. */
export const LEGACY_STORAGE_KEY = "anime-ranker:v1";

const IMPORT_FLAG_PREFIX = "anime-watchlist:imported:";

type DbRow = {
  id: string;
  name: string;
  cover: string | null;
  seasons: unknown;
  upcoming: unknown;
  watched: boolean | null;
  mal_id: number | null;
  image_url: string | null;
  mal_score: number | null;
  tier: string | null;
  tier_position: number | null;
  last_checked_at: string | null;
  genres: string[] | null;
};

function rowToAnime(row: DbRow): Anime {
  const seasons = Array.isArray(row.seasons) ? (row.seasons as Season[]) : [];
  const upcoming = (row.upcoming ?? undefined) as UpcomingSeason | undefined;
  const tier =
    row.tier === "S" ||
    row.tier === "A" ||
    row.tier === "B" ||
    row.tier === "C" ||
    row.tier === "D" ||
    row.tier === "E"
      ? (row.tier as Tier)
      : null;
  return {
    id: row.id,
    name: row.name,
    cover: row.cover ?? undefined,
    seasons,
    upcoming,
    watched: row.watched ?? false,
    malId: row.mal_id ?? null,
    imageUrl: row.image_url ?? null,
    malScore: row.mal_score ?? null,
    tier,
    tierPosition: row.tier_position ?? null,
    lastCheckedAt: row.last_checked_at ?? null,
    genres:
      Array.isArray(row.genres) && row.genres.every((g) => typeof g === "string")
        ? (row.genres as string[])
        : null,
  };
}

function readLegacyLocal(): Anime[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Anime[]) : [];
  } catch {
    return [];
  }
}

/** Fetch all animes for the current user. */
export async function fetchAnimes(): Promise<Anime[]> {
  const { data, error } = await supabase
    .from("animes")
    .select(
      "id, name, cover, seasons, upcoming, watched, mal_id, image_url, mal_score, tier, tier_position, last_checked_at, genres",
    )
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as DbRow[]).map(rowToAnime);
}

/** One-time import of localStorage data into Supabase for the current user. */
export async function importLegacyIfNeeded(userId: string): Promise<number> {
  if (typeof window === "undefined") return 0;
  const flagKey = IMPORT_FLAG_PREFIX + userId;
  if (localStorage.getItem(flagKey)) return 0;
  const legacy = readLegacyLocal();
  if (legacy.length === 0) {
    localStorage.setItem(flagKey, "1");
    return 0;
  }
  const rows = legacy.map((a) => ({
    user_id: userId,
    name: a.name,
    cover: a.cover ?? null,
    seasons: a.seasons ?? [],
    upcoming: a.upcoming ?? null,
  }));
  const { error } = await supabase.from("animes").insert(rows);
  if (error) throw error;
  localStorage.setItem(flagKey, "1");
  return rows.length;
}

export type CreateAnimeInput = {
  name: string;
  cover?: string;
  malId?: number | null;
  imageUrl?: string | null;
  malScore?: number | null;
  seasons?: Season[];
  genres?: string[] | null;
  tier?: Tier | null;
  watched?: boolean;
};

export async function createAnime(input: CreateAnimeInput): Promise<Anime> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("animes")
    .insert({
      user_id: userId,
      name: input.name,
      cover: input.cover ?? null,
      seasons: input.seasons ?? [],
      upcoming: null,
      watched: input.watched ?? false,
      mal_id: input.malId ?? null,
      image_url: input.imageUrl ?? null,
      mal_score: input.malScore ?? null,
      tier: input.tier ?? null,
      tier_position: null,
      last_checked_at: null,
      genres: input.genres ?? null,
    })
    .select(
      "id, name, cover, seasons, upcoming, watched, mal_id, image_url, mal_score, tier, tier_position, last_checked_at, genres",
    )
    .single();
  if (error) throw error;
  return rowToAnime(data as DbRow);
}

export async function updateTier(id: string, tier: Tier | null): Promise<void> {
  const { error } = await supabase
    .from("animes")
    .update({ tier, tier_position: null })
    .eq("id", id);
  if (error) throw error;
}

/** Persist manual positions inside tier rows. One update per entry. */
export async function updateTierPositions(
  entries: Array<{ id: string; tierPosition: number | null }>,
): Promise<void> {
  await Promise.all(
    entries.map(async ({ id, tierPosition }) => {
      const { error } = await supabase
        .from("animes")
        .update({ tier_position: tierPosition })
        .eq("id", id);
      if (error) throw error;
    }),
  );
}

export async function setWatched(id: string, watched: boolean): Promise<void> {
  const { error } = await supabase.from("animes").update({ watched }).eq("id", id);
  if (error) throw error;
}

export async function deleteAnime(id: string): Promise<void> {
  const { error } = await supabase.from("animes").delete().eq("id", id);
  if (error) throw error;
}

export async function updateAnime(
  id: string,
  patch: { name?: string; cover?: string | null },
): Promise<void> {
  const update: { name?: string; cover?: string | null } = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.cover !== undefined) update.cover = patch.cover;
  const { error } = await supabase.from("animes").update(update).eq("id", id);
  if (error) throw error;
}

export async function updateAnimeMeta(
  id: string,
  meta: {
    malId?: number | null;
    imageUrl?: string | null;
    malScore?: number | null;
    genres?: string[] | null;
  },
): Promise<void> {
  const update: {
    mal_id?: number | null;
    image_url?: string | null;
    mal_score?: number | null;
    genres?: string[] | null;
  } = {};
  if (meta.malId !== undefined) update.mal_id = meta.malId;
  if (meta.imageUrl !== undefined) update.image_url = meta.imageUrl;
  if (meta.malScore !== undefined) update.mal_score = meta.malScore;
  if (meta.genres !== undefined) update.genres = meta.genres;
  const { error } = await supabase.from("animes").update(update).eq("id", id);
  if (error) throw error;
}

export async function updateSeasons(id: string, seasons: Season[]): Promise<void> {
  const { error } = await supabase.from("animes").update({ seasons }).eq("id", id);
  if (error) throw error;
}

export async function updateUpcoming(id: string, upcoming: UpcomingSeason | null): Promise<void> {
  const { error } = await supabase.from("animes").update({ upcoming }).eq("id", id);
  if (error) throw error;
}

export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Arithmetic mean of MAL scores across seasons. OVAs excluded. null if none. */
export function mediaMAL(seasons: Season[]): number | null {
  const scored = seasons.filter(
    (s): s is Season & { malScore: number } =>
      typeof s.malScore === "number" && !isExcludedFromAverage(s),
  );
  if (scored.length === 0) return null;
  return scored.reduce((s, x) => s + x.malScore, 0) / scored.length;
}

export function rankColor(avg: number) {
  if (avg >= 9) return "text-primary";
  if (avg >= 7) return "text-foreground";
  if (avg >= 5) return "text-muted-foreground";
  return "text-destructive";
}

export function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ms = target.getTime() - today.getTime();
  return Math.round(ms / 86400000);
}

export function formatReleaseLabel(dateStr?: string): string {
  const d = daysUntil(dateStr);
  if (d === null) return "";
  if (d === 0) return "Hoje";
  if (d === 1) return "Amanhã";
  if (d > 1) return `Em ${d} dias`;
  if (d === -1) return "Ontem";
  return `Há ${Math.abs(d)} dias`;
}

export function formatDateBR(dateStr?: string, { year = true }: { year?: boolean } = {}): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    ...(year ? { year: "numeric" } : {}),
  });
}

/** Premieres stay in the "Em breve" strip for this many days after release. */
export const UPCOMING_RECENT_DAYS = 7;

export type UpcomingStripItem = { anime: Anime; upcoming: UpcomingSeason; days: number };

/** Scheduled seasons for the "Em breve" strip: valid date, released at most UPCOMING_RECENT_DAYS ago, soonest first. */
export function selectUpcomingStrip(animes: Anime[]): UpcomingStripItem[] {
  const items: UpcomingStripItem[] = [];
  for (const anime of animes) {
    const upcoming = anime.upcoming;
    const days = daysUntil(upcoming?.releaseDate);
    if (!upcoming || days === null || days < -UPCOMING_RECENT_DAYS) continue;
    items.push({ anime, upcoming, days });
  }
  return items.sort((a, b) => a.days - b.days);
}

export async function updateLastCheckedAt(id: string, iso: string): Promise<void> {
  const { error } = await supabase.from("animes").update({ last_checked_at: iso }).eq("id", id);
  if (error) throw error;
}

export function formatLastChecked(iso?: string | null): string {
  if (!iso) return "Nunca verificado";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.floor(h / 24);
  if (days === 1) return "ontem";
  if (days <= 30) return `há ${days} dias`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

/** Distinct genres across animes with how many animes have each. */
export function allGenres(animes: Anime[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const a of animes) {
    if (!Array.isArray(a.genres)) continue;
    for (const g of new Set(a.genres)) {
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name));
}
