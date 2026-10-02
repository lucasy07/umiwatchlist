import { describe, expect, it } from "vitest";

import { splitPodium } from "@/lib/ranking-podium";

const ranked = ["a", "b", "c", "d", "e"];

describe("splitPodium", () => {
  it("mostra o pódio no modo MAL sem busca e a lista começa no 4º", () => {
    expect(splitPodium(ranked, { scoreMode: "mal", search: "" })).toEqual({
      podium: ["a", "b", "c"],
      rest: ["d", "e"],
      offset: 3,
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
      rest: [],
      offset: 3,
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
    expect(splitPodium(ranked, { scoreMode: "gosto", search: "" }).podium).toBeNull();
  });

  it("nunca perde nem duplica itens", () => {
    for (const len of [0, 1, 2, 3, 4, 10]) {
      const list = Array.from({ length: len }, (_, i) => i);
      for (const search of ["", "x"]) {
        const { podium, rest, offset } = splitPodium(list, { scoreMode: "mal", search });
        expect([...(podium ?? []), ...rest]).toEqual(list);
        expect(offset).toBe(podium?.length ?? 0);
      }
    }
  });
});
