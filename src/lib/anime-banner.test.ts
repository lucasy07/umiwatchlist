import { describe, expect, it } from "vitest";

import { bannerMalId } from "@/lib/anime-banner";
import type { Season } from "@/lib/anime-storage";

const season = (malId?: number) => ({ malId }) as Season;

describe("bannerMalId", () => {
  it("usa o malId do anime", () => {
    expect(bannerMalId({ malId: 10, seasons: [season(20)] })).toBe(10);
  });

  it("cai para a primeira temporada com malId", () => {
    expect(bannerMalId({ malId: undefined, seasons: [season(), season(20), season(30)] })).toBe(20);
  });

  it("é null quando nenhuma tem malId", () => {
    expect(bannerMalId({ malId: undefined, seasons: [season()] })).toBeNull();
  });
});
