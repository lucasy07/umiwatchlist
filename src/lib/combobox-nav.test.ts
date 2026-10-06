import { describe, expect, it } from "vitest";

import { moveActiveIndex } from "@/lib/combobox-nav";

describe("moveActiveIndex", () => {
  it("sem opção ativa, ↓ vai para a primeira e ↑ para a última", () => {
    expect(moveActiveIndex(-1, 1, 5)).toBe(0);
    expect(moveActiveIndex(-1, -1, 5)).toBe(4);
  });

  it("avança e volta uma posição", () => {
    expect(moveActiveIndex(1, 1, 5)).toBe(2);
    expect(moveActiveIndex(2, -1, 5)).toBe(1);
  });

  it("dá a volta nas pontas", () => {
    expect(moveActiveIndex(4, 1, 5)).toBe(0);
    expect(moveActiveIndex(0, -1, 5)).toBe(4);
  });

  it("lista vazia não tem opção ativa", () => {
    expect(moveActiveIndex(-1, 1, 0)).toBe(-1);
    expect(moveActiveIndex(3, -1, 0)).toBe(-1);
  });
});
