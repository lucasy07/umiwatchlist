import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Anime } from "./anime-storage";
import type { ChainSeason } from "./jikan-chain";
import { runMalImport, type MalEntry } from "./mal-import";

const mocks = vi.hoisted(() => ({
  buildChain: vi.fn(),
  createAnime: vi.fn(),
  updateSeasons: vi.fn(),
  updateTier: vi.fn(),
  setWatched: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/jikan-chain", () => ({ buildChain: mocks.buildChain }));
vi.mock("@/lib/anime-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./anime-storage")>()),
  createAnime: mocks.createAnime,
  updateSeasons: mocks.updateSeasons,
  updateTier: mocks.updateTier,
  setWatched: mocks.setWatched,
}));

const entry = (malId: number, overrides: Partial<MalEntry> = {}): MalEntry => ({
  malId,
  title: `Anime ${malId}`,
  type: "TV",
  episodes: 12,
  status: "completed",
  score: 8,
  ...overrides,
});

const detail = (malId: number, overrides: Partial<ChainSeason> = {}): ChainSeason => ({
  malId,
  title: `Anime ${malId}`,
  year: 2020,
  malScore: 7,
  imageUrl: null,
  type: "TV",
  status: null,
  airedFrom: null,
  genres: [],
  episodes: 12,
  durationMin: 24,
  ...overrides,
});

const anime = (malId: number, seasons: Anime["seasons"]): Anime => ({
  id: `anime-${malId}`,
  name: `Anime ${malId}`,
  seasons,
  watched: true,
  malId,
  tier: "A",
  tierPosition: null,
  lastCheckedAt: null,
  genres: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.buildChain.mockImplementation(async (id: number) => [detail(id)]);
  mocks.createAnime.mockImplementation(async (input: { malId: number; seasons: Anime["seasons"]; tier: Anime["tier"]; watched: boolean }) =>
    anime(input.malId, input.seasons),
  );
  mocks.updateSeasons.mockResolvedValue(undefined);
  mocks.updateTier.mockResolvedValue(undefined);
  mocks.setWatched.mockResolvedValue(undefined);
});

describe("runMalImport", () => {
  it("agrupa a franquia e ignora Plan to Watch quando há completed", async () => {
    mocks.buildChain.mockResolvedValue([detail(1), detail(2)]);
    const progress = vi.fn();
    const result = await runMalImport(
      [entry(1, { score: 9 }), entry(2, { status: "plan_to_watch", score: 0 })],
      [],
      { onProgress: progress },
    );
    expect(result).toEqual({ created: 1, alreadyInList: 0, ignoredPlanToWatch: 1, linkedToExisting: [], failed: [] });
    expect(mocks.createAnime).toHaveBeenCalledWith(expect.objectContaining({
      malId: 1,
      watched: true,
      tier: "S",
      seasons: [expect.objectContaining({ malId: 1 })],
    }));
    expect(mocks.buildChain).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenLastCalledWith({ done: 2, total: 2, currentName: "Anime 1" });
  });

  it("exclui TV Special da média mas conta todos para watched quando só há especiais", async () => {
    mocks.buildChain.mockResolvedValue([detail(1, { type: "TV Special" }), detail(2, { type: "TV Special" })]);
    await runMalImport([entry(1, { type: "TV Special", score: 10 }), entry(2, { type: "TV Special", status: "watching" })], []);
    expect(mocks.createAnime).toHaveBeenCalledWith(expect.objectContaining({ watched: false, tier: null }));
  });

  it("pula franquia ligada a anime preexistente", async () => {
    mocks.buildChain.mockResolvedValue([detail(1), detail(2)]);
    const result = await runMalImport([entry(1)], [anime(2, [{ id: "s2", name: "Anime 2", malId: 2 }])]);
    expect(result.linkedToExisting).toEqual(["Anime 1"]);
    expect(mocks.createAnime).not.toHaveBeenCalled();
  });

  it("anexa continuações a uma franquia criada na mesma importação", async () => {
    mocks.buildChain.mockImplementation(async (id: number) =>
      id === 1 ? [detail(1)] : [detail(2), detail(1)],
    );
    const onUpdated = vi.fn();
    const result = await runMalImport([entry(1), entry(2)], [], { onUpdated });
    expect(result.created).toBe(1);
    expect(mocks.updateSeasons).toHaveBeenCalledWith("anime-1", expect.arrayContaining([
      expect.objectContaining({ malId: 1 }), expect.objectContaining({ malId: 2 }),
    ]));
    expect(mocks.updateTier).toHaveBeenCalledWith("anime-1", "A");
    expect(mocks.setWatched).toHaveBeenCalledWith("anime-1", true);
    expect(onUpdated).toHaveBeenCalledOnce();
  });

  it("continua após erro numa franquia e retorna parcial no cancelamento", async () => {
    mocks.createAnime.mockRejectedValueOnce(new Error("falha"));
    const result = await runMalImport([entry(1), entry(2)], []);
    expect(result).toEqual({ created: 1, alreadyInList: 0, ignoredPlanToWatch: 0, linkedToExisting: [], failed: ["Anime 1"] });

    const controller = new AbortController();
    mocks.buildChain.mockImplementationOnce(async () => { controller.abort(); throw new DOMException("Aborted", "AbortError"); });
    const partial = await runMalImport([entry(3)], [], { signal: controller.signal });
    expect(partial.created).toBe(0);
    expect(partial.failed).toEqual([]);
  });
});