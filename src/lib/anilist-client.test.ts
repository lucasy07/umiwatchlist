import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnilistMedia } from "./anilist-client";
import { classifyChain } from "./scan-types";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

type AnilistClient = typeof import("./anilist-client");

type Call = { query: string; variables: Record<string, unknown>; at: number };

type FakeNode = {
  id: number;
  idMal?: number | null;
  type?: string;
  format?: string;
  status?: string;
  edges?: Array<[relationType: string, to: number]>;
};

let client: AnilistClient;
let calls: Call[];
let graph: Map<number, FakeNode>;
let respond: (call: Call, index: number) => Response;

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function mockFetch(impl: () => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

const idMalOf = (node: FakeNode) => (node.idMal === undefined ? 100 + node.id : node.idMal);

/** Media as AniList nests it: relations stop at the second level with empty `edges`. */
function toMedia(id: number, depth: number): AnilistMedia {
  const node = graph.get(id)!;
  return {
    id,
    idMal: idMalOf(node),
    type: node.type ?? "ANIME",
    format: node.format ?? "TV",
    status: node.status ?? "FINISHED",
    seasonYear: 2000 + id,
    episodes: 12,
    duration: 24,
    startDate: { year: 2000 + id, month: 4, day: 5 },
    title: { romaji: `Season ${id}` },
    coverImage: { extraLarge: `https://img/${id}-xl.jpg`, large: `https://img/${id}-l.jpg` },
    relations: {
      edges:
        depth < 2
          ? (node.edges ?? []).map(([relationType, to]) => ({
              relationType,
              node: toMedia(to, depth + 1),
            }))
          : [],
    },
  };
}

/** Answers like AniList for the three query shapes the client sends. */
function anilistServer(call: Call): Response {
  const { query, variables } = call;
  if (query.includes("id_in")) {
    const ids = variables.ids as number[];
    return jsonResponse({
      data: { Page: { media: ids.filter((id) => graph.has(id)).map((id) => toMedia(id, 0)) } },
    });
  }
  if (query.includes("idMal_in")) {
    const idMals = variables.idMals as number[];
    const media = [...graph.values()]
      .filter((node) => idMals.includes(idMalOf(node) as number))
      .map((node) => toMedia(node.id, 2));
    return jsonResponse({ data: { Page: { media } } });
  }
  const node = [...graph.values()].find((n) => idMalOf(n) === variables.idMal);
  if (!node) {
    return jsonResponse(
      { errors: [{ message: "Not Found.", status: 404 }], data: { Media: null } },
      404,
    );
  }
  return jsonResponse({ data: { Media: toMedia(node.id, 0) } });
}

/** Linear franchise 1 → … → length (AniList ids; MAL id = 100 + id), each with a manga adaptation. */
function linearFranchise(length: number) {
  graph.set(1000, { id: 1000, type: "MANGA", format: "MANGA" });
  for (let id = 1; id <= length; id++) {
    const edges: FakeNode["edges"] = [["ADAPTATION", 1000]];
    if (id > 1) edges.push(["PREQUEL", id - 1]);
    if (id < length) edges.push(["SEQUEL", id + 1]);
    graph.set(id, { id, edges });
  }
}

/** Settles a promise while the fake clock runs, so limiter and backoff waits elapse. */
async function settle<T>(promise: Promise<T>, ms = 600_000): Promise<T> {
  const outcome = promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  await vi.advanceTimersByTimeAsync(ms);
  const result = await outcome;
  if (!result.ok) throw result.error;
  return result.value;
}

const malIds = (seasons: Array<{ malId: number }>) => seasons.map((s) => s.malId);

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  calls = [];
  graph = new Map();
  respond = anilistServer;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Omit<Call, "at">;
      const call = { ...body, at: Date.now() };
      calls.push(call);
      return respond(call, calls.length - 1);
    }),
  );
  // Fresh module per test: queue and rate-limit window are module state.
  vi.resetModules();
  client = await import("./anilist-client");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("limitador", () => {
  it("nunca passa de 28 inícios em 60 s e espaça 1 s entre eles", async () => {
    const results = Array.from({ length: 70 }, (_, i) =>
      client.fetchAnilistSeasonsByMalId([i + 1]),
    );
    await settle(Promise.all(results), 240_000);

    const starts = calls.map((call) => call.at);
    expect(starts).toHaveLength(70);
    expect(starts[0]).toBe(0);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(1_000);
    }
    for (let i = 0; i + 28 < starts.length; i++) {
      expect(starts[i + 28] - starts[i]).toBeGreaterThanOrEqual(60_000);
    }
  });

  it("banner fura a fila das consultas de verificação", async () => {
    const background = Array.from({ length: 5 }, (_, i) =>
      client.fetchAnilistSeasonsByMalId([i + 1]),
    );
    const banner = client.fetchAnilistBanner(5114);
    await settle(Promise.all([...background, banner]));

    // A primeira de fundo já tinha saído; o banner leva a vaga seguinte.
    expect(calls[1].query).toContain("bannerImage");
    expect(calls[1].at).toBe(1_000);
  });
});

describe("erros e retentativas", () => {
  it("429 com Retry-After espera o tempo pedido", async () => {
    respond = (call, index) =>
      index === 0
        ? jsonResponse({ errors: [{ message: "Too Many Requests." }] }, 429, { "Retry-After": "5" })
        : anilistServer(call);
    await settle(client.fetchAnilistSeasonsByMalId([1]));
    expect(calls.map((call) => call.at)).toEqual([0, 5_000]);
  });

  it("429 sem cabeçalhos espera 60 s", async () => {
    respond = (call, index) => (index === 0 ? jsonResponse({}, 429) : anilistServer(call));
    await settle(client.fetchAnilistSeasonsByMalId([1]));
    expect(calls.map((call) => call.at)).toEqual([0, 60_000]);
  });

  it("429 com X-RateLimit-Reset espera até o reset", async () => {
    respond = (call, index) =>
      index === 0 ? jsonResponse({}, 429, { "X-RateLimit-Reset": "30" }) : anilistServer(call);
    await settle(client.fetchAnilistSeasonsByMalId([1]));
    expect(calls.map((call) => call.at)).toEqual([0, 30_000]);
  });

  it("429 segura as outras requisições até liberar", async () => {
    respond = (call, index) => (index === 0 ? jsonResponse({}, 429) : anilistServer(call));
    const first = client.fetchAnilistSeasonsByMalId([1]);
    const second = client.fetchAnilistSeasonsByMalId([2]);
    await settle(Promise.all([first, second]));
    expect(calls).toHaveLength(3);
    expect(calls[1].at).toBeGreaterThanOrEqual(60_000);
    expect(calls[2].at).toBeGreaterThanOrEqual(60_000);
  });

  it("5xx seguido de sucesso devolve o dado", async () => {
    linearFranchise(1);
    respond = (call, index) => (index === 0 ? jsonResponse({}, 503) : anilistServer(call));
    const result = await settle(client.fetchAnilistSeasonsByMalId([101]));
    expect([...result.keys()]).toEqual([101]);
    expect(calls.map((call) => call.at)).toEqual([0, 2_000]);
  });

  it("esgotar as tentativas lança o último erro", async () => {
    respond = () => jsonResponse({}, 502);
    await expect(settle(client.fetchAnilistSeasonsByMalId([1]))).rejects.toThrow("502");
    expect(calls.map((call) => call.at)).toEqual([0, 2_000, 6_000, 14_000]);
  });

  it("200 com errors do GraphQL é falha", async () => {
    respond = () => jsonResponse({ data: null, errors: [{ message: "Internal" }] });
    await expect(settle(client.fetchAnilistSeasonsByMalId([1]))).rejects.toThrow("Internal");
    expect(calls).toHaveLength(1);
  });

  it("400 falha sem repetir", async () => {
    respond = () => jsonResponse({ data: null, errors: [{ message: "Bad field" }] }, 400);
    await expect(settle(client.fetchAnilistSeasonsByMalId([1]))).rejects.toThrow("400");
    expect(calls).toHaveLength(1);
  });

  it("abort na fila rejeita sem chegar a requisitar", async () => {
    const controller = new AbortController();
    const first = client.fetchAnilistSeasonsByMalId([1]);
    const second = client.fetchAnilistSeasonsByMalId([2], controller.signal);
    controller.abort();
    await expect(second).rejects.toMatchObject({ name: "AbortError" });
    await settle(first);
    expect(calls).toHaveLength(1);
  });

  it("abort durante o backoff rejeita na hora", async () => {
    respond = () => jsonResponse({}, 503);
    const controller = new AbortController();
    const result = client.fetchAnilistSeasonsByMalId([1], controller.signal);
    const assertion = expect(result).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(500);
    controller.abort();
    await assertion;
    expect(calls).toHaveLength(1);
  });

  it("AbortError do fetch propaga na cadeia e no lote", async () => {
    respond = () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    };
    await expect(settle(client.buildAnilistChain(1))).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect(settle(client.fetchAnilistSeasonsByMalId([1]))).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});

describe("chainSeasonFromAnilist", () => {
  const base: AnilistMedia = {
    id: 154587,
    idMal: 52991,
    type: "ANIME",
    format: "TV",
    status: "FINISHED",
    seasonYear: 2023,
    episodes: 28,
    duration: 24,
    startDate: { year: 2023, month: 9, day: 29 },
    title: { romaji: "Sousou no Frieren" },
    coverImage: { extraLarge: "https://img/xl.jpg", large: "https://img/l.jpg" },
  };

  it("converte todos os campos", () => {
    expect(client.chainSeasonFromAnilist(base)).toEqual({
      malId: 52991,
      title: "Sousou no Frieren",
      year: 2023,
      malScore: null,
      imageUrl: "https://img/xl.jpg",
      type: "TV",
      status: "Finished Airing",
      airedFrom: null,
      releaseDate: "2023-09-29",
      releasePrecision: "day",
      genres: [],
      episodes: 28,
      durationMin: 24,
    });
  });

  it.each([
    ["TV", "TV"],
    ["TV_SHORT", "TV"],
    ["MOVIE", "Movie"],
    ["OVA", "OVA"],
    ["ONA", "ONA"],
    ["SPECIAL", "Special"],
  ])("format %s vira type %s", (format, type) => {
    expect(client.chainSeasonFromAnilist({ ...base, format })?.type).toBe(type);
  });

  it.each(["MUSIC", "MANGA", "NOVEL", null])("format %s é descartado", (format) => {
    expect(client.chainSeasonFromAnilist({ ...base, format })).toBeNull();
  });

  it.each([
    ["NOT_YET_RELEASED", "Not yet aired"],
    ["RELEASING", "Currently Airing"],
    ["HIATUS", "Currently Airing"],
    ["FINISHED", "Finished Airing"],
  ])("status %s vira %s", (status, text) => {
    expect(client.chainSeasonFromAnilist({ ...base, status })?.status).toBe(text);
  });

  it.each(["CANCELLED", null])("status %s é descartado", (status) => {
    expect(client.chainSeasonFromAnilist({ ...base, status })).toBeNull();
  });

  it("sem idMal ou sem título é descartado", () => {
    expect(client.chainSeasonFromAnilist({ ...base, idMal: null })).toBeNull();
    expect(client.chainSeasonFromAnilist({ ...base, idMal: undefined })).toBeNull();
    expect(client.chainSeasonFromAnilist({ ...base, title: { romaji: " " } })).toBeNull();
  });

  it("data nas três precisões e sem data", () => {
    const at = (startDate: AnilistMedia["startDate"]) => {
      const s = client.chainSeasonFromAnilist({ ...base, status: "NOT_YET_RELEASED", startDate });
      return [s?.releaseDate, s?.releasePrecision];
    };
    expect(at({ year: 2027, month: 1, day: 8 })).toEqual(["2027-01-08", "day"]);
    expect(at({ year: 2027, month: 4, day: null })).toEqual(["2027-04-01", "month"]);
    expect(at({ year: 2027, month: null, day: null })).toEqual(["2027-01-01", "year"]);
    expect(at({ year: null, month: null, day: null })).toEqual([null, null]);
    expect(at(null)).toEqual([null, null]);
  });

  it("year cai no startDate, capa cai no large, episódios e duração vazios viram null", () => {
    const s = client.chainSeasonFromAnilist({
      ...base,
      seasonYear: null,
      startDate: { year: 2026, month: null, day: null },
      coverImage: { extraLarge: null, large: "https://img/l.jpg" },
      episodes: null,
      duration: 0,
    });
    expect(s).toMatchObject({
      year: 2026,
      imageUrl: "https://img/l.jpg",
      episodes: null,
      durationMin: null,
    });
    expect(client.chainSeasonFromAnilist({ ...base, coverImage: null })?.imageUrl).toBeNull();
  });
});

describe("buildAnilistChain", () => {
  it("anda dois saltos por requisição, apesar dos edges vazios no 2º nível", async () => {
    linearFranchise(7);
    const report = await settle(client.buildAnilistChain(101));

    expect(malIds(report.seasons)).toEqual([101, 102, 103, 104, 105, 106, 107]);
    expect(report).toMatchObject({ requests: 4, failedRequests: 0, truncated: false });
    expect(calls[0].variables).toEqual({ idMal: 101 });
    expect(calls.slice(1).map((call) => call.variables.ids)).toEqual([[3], [5], [7]]);
    expect(classifyChain(report)).toBe("verified");
  });

  it("fronteiras dos dois lados vão juntas num id_in", async () => {
    linearFranchise(7);
    const report = await settle(client.buildAnilistChain(104));

    expect(malIds(report.seasons)).toEqual([101, 102, 103, 104, 105, 106, 107]);
    expect(report.requests).toBe(2);
    expect(calls[1].variables.ids).toEqual([2, 6]);
  });

  it("dedupe de um nó alcançado por dois caminhos", async () => {
    graph.set(1, {
      id: 1,
      edges: [
        ["SEQUEL", 2],
        ["SEQUEL", 3],
      ],
    });
    graph.set(2, {
      id: 2,
      edges: [
        ["PREQUEL", 1],
        ["SEQUEL", 4],
      ],
    });
    graph.set(3, {
      id: 3,
      edges: [
        ["PREQUEL", 1],
        ["SEQUEL", 4],
      ],
    });
    graph.set(4, {
      id: 4,
      edges: [
        ["PREQUEL", 2],
        ["PREQUEL", 3],
      ],
    });
    const report = await settle(client.buildAnilistChain(101));

    expect(malIds(report.seasons)).toEqual([101, 102, 103, 104]);
    expect(calls[1].variables.ids).toEqual([4]);
  });

  it("nós sem idMal, MUSIC e CANCELLED são percorridos mas não entram", async () => {
    linearFranchise(6);
    graph.get(2)!.idMal = null;
    graph.get(3)!.format = "MUSIC";
    graph.get(4)!.status = "CANCELLED";
    const report = await settle(client.buildAnilistChain(101));

    expect(malIds(report.seasons)).toEqual([101, 105, 106]);
  });

  it("franquia longa para em 25 e sinaliza", async () => {
    linearFranchise(30);
    const report = await settle(client.buildAnilistChain(101));

    expect(report.seasons).toHaveLength(25);
    expect(report.truncated).toBe(true);
    expect(classifyChain(report)).toBe("truncated");
  });

  it("falha num bloco da fronteira deixa a cadeia incompleta", async () => {
    linearFranchise(7);
    respond = (call) =>
      call.query.includes("id_in") ? jsonResponse({}, 500) : anilistServer(call);
    const report = await settle(client.buildAnilistChain(101));

    expect(malIds(report.seasons)).toEqual([101, 102, 103]);
    expect(report).toMatchObject({ requests: 2, failedRequests: 1 });
    expect(classifyChain(report)).toBe("partial");
  });

  it("falha na raiz é cadeia falha, sem lançar", async () => {
    respond = () => jsonResponse({ data: null, errors: [{ message: "Internal" }] });
    const report = await settle(client.buildAnilistChain(101));

    expect(report).toEqual({ seasons: [], requests: 1, failedRequests: 1, truncated: false });
    expect(classifyChain(report)).toBe("failed");
  });

  it("Media inexistente (404 ou null) é cadeia vazia, não falha", async () => {
    const missing = await settle(client.buildAnilistChain(999));
    expect(missing).toEqual({ seasons: [], requests: 1, failedRequests: 0, truncated: false });
    expect(classifyChain(missing)).toBe("verified");

    respond = () => jsonResponse({ data: { Media: null } });
    const empty = await settle(client.buildAnilistChain(999));
    expect(empty).toEqual({ seasons: [], requests: 1, failedRequests: 0, truncated: false });
  });

  it("knownMalIds tira as conhecidas da saída", async () => {
    linearFranchise(4);
    const report = await settle(
      client.buildAnilistChain(101, undefined, { knownMalIds: new Set([101, 102]) }),
    );
    expect(malIds(report.seasons)).toEqual([103, 104]);
  });
});

describe("fetchAnilistSeasonsByMalId", () => {
  it("divide em blocos de 50 e omite IDs ausentes, repetidos e descartados", async () => {
    // Só os pares existem no AniList; o 102 foi cancelado.
    for (let id = 2; id <= 120; id += 2) graph.set(id, { id, idMal: id });
    graph.get(102)!.status = "CANCELLED";
    const ids = Array.from({ length: 120 }, (_, i) => i + 1);
    const result = await settle(client.fetchAnilistSeasonsByMalId([...ids, 1, 2, 3]));

    expect(calls.map((call) => (call.variables.idMals as number[]).length)).toEqual([50, 50, 20]);
    expect(result.size).toBe(59);
    expect(result.has(1)).toBe(false);
    expect(result.has(102)).toBe(false);
    expect(result.get(120)).toMatchObject({ malId: 120, status: "Finished Airing" });
  });

  it("lista vazia não requisita", async () => {
    await expect(client.fetchAnilistSeasonsByMalId([])).resolves.toEqual(new Map());
    expect(calls).toHaveLength(0);
  });
});

describe("fetchAnilistBanner", () => {
  it("retorna a URL quando há banner", async () => {
    const url = "https://s4.anilist.co/file/anilistcdn/media/anime/banner/154587.jpg";
    mockFetch(async () => jsonResponse({ data: { Media: { bannerImage: url } } }));
    await expect(client.fetchAnilistBanner(52991)).resolves.toBe(url);
  });

  it("retorna null quando bannerImage é null", async () => {
    mockFetch(async () => jsonResponse({ data: { Media: { bannerImage: null } } }));
    await expect(client.fetchAnilistBanner(1)).resolves.toBeNull();
  });

  it("retorna null quando Media é null", async () => {
    mockFetch(async () => jsonResponse({ data: { Media: null } }));
    await expect(client.fetchAnilistBanner(1)).resolves.toBeNull();
  });

  it("retorna null em 404", async () => {
    mockFetch(async () =>
      jsonResponse(
        { data: { Media: null }, errors: [{ message: "Not Found.", status: 404 }] },
        404,
      ),
    );
    await expect(client.fetchAnilistBanner(1)).resolves.toBeNull();
  });

  it("retorna null em 429", async () => {
    mockFetch(async () => jsonResponse({ errors: [{ message: "Too Many Requests." }] }, 429));
    await expect(client.fetchAnilistBanner(1)).resolves.toBeNull();
  });

  it("retorna null quando a rede falha", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(client.fetchAnilistBanner(1)).resolves.toBeNull();
  });

  it("retorna null com JSON inválido", async () => {
    mockFetch(async () => new Response("<html>oops</html>", { status: 200 }));
    await expect(client.fetchAnilistBanner(1)).resolves.toBeNull();
  });

  it("relança AbortError", async () => {
    mockFetch(async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    });
    await expect(client.fetchAnilistBanner(1)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("envia o idMal no body", async () => {
    const fn = mockFetch(async () => jsonResponse({ data: { Media: { bannerImage: null } } }));
    const controller = new AbortController();
    await client.fetchAnilistBanner(5114, controller.signal);

    expect(fn).toHaveBeenCalledTimes(1);
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graphql.anilist.co");
    expect(init.method).toBe("POST");
    expect(init.signal).toBe(controller.signal);
    const body = JSON.parse(init.body as string);
    expect(body.variables).toEqual({ idMal: 5114 });
    expect(body.query).toContain("Media(idMal: $idMal, type: ANIME)");
  });

  it("429 no banner não repete e segura a fila", async () => {
    respond = (call, index) => (index === 0 ? jsonResponse({}, 429) : anilistServer(call));
    // Sem avançar o relógio: o banner responde na hora, sem esperar retentativa.
    await expect(client.fetchAnilistBanner(1)).resolves.toBeNull();
    expect(calls).toHaveLength(1);

    await settle(client.fetchAnilistSeasonsByMalId([1]));
    expect(calls[1].at).toBeGreaterThanOrEqual(60_000);
  });
});
