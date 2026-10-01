import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { deriveReleaseDate } from "./jikan-chain";

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
