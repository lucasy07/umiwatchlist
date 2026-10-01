import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type JikanClient = typeof import("./jikan-client");

type Call = { path: string; at: number };

let client: JikanClient;
let calls: Call[];
let respond: (path: string, attempt: number) => Response;

function ok(path: string): Response {
  return new Response(JSON.stringify({ data: { mal_id: 1, title: path } }), { status: 200 });
}

function status(code: number, headers?: Record<string, string>): Response {
  return new Response(null, { status: code, headers });
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  calls = [];
  respond = ok;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = url.replace("https://api.jikan.moe/v4", "");
      const attempt = calls.filter((call) => call.path === path).length;
      calls.push({ path, at: Date.now() });
      return respond(path, attempt);
    }),
  );
  // Fresh module per test: queue and rate-limit window are module state.
  vi.resetModules();
  client = await import("./jikan-client");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("jikanFetch: rate limit", () => {
  it("nunca passa de 3 inícios em 1 s nem de 60 em 60 s", async () => {
    const results = Array.from({ length: 70 }, (_, i) => client.jikanFetch(`/anime/${i}`));
    await vi.advanceTimersByTimeAsync(120_000);
    await Promise.all(results);

    const starts = calls.map((call) => call.at);
    expect(starts).toHaveLength(70);
    for (let i = 0; i + 3 < starts.length; i++) {
      expect(starts[i + 3] - starts[i]).toBeGreaterThanOrEqual(1_000);
    }
    for (let i = 0; i + 60 < starts.length; i++) {
      expect(starts[i + 60] - starts[i]).toBeGreaterThanOrEqual(60_000);
    }
    // Sem frear além do necessário: as 3 primeiras saem na hora.
    expect(starts.slice(0, 3)).toEqual([0, 0, 0]);
  });

  it("interactive fura a fila de background", async () => {
    const background = Array.from({ length: 6 }, (_, i) => client.jikanFetch(`/anime/${i}`));
    const search = client.jikanFetch("/anime?q=frieren", { priority: "interactive" });
    await vi.advanceTimersByTimeAsync(5_000);
    await Promise.all([...background, search]);

    expect(calls.map((call) => call.path).slice(0, 4)).toEqual([
      "/anime/0",
      "/anime/1",
      "/anime/2",
      "/anime?q=frieren",
    ]);
  });
});

describe("jikanFetch: retry", () => {
  it("429 sem Retry-After espera o backoff e tenta de novo", async () => {
    respond = (path, attempt) => (attempt === 0 ? status(429) : ok(path));
    const result = client.getJikanAnime(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    await expect(result).resolves.toMatchObject({ title: "/anime/1" });
  });

  it("429 com Retry-After respeita o tempo pedido", async () => {
    respond = (path, attempt) => (attempt === 0 ? status(429, { "Retry-After": "5" }) : ok(path));
    const result = client.getJikanAnime(1);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    expect(calls[1].at - calls[0].at).toBe(5_000);
    await expect(result).resolves.toMatchObject({ title: "/anime/1" });
  });

  it("429 segura as outras requisições até liberar", async () => {
    respond = (path, attempt) =>
      path === "/anime/1" && attempt === 0 ? status(429, { "Retry-After": "3" }) : ok(path);
    const first = client.getJikanAnime(1);
    await vi.advanceTimersByTimeAsync(10);
    const second = client.getJikanAnime(2);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls.map((call) => call.path)).toEqual(["/anime/1"]);
    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.all([first, second]);
    expect(calls.every((call) => call.at === 0 || call.at >= 3_000)).toBe(true);
  });

  it("504 seguido de sucesso devolve o dado", async () => {
    respond = (path, attempt) => (attempt === 0 ? status(504) : ok(path));
    const result = client.getJikanAnime(7);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(result).resolves.toMatchObject({ mal_id: 1, title: "/anime/7" });
    expect(calls).toHaveLength(2);
  });

  it("esgotar as tentativas lança o último erro", async () => {
    respond = () => status(503);
    const result = expect(client.getJikanAnime(1)).rejects.toThrow("503");
    await vi.runAllTimersAsync();

    await result;
    expect(calls).toHaveLength(6);
    // Backoff exponencial: 1, 2, 4, 8, 16 s.
    const gaps = calls.slice(1).map((call, i) => call.at - calls[i].at);
    expect(gaps).toEqual([1_000, 2_000, 4_000, 8_000, 16_000]);
  });

  it("abort durante o backoff rejeita com AbortError na hora", async () => {
    respond = () => status(500);
    const controller = new AbortController();
    const result = client.getJikanAnime(1, { signal: controller.signal });
    const settled = result.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10);
    expect(calls).toHaveLength(1);

    controller.abort();
    expect(await settled).toMatchObject({ name: "AbortError" });
    await vi.runAllTimersAsync();
    expect(calls).toHaveLength(1);
  });

  it("404 falha sem repetir", async () => {
    respond = () => status(404);
    const result = expect(client.getJikanAnime(1)).rejects.toThrow("404");
    await vi.runAllTimersAsync();

    await result;
    expect(calls).toHaveLength(1);
  });
});

describe("jikanFetch: deduplicação", () => {
  it("mesma rota em andamento compartilha uma requisição", async () => {
    const [a, b] = [client.getJikanAnime(3), client.getJikanAnime(3, { priority: "interactive" })];
    await vi.advanceTimersByTimeAsync(0);

    expect(await a).toEqual(await b);
    expect(calls).toHaveLength(1);
  });
});
