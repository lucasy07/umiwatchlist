const JIKAN_BASE_URL = "https://api.jikan.moe/v4";
/** Jikan's documented limits, counted on the start of every request (retries included). */
const RATE_LIMITS = [
  { max: 3, windowMs: 1_000 },
  { max: 60, windowMs: 60_000 },
] as const;
/** 1 + 5 retries with 1s, 2s, 4s, 8s, 16s backoff: ~31s before giving up on 429/5xx. */
const MAX_ATTEMPTS = 6;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 16_000;
/** Retry-After is honoured up to Jikan's per-minute window. */
const RETRY_AFTER_MAX_MS = 60_000;

export type JikanPriority = "interactive" | "background";

export type JikanFetchOptions = {
  signal?: AbortSignal;
  priority?: JikanPriority;
};

export type JikanAnimeDetails = {
  mal_id: number;
  title: string;
  type: string | null;
  status: string | null;
  year: number | null;
  score: number | null;
  aired?: {
    from?: string | null;
    /** Date parts in MAL's own calendar (no timezone shift); any part may be null. */
    prop?: {
      from?: { day: number | null; month: number | null; year: number | null } | null;
    } | null;
  } | null;
  episodes?: number | null;
  duration?: string | null;
  images?: {
    jpg?: {
      small_image_url?: string;
      image_url?: string;
      large_image_url?: string;
    };
  };
  genres?: Array<{ name: string }> | null;
};

export type JikanRelation = {
  relation: string;
  entry: Array<{ mal_id: number; type: string }>;
};

export type JikanSearchResult = JikanAnimeDetails;

type QueueTask = {
  path: string;
  priority: JikanPriority;
  controller: AbortController;
  consumers: number;
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

type SlotWaiter = {
  task: QueueTask;
  grant: () => void;
};

const inFlight = new Map<string, QueueTask>();
/** Tasks waiting to start a request (first attempt or retry), in arrival order. */
const slotWaiters: SlotWaiter[] = [];
/** Start times of the requests inside the longest rate-limit window. */
const requestStarts: number[] = [];
let blockedUntil = 0;
let pumpTimer: ReturnType<typeof setTimeout> | null = null;

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

function isAbortError(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === "AbortError";
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function msUntilNextSlot(now: number): number {
  const longestWindow = Math.max(...RATE_LIMITS.map((limit) => limit.windowMs));
  while (requestStarts.length > 0 && requestStarts[0] <= now - longestWindow) {
    requestStarts.shift();
  }
  let wait = Math.max(0, blockedUntil - now);
  for (const { max, windowMs } of RATE_LIMITS) {
    const inWindow = requestStarts.filter((startedAt) => startedAt > now - windowMs);
    if (inWindow.length >= max) {
      wait = Math.max(wait, inWindow[inWindow.length - max] + windowMs - now);
    }
  }
  return wait;
}

/** Hands out free slots, interactive tasks first, and reschedules itself while the window is full. */
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
    const interactiveIndex = slotWaiters.findIndex(
      (waiter) => waiter.task.priority === "interactive",
    );
    const [waiter] = slotWaiters.splice(Math.max(interactiveIndex, 0), 1);
    requestStarts.push(now);
    waiter.grant();
  }
}

function acquireRequestSlot(task: QueueTask): Promise<void> {
  const { signal } = task.controller;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      const index = slotWaiters.indexOf(waiter);
      if (index >= 0) slotWaiters.splice(index, 1);
      reject(abortError());
    };
    const waiter: SlotWaiter = {
      task,
      grant: () => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      },
    };
    signal.addEventListener("abort", onAbort, { once: true });
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

function retryDelayMs(response: Response, attempt: number): number {
  const backoff = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_MAX_MS);
  const retryAfter = parseRetryAfterMs(response.headers.get("Retry-After"));
  if (retryAfter === null) return backoff;
  return Math.max(backoff, Math.min(retryAfter, RETRY_AFTER_MAX_MS));
}

async function executeRequest<T>(task: QueueTask): Promise<T> {
  const { signal } = task.controller;
  let lastError: Error = new Error("Jikan error");
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await acquireRequestSlot(task);
    let response: Response;
    try {
      response = await fetch(`${JIKAN_BASE_URL}${task.path}`, { signal });
    } catch (error) {
      if (isAbortError(error) || signal.aborted) throw abortError();
      throw error instanceof Error ? error : new Error("Jikan error");
    }

    if (response.ok) return (await response.json()) as T;
    const error = new Error(String(response.status));
    const transient = response.status === 429 || response.status >= 500;
    if (!transient) throw error;
    lastError = error;
    if (attempt === MAX_ATTEMPTS - 1) break;

    const delay = retryDelayMs(response, attempt);
    // A 429 means the whole client is over the limit: hold every request, not just this one.
    if (response.status === 429) blockedUntil = Math.max(blockedUntil, Date.now() + delay);
    await abortableDelay(delay, signal);
  }
  throw lastError;
}

async function runTask(task: QueueTask): Promise<void> {
  try {
    task.resolve(await executeRequest(task));
  } catch (error) {
    task.reject(error);
  }
}

function createTask(path: string, priority: JikanPriority): QueueTask {
  let resolvePromise: (value: unknown) => void = () => undefined;
  let rejectPromise: (reason: unknown) => void = () => undefined;
  const promise = new Promise<unknown>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  const task: QueueTask = {
    path,
    priority,
    controller: new AbortController(),
    consumers: 0,
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  };
  promise
    .finally(() => {
      if (inFlight.get(path) === task) inFlight.delete(path);
    })
    .catch(() => undefined);
  return task;
}

function attachConsumer<T>(task: QueueTask, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortError());
  task.consumers += 1;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return false;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      task.consumers -= 1;
      return true;
    };
    const onAbort = () => {
      if (!finish()) return;
      reject(abortError());
      if (task.consumers === 0) {
        task.controller.abort();
        task.reject(abortError());
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    task.promise.then(
      (value) => {
        if (finish()) resolve(value as T);
      },
      (error) => {
        if (finish()) reject(error);
      },
    );
  });
}

export function jikanFetch<T>(path: string, opts: JikanFetchOptions = {}): Promise<T> {
  const priority = opts.priority ?? "background";
  const existing = inFlight.get(path);
  if (existing) {
    // Waiting attempts (first or retry) read the priority when a slot frees up.
    if (priority === "interactive") existing.priority = "interactive";
    return attachConsumer(existing, opts.signal);
  }

  if (opts.signal?.aborted) return Promise.reject(abortError());
  const task = createTask(path, priority);
  inFlight.set(path, task);
  const result = attachConsumer(task, opts.signal);
  void runTask(task);
  return result as Promise<T>;
}

export async function getJikanAnime(
  malId: number,
  opts: JikanFetchOptions = {},
): Promise<JikanAnimeDetails> {
  const response = await jikanFetch<{ data: JikanAnimeDetails }>(`/anime/${malId}`, opts);
  return response.data;
}

export async function getJikanRelations(
  malId: number,
  opts: JikanFetchOptions = {},
): Promise<JikanRelation[]> {
  const response = await jikanFetch<{ data: JikanRelation[] }>(`/anime/${malId}/relations`, opts);
  return response.data ?? [];
}

export async function searchJikanAnime(
  query: string,
  limit: number,
  opts: JikanFetchOptions = {},
): Promise<JikanSearchResult[]> {
  const path = `/anime?q=${encodeURIComponent(query)}&limit=${limit}&sfw=true`;
  const response = await jikanFetch<{ data: JikanSearchResult[] }>(path, opts);
  return response.data ?? [];
}
