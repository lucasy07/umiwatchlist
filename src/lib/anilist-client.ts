// AniList GraphQL client: banner for the detail dialog and a second season provider
// (sequel chain and premiere status by MAL id) shaped like the Jikan chain output.

import {
  MAX_CHAIN_ENTRIES,
  releaseFromParts,
  sortChainSeasons,
  type BuildChainOptions,
  type ChainReport,
  type ChainSeason,
} from "@/lib/jikan-chain";

const ANILIST_URL = "https://graphql.anilist.co";
/**
 * AniList allows 30 requests/min (degraded from 90). Counting request starts, retries included,
 * 28 leaves room for network jitter: the server counts arrivals, not our departures.
 */
const MAX_PER_WINDOW = 28;
const WINDOW_MS = 60_000;
/** A burst of ~20 parallel requests already trips AniList's burst limiter; 1/s never does. */
const MIN_GAP_MS = 1_000;
/** 1 + 3 retries on 429/5xx; 5xx waits 2s, 4s, 8s. */
const MAX_ATTEMPTS = 4;
const BACKOFF_BASE_MS = 2_000;
/**
 * A 429 blocks the client for about a minute. Retry-After is not CORS-exposed (unreadable in the
 * browser) and burst-limit 429s carry none, so X-RateLimit-Reset and then 60s are the fallbacks.
 */
const BLOCK_DEFAULT_MS = 60_000;
const BLOCK_MAX_MS = 90_000;
/** AniList's largest `perPage`. */
const PAGE_SIZE = 50;

export type AnilistPriority = "interactive" | "background";

type QueryOptions = {
  priority: AnilistPriority;
  signal?: AbortSignal;
  maxAttempts: number;
};

type SlotWaiter = {
  priority: AnilistPriority;
  grant: () => void;
};

/** Requests waiting to start (first attempt or retry), in arrival order. */
const slotWaiters: SlotWaiter[] = [];
/** Start times of the requests inside the rate-limit window. */
const requestStarts: number[] = [];
let blockedUntil = 0;
let pumpTimer: ReturnType<typeof setTimeout> | null = null;

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

function isAbortError(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === "AbortError";
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function msUntilNextSlot(now: number): number {
  while (requestStarts.length > 0 && requestStarts[0] <= now - WINDOW_MS) requestStarts.shift();
  let wait = Math.max(0, blockedUntil - now);
  const last = requestStarts[requestStarts.length - 1];
  if (last !== undefined) wait = Math.max(wait, last + MIN_GAP_MS - now);
  if (requestStarts.length >= MAX_PER_WINDOW) {
    wait = Math.max(wait, requestStarts[requestStarts.length - MAX_PER_WINDOW] + WINDOW_MS - now);
  }
  return wait;
}

/** Hands out free slots, interactive requests first, and reschedules itself while waiting. */
function pumpSlots(): void {
  if (pumpTimer !== null) {
    clearTimeout(pumpTimer);
    pumpTimer = null;
  }
  while (slotWaiters.length > 0) {
    const now = Date.now();
    const wait = msUntilNextSlot(now);
    if (wait > 0) {
      pumpTimer = setTimeout(pumpSlots, wait);
      return;
    }
    const interactiveIndex = slotWaiters.findIndex((waiter) => waiter.priority === "interactive");
    const [waiter] = slotWaiters.splice(Math.max(interactiveIndex, 0), 1);
    requestStarts.push(now);
    waiter.grant();
  }
}

function acquireRequestSlot(priority: AnilistPriority, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      const index = slotWaiters.indexOf(waiter);
      if (index >= 0) slotWaiters.splice(index, 1);
      reject(abortError());
    };
    const waiter: SlotWaiter = {
      priority,
      grant: () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      },
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    slotWaiters.push(waiter);
    pumpSlots();
  });
}

/** Retry-After in seconds or as an HTTP date; null when absent or unparseable. */
function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

/** How long a 429 blocks the client: Retry-After, else X-RateLimit-Reset (epoch s), else 60s. */
function blockMs(response: Response): number {
  const retryAfter = parseRetryAfterMs(response.headers.get("Retry-After"));
  if (retryAfter !== null) return Math.min(retryAfter, BLOCK_MAX_MS);
  const reset = Number(response.headers.get("X-RateLimit-Reset") ?? "");
  if (reset > 0) return Math.min(Math.max(0, reset * 1000 - Date.now()), BLOCK_MAX_MS);
  return BLOCK_DEFAULT_MS;
}

type GraphqlResponse<T> = {
  data?: T | null;
  errors?: Array<{ message?: string } | null> | null;
} | null;

/**
 * POSTs a query through the shared limiter. Resolves with `data` (null when absent; 404 is how
 * AniList answers a missing `Media`), rejects on GraphQL `errors`, non-transient statuses,
 * network errors and exhausted retries. Aborts reject with AbortError.
 */
async function anilistQuery<T>(
  query: string,
  variables: Record<string, unknown>,
  { priority, signal, maxAttempts }: QueryOptions,
): Promise<T | null> {
  let lastError = new Error("AniList error");
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await acquireRequestSlot(priority, signal);
    let response: Response;
    try {
      response = await fetch(ANILIST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, variables }),
        signal,
      });
      if (response.ok || response.status === 404) {
        const json = (await response.json()) as GraphqlResponse<T>;
        if (response.ok && json?.errors && json.errors.length > 0) {
          throw new Error(json.errors[0]?.message ?? "AniList GraphQL error");
        }
        return json?.data ?? null;
      }
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) throw abortError();
      throw error instanceof Error ? error : new Error("AniList error");
    }

    const error = new Error(String(response.status));
    const transient = response.status === 429 || response.status >= 500;
    if (!transient) throw error;
    lastError = error;
    let delay = BACKOFF_BASE_MS * 2 ** attempt;
    if (response.status === 429) {
      // The server blocks the whole client, not just this request: hold every request.
      delay = Math.max(delay, blockMs(response));
      blockedUntil = Math.max(blockedUntil, Date.now() + delay);
    }
    if (attempt === maxAttempts - 1) break;
    await abortableDelay(delay, signal);
  }
  throw lastError;
}

const BANNER_QUERY = `query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { bannerImage } }`;

/** Banner horizontal do AniList para um anime do MAL, ou null se não houver ou der erro. */
export async function fetchAnilistBanner(
  malId: number,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    // Decorative: one attempt, ahead of the season checks.
    const data = await anilistQuery<{ Media?: { bannerImage?: unknown } | null }>(
      BANNER_QUERY,
      { idMal: malId },
      { priority: "interactive", signal, maxAttempts: 1 },
    );
    const banner = data?.Media?.bannerImage;
    return typeof banner === "string" && banner.trim() !== "" ? banner : null;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}

export type AnilistMedia = {
  id: number;
  idMal?: number | null;
  type?: string | null;
  format?: string | null;
  status?: string | null;
  seasonYear?: number | null;
  episodes?: number | null;
  /** Minutes per episode. */
  duration?: number | null;
  startDate?: { year?: number | null; month?: number | null; day?: number | null } | null;
  title?: { romaji?: string | null } | null;
  coverImage?: { extraLarge?: string | null; large?: string | null } | null;
  relations?: {
    edges?: Array<{ relationType?: string | null; node?: AnilistMedia | null } | null> | null;
  } | null;
};

/** AniList format → Jikan type; MUSIC and unknown formats are left out, as in KEEP_TYPES. */
const FORMAT_TYPE = new Map([
  ["TV", "TV"],
  ["TV_SHORT", "TV"],
  ["MOVIE", "Movie"],
  ["OVA", "OVA"],
  ["ONA", "ONA"],
  ["SPECIAL", "Special"],
]);

/** AniList status → Jikan status string, so `isNotYetAired` reads it unchanged. */
const STATUS_TEXT = new Map([
  ["NOT_YET_RELEASED", "Not yet aired"],
  ["RELEASING", "Currently Airing"],
  ["HIATUS", "Currently Airing"],
  ["FINISHED", "Finished Airing"],
]);

const positiveOrNull = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;

/**
 * AniList media → ChainSeason, or null when it can't be one: no MAL id (no dedupe in the app),
 * MUSIC/unknown format, CANCELLED/unknown status, no title. Score and genres stay empty: AniList
 * uses another scale and vocabulary.
 */
export function chainSeasonFromAnilist(media: AnilistMedia): ChainSeason | null {
  const malId = positiveOrNull(media.idMal);
  const type = FORMAT_TYPE.get(media.format ?? "");
  const status = STATUS_TEXT.get(media.status ?? "");
  const title = media.title?.romaji?.trim();
  if (malId === null || !type || !status || !title) return null;
  const date = media.startDate;
  return {
    malId,
    title,
    year: media.seasonYear ?? date?.year ?? null,
    malScore: null,
    // The s4.anilist.co CDN mirrors the Origin in Access-Control-Allow-Origin (checked from
    // umiwatchlist.lovable.app); the tierlist image export draws these covers and depends on it.
    imageUrl: media.coverImage?.extraLarge ?? media.coverImage?.large ?? null,
    type,
    status,
    airedFrom: null,
    ...releaseFromParts({
      year: date?.year ?? null,
      month: date?.month ?? null,
      day: date?.day ?? null,
    }),
    genres: [],
    episodes: positiveOrNull(media.episodes),
    durationMin: positiveOrNull(media.duration),
  };
}

const MEDIA_FIELDS =
  "id idMal type format status seasonYear episodes duration startDate { year month day } title { romaji } coverImage { extraLarge large }";
/**
 * Two relation levels: AniList answers deeper levels with empty `edges` (no error), so
 * second-level nodes are a frontier still to expand, never "no relations".
 */
const CHAIN_SELECTION = `${MEDIA_FIELDS} relations { edges { relationType node { ${MEDIA_FIELDS} relations { edges { relationType node { ${MEDIA_FIELDS} } } } } } }`;
const CHAIN_ROOT_QUERY = `query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { ${CHAIN_SELECTION} } }`;
const CHAIN_FRONTIER_QUERY = `query ($ids: [Int]) { Page(page: 1, perPage: ${PAGE_SIZE}) { media(id_in: $ids, type: ANIME) { ${CHAIN_SELECTION} } } }`;
const SEASONS_BY_MAL_QUERY = `query ($idMals: [Int]) { Page(page: 1, perPage: ${PAGE_SIZE}) { media(idMal_in: $idMals, type: ANIME) { ${MEDIA_FIELDS} } } }`;

const CHAIN_RELATIONS = new Set(["SEQUEL", "PREQUEL"]);

function chainNeighbours(media: AnilistMedia): AnilistMedia[] {
  const neighbours: AnilistMedia[] = [];
  for (const edge of media.relations?.edges ?? []) {
    const node = edge?.node;
    if (node && node.type === "ANIME" && CHAIN_RELATIONS.has(edge.relationType ?? "")) {
      neighbours.push(node);
    }
  }
  return neighbours;
}

/**
 * Season chain for a MAL id from AniList's SEQUEL/PREQUEL graph, as a ChainReport like
 * `buildChainDetailed`: each request expands two hops, and the frontier left after it goes in one
 * `Page(id_in)` request. Nodes are deduped by AniList id and walked even when they can't become a
 * season (no MAL id, MUSIC...), so the chain stays connected. A failed request leaves its nodes
 * unexpanded and is counted; only AbortError rejects. A missing `Media` is an empty chain.
 */
export async function buildAnilistChain(
  rootMalId: number,
  signal?: AbortSignal,
  options?: BuildChainOptions,
): Promise<ChainReport> {
  let requests = 0;
  let failedRequests = 0;
  /** Collected anime by AniList id, in discovery order. */
  const nodes = new Map<number, AnilistMedia>();
  /** Nodes whose own relations were read (not cut by the nesting limit). */
  const expanded = new Set<number>();
  const queryOptions: QueryOptions = { priority: "background", signal, maxAttempts: MAX_ATTEMPTS };

  const collect = (media: AnilistMedia): boolean => {
    if (nodes.has(media.id)) return true;
    if (nodes.size >= MAX_CHAIN_ENTRIES) return false;
    nodes.set(media.id, media);
    return true;
  };
  // `media` and its first-level neighbours carry real relations; second-level ones don't.
  const expand = (media: AnilistMedia) => {
    if (!collect(media)) return;
    expanded.add(media.id);
    for (const neighbour of chainNeighbours(media)) {
      if (!collect(neighbour) || expanded.has(neighbour.id)) continue;
      expanded.add(neighbour.id);
      for (const next of chainNeighbours(neighbour)) collect(next);
    }
  };
  const failed = (error: unknown) => {
    if (isAbortError(error) || signal?.aborted) throw abortError();
    failedRequests += 1;
  };

  requests += 1;
  try {
    const data = await anilistQuery<{ Media?: AnilistMedia | null }>(
      CHAIN_ROOT_QUERY,
      { idMal: rootMalId },
      queryOptions,
    );
    if (data?.Media) expand(data.Media);
  } catch (error) {
    failed(error);
  }

  while (nodes.size < MAX_CHAIN_ENTRIES) {
    const frontier = [...nodes.keys()].filter((id) => !expanded.has(id)).slice(0, PAGE_SIZE);
    if (frontier.length === 0) break;
    requests += 1;
    try {
      const data = await anilistQuery<{ Page?: { media?: Array<AnilistMedia | null> | null } }>(
        CHAIN_FRONTIER_QUERY,
        { ids: frontier },
        queryOptions,
      );
      for (const media of data?.Page?.media ?? []) if (media) expand(media);
    } catch (error) {
      failed(error);
    }
    // Missing from the answer or failed: give up on these instead of asking forever.
    for (const id of frontier) expanded.add(id);
    if (signal?.aborted) throw abortError();
  }

  const known = options?.knownMalIds;
  const seen = new Set<number>();
  const seasons: ChainSeason[] = [];
  for (const media of nodes.values()) {
    const season = chainSeasonFromAnilist(media);
    if (!season || seen.has(season.malId) || known?.has(season.malId)) continue;
    seen.add(season.malId);
    seasons.push(season);
  }
  return {
    seasons: sortChainSeasons(seasons),
    requests,
    failedRequests,
    truncated: nodes.size >= MAX_CHAIN_ENTRIES,
  };
}

/**
 * Current premiere status (status, date with precision, cover...) of each MAL id, in
 * `Page(idMal_in)` blocks of 50. Ids AniList doesn't have, or that can't be a season (CANCELLED,
 * MUSIC...), get no entry. Rejects with the final error of any failed block.
 */
export async function fetchAnilistSeasonsByMalId(
  malIds: number[],
  signal?: AbortSignal,
): Promise<Map<number, ChainSeason>> {
  const ids = [...new Set(malIds.filter((id) => Number.isInteger(id) && id > 0))];
  const result = new Map<number, ChainSeason>();
  for (let i = 0; i < ids.length; i += PAGE_SIZE) {
    const block = ids.slice(i, i + PAGE_SIZE);
    const data = await anilistQuery<{ Page?: { media?: Array<AnilistMedia | null> | null } }>(
      SEASONS_BY_MAL_QUERY,
      { idMals: block },
      { priority: "background", signal, maxAttempts: MAX_ATTEMPTS },
    );
    for (const media of data?.Page?.media ?? []) {
      const season = media ? chainSeasonFromAnilist(media) : null;
      if (season && block.includes(season.malId)) result.set(season.malId, season);
    }
  }
  return result;
}
