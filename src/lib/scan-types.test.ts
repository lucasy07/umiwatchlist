import { describe, expect, it } from "vitest";

import { mergeChainIntoSeasons, seasonFromChain } from "./anime-storage";
import type { ChainSeason } from "./jikan-chain";
import {
  classifyChain,
  combineCheckStatus,
  isOutageStreak,
  scanOutcome,
  type FoundSeason,
  type ScanResult,
  type UncheckedAnime,
} from "./scan-types";

function result(overrides: Partial<ScanResult>): ScanResult {
  return {
    available: [],
    scheduled: [],
    premiered: [],
    unchecked: [],
    interruption: null,
    scanned: 0,
    verified: 0,
    viaAnilist: 0,
    datesFailed: false,
    ...overrides,
  };
}

const unchecked = (reason: UncheckedAnime["reason"]) => ({
  parentId: `id-${Math.random()}`,
  parentName: "Frieren",
  reason,
});

describe("classifyChain", () => {
  it("todas as requisições falharam: falhou", () => {
    expect(classifyChain({ requests: 2, failedRequests: 2, truncated: false })).toBe("failed");
  });

  it("algumas falharam: incompleto, mesmo com limite atingido", () => {
    expect(classifyChain({ requests: 5, failedRequests: 1, truncated: false })).toBe("partial");
    expect(classifyChain({ requests: 5, failedRequests: 1, truncated: true })).toBe("partial");
  });

  it("limite atingido sem falhas: possivelmente cortado", () => {
    expect(classifyChain({ requests: 50, failedRequests: 0, truncated: true })).toBe("truncated");
  });

  it("sem falhas e sem corte: verificado", () => {
    expect(classifyChain({ requests: 3, failedRequests: 0, truncated: false })).toBe("verified");
  });
});

describe("combineCheckStatus", () => {
  it("Jikan verificada sem AniList: verificado", () => {
    expect(combineCheckStatus("verified", null)).toBe("verified");
  });

  it("AniList completo verifica qualquer falha da Jikan, inclusive pulada", () => {
    expect(combineCheckStatus("failed", "verified")).toBe("verified");
    expect(combineCheckStatus("partial", "verified")).toBe("verified");
    expect(combineCheckStatus("truncated", "verified")).toBe("verified");
    expect(combineCheckStatus(null, "verified")).toBe("verified");
  });

  it("uma fonte que falhou não rebaixa a que respondeu", () => {
    expect(combineCheckStatus("failed", "partial")).toBe("partial");
    expect(combineCheckStatus("truncated", "failed")).toBe("truncated");
    expect(combineCheckStatus(null, "truncated")).toBe("truncated");
  });

  it("as duas responderam incompletas: a pior", () => {
    expect(combineCheckStatus("truncated", "partial")).toBe("partial");
    expect(combineCheckStatus("partial", "truncated")).toBe("partial");
  });

  it("falhou só quando as duas falharam (ou Jikan pulada e AniList falhou)", () => {
    expect(combineCheckStatus("failed", "failed")).toBe("failed");
    expect(combineCheckStatus(null, "failed")).toBe("failed");
  });

  it("3 animes com as duas fontes falhando interrompem; um salvo pelo AniList zera", () => {
    const both = combineCheckStatus("failed", "failed");
    const rescued = combineCheckStatus("failed", "verified");
    expect(isOutageStreak([both, both, both])).toBe(true);
    expect(isOutageStreak([both, both, rescued, both, both])).toBe(false);
  });
});

describe("isOutageStreak", () => {
  it("2 falhas seguidas não interrompem", () => {
    expect(isOutageStreak(["verified", "failed", "failed"])).toBe(false);
  });

  it("3 falhas seguidas interrompem", () => {
    expect(isOutageStreak(["verified", "failed", "failed", "failed"])).toBe(true);
    expect(isOutageStreak(["failed", "failed", "failed"])).toBe(true);
  });

  it("um anime respondido no meio zera a sequência", () => {
    expect(isOutageStreak(["failed", "failed", "partial", "failed", "failed"])).toBe(false);
  });
});

describe("scanOutcome", () => {
  it("nada novo e nenhuma falha: nothing", () => {
    expect(scanOutcome(result({ scanned: 4, verified: 4 }))).toBe("nothing");
  });

  it("cancelado antes de processar qualquer anime: nothing", () => {
    expect(scanOutcome(result({ interruption: "cancelled" }))).toBe("nothing");
  });

  it("tudo falhou: allFailed", () => {
    const failed = [unchecked("failed"), unchecked("failed"), unchecked("failed")];
    expect(scanOutcome(result({ scanned: 3, unchecked: failed, interruption: "outage" }))).toBe(
      "allFailed",
    );
  });

  it("incompleto sem novidades: dialog", () => {
    expect(scanOutcome(result({ scanned: 1, unchecked: [unchecked("truncated")] }))).toBe("dialog");
  });

  it("parte verificada e depois a Jikan caiu: dialog", () => {
    const failed = [unchecked("failed"), unchecked("failed"), unchecked("failed")];
    expect(
      scanOutcome(result({ scanned: 5, verified: 2, unchecked: failed, interruption: "outage" })),
    ).toBe("dialog");
  });
});

describe("FoundSeason", () => {
  const chainSeason = (overrides: Partial<ChainSeason> = {}): ChainSeason => ({
    malId: 20,
    title: "Frieren 2",
    year: 2026,
    malScore: 9.1,
    imageUrl: "https://cdn/f2.jpg",
    type: "TV",
    status: "Finished Airing",
    airedFrom: "2026-01-10T00:00:00+00:00",
    genres: ["Adventure"],
    episodes: 10,
    durationMin: 24,
    releaseDate: "2026-01-10",
    releasePrecision: "day",
    ...overrides,
  });

  // The Season literal addFoundSeason used to build by hand.
  const legacySeason = (found: FoundSeason, id: string) => ({
    id,
    name: found.title,
    malId: found.malId,
    year: found.year,
    malScore: found.malScore,
    type: found.type,
    episodes: found.episodes,
    durationMin: found.durationMin,
    imageUrl: found.imageUrl ?? null,
  });

  it.each([
    ["completa", chainSeason()],
    [
      "sem capa nem dados",
      chainSeason({
        imageUrl: null,
        year: null,
        malScore: null,
        type: null,
        episodes: null,
        durationMin: null,
      }),
    ],
  ])("item disponível (%s) vira a mesma temporada que o literal antigo", (_label, c) => {
    const merge = mergeChainIntoSeasons([], [c], new Set());
    expect(merge.available).toHaveLength(1);
    const found: FoundSeason = { ...merge.available[0], parentId: "p1", parentName: "Frieren" };
    expect(seasonFromChain(found, () => "id-1")).toStrictEqual(legacySeason(found, "id-1"));
  });
});
