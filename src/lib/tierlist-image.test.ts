import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import type { Anime } from "./anime-storage";
import {
  TIER_ORDER,
  computeTierlistLayout,
  selectTierlistRows,
  truncateToLines,
} from "./tierlist-image";

function anime(overrides: Partial<Anime> = {}): Anime {
  return {
    id: "anime-1",
    name: "Anime",
    seasons: [],
    watched: true,
    tier: "S",
    tierPosition: null,
    lastCheckedAt: null,
    genres: null,
    ...overrides,
  };
}

const counts = (s: number, a = 0, b = 0, c = 0, d = 0, e = 0) => [s, a, b, c, d, e];

describe("selectTierlistRows", () => {
  it("devolve as 6 tiers de S a E, mesmo vazias", () => {
    const rows = selectTierlistRows([]);
    expect(rows.map((r) => r.tier)).toEqual(["S", "A", "B", "C", "D", "E"]);
    expect(rows.every((r) => r.items.length === 0)).toBe(true);
  });

  it("exclui não assistidos e sem tier, e ordena por tierPosition", () => {
    const rows = selectTierlistRows([
      anime({ id: "fila", tier: "S", watched: false }),
      anime({ id: "sem-tier", tier: null }),
      anime({ id: "s-null", tier: "S", tierPosition: null }),
      anime({ id: "s-1", tier: "S", tierPosition: 1 }),
      anime({ id: "s-0", tier: "S", tierPosition: 0 }),
      anime({ id: "e", tier: "E", tierPosition: 0 }),
    ]);
    expect(rows[0].items.map((a) => a.id)).toEqual(["s-0", "s-1", "s-null"]);
    expect(rows[5].items.map((a) => a.id)).toEqual(["e"]);
    expect(rows.flatMap((r) => r.items).map((a) => a.id)).not.toContain("fila");
    expect(rows.flatMap((r) => r.items).map((a) => a.id)).not.toContain("sem-tier");
  });
});

describe("computeTierlistLayout", () => {
  it("horizontal tem 1600 de largura e cresce na altura com mais capas", () => {
    const few = computeTierlistLayout(counts(3, 2), "horizontal");
    const many = computeTierlistLayout(counts(40, 30, 20), "horizontal");
    expect(few.width).toBe(1600);
    expect(many.width).toBe(1600);
    expect(many.height).toBeGreaterThan(few.height);
    expect(many.coverW).toBe(few.coverW);
    expect(many.truncated).toBe(false);
    expect(many.rows[0].cells).toHaveLength(40);
    expect(many.rows.every((r) => r.overflow === null)).toBe(true);
  });

  it("horizontal: capas não passam da largura", () => {
    const layout = computeTierlistLayout(counts(40), "horizontal");
    for (const cell of layout.rows[0].cells) {
      expect(cell.x + layout.coverW).toBeLessThanOrEqual(layout.width - layout.pad);
    }
  });

  it("tier vazia vira faixa mais baixa", () => {
    const layout = computeTierlistLayout(counts(1), "horizontal");
    expect(layout.rows[1].h).toBeLessThan(layout.rows[0].h);
    expect(layout.rows[1].cells).toHaveLength(0);
  });

  it("story é 1080×1920 fixo e encolhe as capas com mais itens", () => {
    const few = computeTierlistLayout(counts(2, 1), "story");
    const more = computeTierlistLayout(counts(12, 10, 8, 6), "story");
    for (const layout of [few, more]) {
      expect(layout.width).toBe(1080);
      expect(layout.height).toBe(1920);
      const last = layout.rows[layout.rows.length - 1];
      expect(last.y + last.h).toBeLessThanOrEqual(1920 - layout.pad);
    }
    expect(more.coverW).toBeLessThan(few.coverW);
    expect(more.fontSize).toBeLessThanOrEqual(few.fontSize);
    expect(more.truncated).toBe(false);
  });

  it("story no limite mostra as primeiras capas e um +N por tier", () => {
    const input = counts(80, 50, 30, 20, 10, 5);
    const layout = computeTierlistLayout(input, "story");
    expect(layout.truncated).toBe(true);
    expect(layout.height).toBe(1920);
    const last = layout.rows[layout.rows.length - 1];
    expect(last.y + last.h).toBeLessThanOrEqual(1920 - layout.pad);
    layout.rows.forEach((row, i) => {
      const shown = row.cells.length + (row.overflow ? row.overflow.count : 0);
      expect(shown).toBe(input[i]);
    });
    expect(layout.rows[0].overflow?.count).toBe(80 - layout.rows[0].cells.length);
  });

  it("story cabe com as 6 tiers cheias no tamanho mínimo", () => {
    const layout = computeTierlistLayout(counts(99, 99, 99, 99, 99, 99), "story");
    expect(layout.rows.every((r) => r.cells.length > 0 && r.overflow !== null)).toBe(true);
    const last = layout.rows[layout.rows.length - 1];
    expect(last.y + last.h).toBeLessThanOrEqual(1920);
  });

  it("linhas seguem TIER_ORDER", () => {
    expect(computeTierlistLayout(counts(0), "story").rows.map((r) => r.tier)).toEqual(TIER_ORDER);
  });
});

describe("truncateToLines", () => {
  // 1 unidade por caractere
  const measure = (text: string) => text.length;

  it("mantém texto que cabe numa linha", () => {
    expect(truncateToLines(measure, "Frieren", 10, 2)).toEqual(["Frieren"]);
  });

  it("quebra por palavra em até 2 linhas", () => {
    expect(truncateToLines(measure, "Sousou no Frieren", 10, 2)).toEqual(["Sousou no", "Frieren"]);
  });

  it("corta a última linha com reticências", () => {
    const lines = truncateToLines(measure, "Shingeki no Kyojin The Final Season", 10, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("…")).toBe(true);
    expect(lines.every((l) => measure(l) <= 10)).toBe(true);
  });

  it("quebra palavra maior que a largura", () => {
    const lines = truncateToLines(measure, "Supercalifragilistic", 8, 2);
    expect(lines[0]).toBe("Supercal");
    expect(lines[1].endsWith("…")).toBe(true);
    expect(lines.every((l) => measure(l) <= 8)).toBe(true);
  });
});
