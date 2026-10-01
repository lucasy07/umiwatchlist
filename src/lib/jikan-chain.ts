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

export type DateParts = { year: number | null; month: number | null; day: number | null };

/** Premiere date from calendar parts (any may be null): ISO padded to the first unknown part. */
export function releaseFromParts(parts: DateParts | null | undefined): {
  releaseDate: string | null;
  releasePrecision: ReleasePrecision | null;
} {
  const { year, month, day } = parts ?? { year: null, month: null, day: null };
  if (year == null) return { releaseDate: null, releasePrecision: null };
  if (month == null) return { releaseDate: `${year}-01-01`, releasePrecision: "year" };
  if (day == null) return { releaseDate: `${year}-${pad(month)}-01`, releasePrecision: "month" };
  return { releaseDate: `${year}-${pad(month)}-${pad(day)}`, releasePrecision: "day" };
}

/**
 * Premiere date from Jikan's `aired`. Built from `prop.from` parts, never from the UTC
 * `aired.from`; that one is only a fallback (with unknown precision) when `prop` is missing.
 */
export function deriveReleaseDate(aired: JikanAnimeDetails["aired"]): {
  releaseDate: string | null;
  releasePrecision: ReleasePrecision | null;
} {
  const parts = aired?.prop?.from;
  if (parts) return releaseFromParts(parts);
  const fallback = aired?.from?.slice(0, 10);
  return { releaseDate: isValidIsoDate(fallback) ? fallback : null, releasePrecision: null };
}

const KEEP_TYPES = new Set(["TV", "ONA", "Movie", "OVA", "Special", "TV Special"]);
/** Most entries a chain walk collects; reaching it marks the chain as truncated. */
export const MAX_CHAIN_ENTRIES = 25;

function isAbortError(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === "AbortError";
}

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

async function getDetails(malId: number, signal?: AbortSignal): Promise<JikanAnimeDetails> {
  return getJikanAnime(malId, { signal, priority: "background" });
}

/** Chain order: by year (unknown last), then by malId. Sorts in place. */
export function sortChainSeasons(seasons: ChainSeason[]): ChainSeason[] {
  return seasons.sort((a, b) => {
    const ay = a.year ?? Number.POSITIVE_INFINITY;
    const by = b.year ?? Number.POSITIVE_INFINITY;
    if (ay !== by) return ay - by;
    return a.malId - b.malId;
  });
}

export type ChainProgress = {
  current: number;
  total: number;
};

export type BuildChainOptions = {
  knownMalIds?: Set<number>;
};

/** Chain plus how trustworthy it is: failed requests and whether MAX_CHAIN_ENTRIES cut the walk. */
export type ChainReport = {
  seasons: ChainSeason[];
  requests: number;
  failedRequests: number;
  truncated: boolean;
};

/**
 * Build the season chain for a given malId by walking Sequel/Prequel
 * relations recursively. Sequential requests with rate-limit delay.
 *
 * Returns seasons of type TV/ONA, sorted by year ascending.
 * A failed request leaves its node out instead of failing the chain; the report counts it.
 */
export async function buildChainDetailed(
  rootMalId: number,
  onProgress?: (p: ChainProgress) => void,
  signal?: AbortSignal,
  options?: BuildChainOptions,
): Promise<ChainReport> {
  let requests = 0;
  let failedRequests = 0;
  const visited = new Set<number>([rootMalId]);
  const queue: number[] = [rootMalId];
  const idsToFetch: number[] = [];

  // Discovery phase: BFS the relation graph collecting unique ids.
  while (queue.length > 0 && idsToFetch.length < MAX_CHAIN_ENTRIES) {
    const id = queue.shift()!;
    idsToFetch.push(id);
    if (idsToFetch.length >= MAX_CHAIN_ENTRIES) break;
    requests += 1;
    try {
      const related = await getRelations(id, signal);
      for (const r of related) {
        if (visited.has(r)) continue;
        if (visited.size >= MAX_CHAIN_ENTRIES) break;
        visited.add(r);
        queue.push(r);
      }
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) throw new DOMException("Aborted", "AbortError");
      failedRequests += 1;
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
    requests += 1;
    let d: JikanAnimeDetails | null = null;
    try {
      d = await getDetails(id, signal);
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) throw new DOMException("Aborted", "AbortError");
      failedRequests += 1;
    }
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

  return {
    seasons: sortChainSeasons(seasons),
    requests,
    failedRequests,
    truncated: idsToFetch.length >= MAX_CHAIN_ENTRIES,
  };
}

/** Season chain only, for callers that don't care whether it is complete. */
export async function buildChain(
  rootMalId: number,
  onProgress?: (p: ChainProgress) => void,
  signal?: AbortSignal,
  options?: BuildChainOptions,
): Promise<ChainSeason[]> {
  return (await buildChainDetailed(rootMalId, onProgress, signal, options)).seasons;
}
