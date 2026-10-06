import { describe, expect, it } from "vitest";

import { pickAnchor } from "@/lib/scroll-anchor";

const header = 88;
const viewport = 800;

describe("pickAnchor", () => {
  it("pega o primeiro card que aparece abaixo do header", () => {
    const cards = [
      { id: "anime-1", top: -300, bottom: -100 },
      { id: "anime-2", top: 20, bottom: 120 },
      { id: "anime-3", top: 140, bottom: 240 },
    ];
    expect(pickAnchor(cards, header, viewport)?.id).toBe("anime-2");
  });

  it("ignora card escondido inteiro atrás do header", () => {
    const cards = [
      { id: "anime-1", top: -20, bottom: 80 },
      { id: "anime-2", top: 100, bottom: 200 },
    ];
    expect(pickAnchor(cards, header, viewport)?.id).toBe("anime-2");
  });

  it("ignora cards abaixo da viewport", () => {
    expect(pickAnchor([{ id: "anime-1", top: 900, bottom: 1000 }], header, viewport)).toBeNull();
  });

  it("sem cards retorna null", () => {
    expect(pickAnchor([], header, viewport)).toBeNull();
  });
});
