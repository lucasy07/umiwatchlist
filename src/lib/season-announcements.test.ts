import type { Active, Over } from "@dnd-kit/core";
import { describe, expect, it } from "vitest";

import { seasonAnnouncements } from "@/lib/season-announcements";

const seasons = [
  { id: "s1", name: "Frieren" },
  { id: "s2", name: "Frieren 2nd Season" },
  { id: "s3", name: "  " },
];

const active = { id: "s1" } as Active;
const over = (id: string) => ({ id }) as Over;
const announcements = seasonAnnouncements(seasons);

describe("seasonAnnouncements", () => {
  it("anuncia o início pelo nome", () => {
    expect(announcements.onDragStart({ active })).toBe("Pegou Frieren.");
  });

  it("anuncia a posição do alvo durante o arraste", () => {
    expect(announcements.onDragOver({ active, over: over("s2") })).toBe(
      "Frieren na posição 2 de 3.",
    );
    expect(announcements.onDragOver({ active, over: null })).toBe("Frieren fora da lista.");
  });

  it("não sobrescreve o início com o próprio item", () => {
    expect(announcements.onDragOver({ active, over: over("s1") })).toBeUndefined();
  });

  it("anuncia onde soltou, ou que nada mudou", () => {
    expect(announcements.onDragEnd({ active, over: over("s3") })).toBe(
      "Frieren solto na posição 3 de 3.",
    );
    expect(announcements.onDragEnd({ active, over: over("s1") })).toBe(
      "Frieren solto na posição original; nada mudou.",
    );
    expect(announcements.onDragEnd({ active, over: null })).toBe(
      "Frieren solto na posição original; nada mudou.",
    );
  });

  it("anuncia o cancelamento", () => {
    expect(announcements.onDragCancel({ active, over: null })).toBe(
      "Arraste cancelado; Frieren voltou ao lugar.",
    );
  });

  it("usa 'temporada' para nome vazio (campo em edição) ou id desconhecido", () => {
    expect(announcements.onDragStart({ active: { id: "s3" } as Active })).toBe("Pegou temporada.");
    expect(announcements.onDragStart({ active: { id: "zz" } as Active })).toBe("Pegou temporada.");
  });
});
