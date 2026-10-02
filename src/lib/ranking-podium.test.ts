import { describe, expect, it } from "vitest";

import { splitPodium } from "@/lib/ranking-podium";

const ranked = ["a", "b", "c", "d", "e"];

describe("splitPodium", () => {
  it("mostra o pódio no modo MAL sem busca e mantém a lista inteira a partir do #1", () => {
    expect(splitPodium(ranked, { scoreMode: "mal", search: "" })).toEqual({
      podium: ["a", "b", "c"],
      rest: ranked,
      offset: 0,
    });
  });

  it("esconde com busca por texto", () => {
    expect(splitPodium(ranked, { scoreMode: "mal", search: "fri" })).toEqual({
      podium: null,
      rest: ranked,
      offset: 0,
    });
  });

  it("ignora busca só com espaços", () => {
    expect(splitPodium(ranked, { scoreMode: "mal", search: "   " }).podium).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("mostra o pódio da lista filtrada", () => {
    const filtered = ["c", "d", "e"];
    expect(splitPodium(filtered, { scoreMode: "mal", search: "" })).toEqual({
      podium: ["c", "d", "e"],
      rest: filtered,
      offset: 0,
    });
  });

  it("esconde com menos de 3 animes", () => {
    expect(splitPodium(["a", "b"], { scoreMode: "mal", search: "" })).toEqual({
      podium: null,
      rest: ["a", "b"],
      offset: 0,
    });
  });

  it("esconde no modo Meu gosto", () => {
    expect(splitPodium(ranked, { scoreMode: "gosto", search: "" })).toEqual({
      podium: null,
      rest: ranked,
      offset: 0,
    });
  });

  it("a lista é sempre o ranking inteiro, com ou sem pódio", () => {
    for (const len of [0, 1, 2, 3, 4, 10]) {
      const list = Array.from({ length: len }, (_, i) => i);
      for (const search of ["", "x"]) {
        const { podium, rest, offset } = splitPodium(list, { scoreMode: "mal", search });
        expect(rest).toEqual(list);
        expect(offset).toBe(0);
        expect(podium).toEqual(len >= 3 && search === "" ? list.slice(0, 3) : null);
      }
    }
  });
});
