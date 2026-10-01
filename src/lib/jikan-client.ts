const JIKAN_BASE_URL = "https://api.jikan.moe/v4";
const MIN_REQUEST_GAP_MS = 400;
const BACKOFF_MS = [700, 1400] as const;

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
  started: boolean;
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

const interactiveQueue: QueueTask[] = [];
const backgroundQueue: QueueTask[] = [];
const inFlight = new Map<string, QueueTask>();
let processing = false;
let lastRequestEndedAt = 0;

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

async function waitForRequestGap(signal: AbortSignal): Promise<void> {
  const remaining = MIN_REQUEST_GAP_MS - (Date.now() - lastRequestEndedAt);
  if (remaining > 0) await abortableDelay(remaining, signal);
}

async function executeRequest<T>(path: string, signal: AbortSignal): Promise<T> {
  let lastError: Error = new Error("Jikan error");
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal.aborted) throw abortError();
    await waitForRequestGap(signal);
    let response: Response;
    try {
      response = await fetch(`${JIKAN_BASE_URL}${path}`, { signal });
    } catch (error) {
      lastRequestEndedAt = Date.now();
      if (isAbortError(error) || signal.aborted) throw abortError();
      throw error instanceof Error ? error : new Error("Jikan error");
    }
    lastRequestEndedAt = Date.now();

    if (response.ok) return (await response.json()) as T;
    const error = new Error(String(response.status));
    const transient = response.status === 429 || response.status >= 500;
    if (!transient) throw error;
    lastError = error;

    if (attempt < BACKOFF_MS.length) {
      await abortableDelay(BACKOFF_MS[attempt], signal);
    }
  }
  throw lastError;
}

function removePendingTask(task: QueueTask): void {
  const queue = task.priority === "interactive" ? interactiveQueue : backgroundQueue;
  const index = queue.indexOf(task);
  if (index >= 0) queue.splice(index, 1);
}

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    while (interactiveQueue.length > 0 || backgroundQueue.length > 0) {
      const task = interactiveQueue.shift() ?? backgroundQueue.shift();
      if (!task) continue;
      if (task.controller.signal.aborted || task.consumers === 0) {
        task.reject(abortError());
        continue;
      }
      task.started = true;
      try {
        task.resolve(await executeRequest(task.path, task.controller.signal));
      } catch (error) {
        task.reject(error);
      }
    }
  } finally {
    processing = false;
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
    started: false,
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
        if (!task.started) removePendingTask(task);
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
    if (!existing.started && priority === "interactive" && existing.priority === "background") {
      removePendingTask(existing);
      existing.priority = "interactive";
      interactiveQueue.push(existing);
    }
    return attachConsumer(existing, opts.signal);
  }

  if (opts.signal?.aborted) return Promise.reject(abortError());
  const task = createTask(path, priority);
  inFlight.set(path, task);
  (priority === "interactive" ? interactiveQueue : backgroundQueue).push(task);
  const result = attachConsumer(task, opts.signal);
  void processQueue();
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
