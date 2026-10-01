import { beforeEach, describe, expect, it, vi } from "vitest";

const jikan = vi.hoisted(() => ({
  getJikanAnime: vi.fn(),
  getJikanRelations: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/jikan-client", () => jikan);

import { buildChain, buildChainDetailed, deriveReleaseDate } from "./jikan-chain";
import { classifyChain } from "./scan-types";

const parts = (year: number | null, month: number | null, day: number | null) => ({
  from: "2026-12-31T15:00:00+00:00",
  prop: { from: { year, month, day } },
});

describe("deriveReleaseDate", () => {
  it("dia, mês e ano viram precisão de dia, montada das partes e não do UTC", () => {
    expect(deriveReleaseDate(parts(2027, 1, 8))).toEqual({
      releaseDate: "2027-01-08",
      releasePrecision: "day",
    });
  });

  it("só mês e ano viram o dia 1º do mês", () => {
    expect(deriveReleaseDate(parts(2027, 4, null))).toEqual({
      releaseDate: "2027-04-01",
      releasePrecision: "month",
    });
  });

  it("só ano vira 1º de janeiro", () => {
    expect(deriveReleaseDate(parts(2027, null, null))).toEqual({
      releaseDate: "2027-01-01",
      releasePrecision: "year",
    });
  });

  it("sem partes fica sem data, mesmo com aired.from", () => {
    expect(deriveReleaseDate(parts(null, null, null))).toEqual({
      releaseDate: null,
      releasePrecision: null,
    });
  });

  it("sem prop cai no aired.from com precisão desconhecida", () => {
    expect(deriveReleaseDate({ from: "2027-01-08T00:00:00+00:00" })).toEqual({
      releaseDate: "2027-01-08",
      releasePrecision: null,
    });
  });

  it("sem prop e sem aired.from fica sem data", () => {
    expect(deriveReleaseDate({ from: null })).toEqual({
      releaseDate: null,
      releasePrecision: null,
    });
    expect(deriveReleaseDate(null)).toEqual({ releaseDate: null, releasePrecision: null });
    expect(deriveReleaseDate(undefined)).toEqual({ releaseDate: null, releasePrecision: null });
  });
});

/** Linear franchise 1 → 2 → … → length, each entry linked to its neighbours. */
function linearFranchise(length: number) {
  jikan.getJikanRelations.mockImplementation(async (id: number) => [
    {
      relation: "Sequel",
      entry: id < length ? [{ mal_id: id + 1, type: "anime" }] : [],
    },
    {
      relation: "Prequel",
      entry: id > 1 ? [{ mal_id: id - 1, type: "anime" }] : [],
    },
  ]);
  jikan.getJikanAnime.mockImplementation(async (id: number) => ({
    mal_id: id,
    title: `Season ${id}`,
    type: "TV",
    status: "Finished Airing",
    year: 2000 + id,
    score: 8,
  }));
}

describe("buildChainDetailed", () => {
  beforeEach(() => {
    jikan.getJikanAnime.mockReset();
    jikan.getJikanRelations.mockReset();
  });

  it("sucesso total é completo", async () => {
    linearFranchise(3);
    const report = await buildChainDetailed(1);

    expect(report.seasons.map((s) => s.malId)).toEqual([1, 2, 3]);
    expect(report).toMatchObject({ requests: 6, failedRequests: 0, truncated: false });
    expect(classifyChain(report)).toBe("verified");
  });

  it("falha de relações conta e deixa o resultado incompleto", async () => {
    linearFranchise(3);
    jikan.getJikanRelations.mockImplementation(async (id: number) => {
      if (id === 2) throw new Error("504");
      return [{ relation: "Sequel", entry: [{ mal_id: id + 1, type: "anime" }] }];
    });
    const report = await buildChainDetailed(1);

    expect(report.failedRequests).toBe(1);
    expect(report.seasons.map((s) => s.malId)).toEqual([1, 2]);
    expect(classifyChain(report)).toBe("partial");
  });

  it("falha de detalhes conta e deixa o resultado incompleto", async () => {
    linearFranchise(3);
    const details = jikan.getJikanAnime.getMockImplementation()!;
    jikan.getJikanAnime.mockImplementation(async (id: number) => {
      if (id === 3) throw new Error("503");
      return details(id);
    });
    const report = await buildChainDetailed(1);

    expect(report.failedRequests).toBe(1);
    expect(report.seasons.map((s) => s.malId)).toEqual([1, 2]);
    expect(classifyChain(report)).toBe("partial");
  });

  it("sem nenhuma resposta, falhou", async () => {
    jikan.getJikanRelations.mockRejectedValue(new Error("504"));
    const report = await buildChainDetailed(1, undefined, undefined, {
      knownMalIds: new Set([1]),
    });

    expect(report).toMatchObject({ seasons: [], requests: 1, failedRequests: 1 });
    expect(classifyChain(report)).toBe("failed");
  });

  it("franquia longa atinge o limite de 25 e sinaliza", async () => {
    linearFranchise(30);
    const report = await buildChainDetailed(1);

    expect(report.seasons).toHaveLength(25);
    expect(report).toMatchObject({ failedRequests: 0, truncated: true });
    expect(classifyChain(report)).toBe("truncated");
  });

  it("buildChain continua devolvendo só as seasons", async () => {
    linearFranchise(2);
    const seasons = await buildChain(1);

    expect(Array.isArray(seasons)).toBe(true);
    expect(seasons.map((s) => s.malId)).toEqual([1, 2]);
  });

  it("AbortError nas relações propaga", async () => {
    jikan.getJikanRelations.mockRejectedValue(new DOMException("Aborted", "AbortError"));
    await expect(buildChainDetailed(1)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("AbortError nos detalhes propaga", async () => {
    linearFranchise(2);
    jikan.getJikanAnime.mockRejectedValue(new DOMException("Aborted", "AbortError"));
    await expect(buildChain(1)).rejects.toMatchObject({ name: "AbortError" });
  });
});
