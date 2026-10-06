import { describe, expect, it } from "vitest";

import { visibleAnchors } from "@/lib/scroll-anchor";

const header = 88;
const viewport = 800;
const ids = (cards: { id: string }[]) => cards.map((c) => c.id);

describe("visibleAnchors", () => {
  it("lista os cards visíveis abaixo do header, na ordem", () => {
    const cards = [
      { id: "anime-1", top: -300, bottom: -100 },
      { id: "anime-2", top: 20, bottom: 120 },
      { id: "anime-3", top: 140, bottom: 240 },
    ];
    expect(ids(visibleAnchors(cards, header, viewport))).toEqual(["anime-2", "anime-3"]);
  });

  it("ignora card escondido inteiro atrás do header", () => {
    const cards = [
      { id: "anime-1", top: -20, bottom: 80 },
      { id: "anime-2", top: 100, bottom: 200 },
    ];
    expect(ids(visibleAnchors(cards, header, viewport))).toEqual(["anime-2"]);
  });

  it("ignora cards abaixo da viewport", () => {
    expect(visibleAnchors([{ id: "anime-1", top: 900, bottom: 1000 }], header, viewport)).toEqual(
      [],
    );
  });

  it("sem cards retorna lista vazia", () => {
    expect(visibleAnchors([], header, viewport)).toEqual([]);
  });
});
