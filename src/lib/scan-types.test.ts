import { describe, expect, it } from "vitest";

import {
  classifyChain,
  isJikanOutage,
  scanOutcome,
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

describe("isJikanOutage", () => {
  it("2 falhas seguidas não interrompem", () => {
    expect(isJikanOutage(["verified", "failed", "failed"])).toBe(false);
  });

  it("3 falhas seguidas interrompem", () => {
    expect(isJikanOutage(["verified", "failed", "failed", "failed"])).toBe(true);
    expect(isJikanOutage(["failed", "failed", "failed"])).toBe(true);
  });

  it("um anime respondido no meio zera a sequência", () => {
    expect(isJikanOutage(["failed", "failed", "partial", "failed", "failed"])).toBe(false);
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
