import type { Active, Over } from "@dnd-kit/core";
import { describe, expect, it } from "vitest";

import { describeTierTarget, tierlistAnnouncements } from "@/lib/tierlist-announcements";

const entries = [
  { id: "a1", name: "Frieren", tier: "S" as const },
  { id: "a2", name: "Gintama", tier: "A" as const },
  { id: "a3", name: "Nichijou", tier: null },
];

const active = { id: "a1" } as Active;
const over = (id: string) => ({ id }) as Over;
const announcements = tierlistAnnouncements(entries);

describe("describeTierTarget", () => {
  it("descreve fileira de tier, Sem tier e outro anime", () => {
    expect(describeTierTarget("B", entries)).toBe("na tier B");
    expect(describeTierTarget("none", entries)).toBe("em Sem tier");
    expect(describeTierTarget("a2", entries)).toBe("junto de Gintama, na tier A");
    expect(describeTierTarget("a3", entries)).toBe("junto de Nichijou, sem tier");
  });

  it("não lê o id cru de um anime desconhecido", () => {
    expect(describeTierTarget("uuid-x", entries)).toBe("junto de outro anime");
  });
});

describe("tierlistAnnouncements", () => {
  it("anuncia o início pelo nome", () => {
    expect(announcements.onDragStart({ active })).toBe("Pegou Frieren.");
  });

  it("anuncia o alvo durante o arraste", () => {
    expect(announcements.onDragOver({ active, over: over("C") })).toBe("Frieren na tier C.");
    expect(announcements.onDragOver({ active, over: null })).toBe("Frieren fora de uma fileira.");
  });

  it("anuncia onde soltou, ou que nada mudou", () => {
    expect(announcements.onDragEnd({ active, over: over("a2") })).toBe(
      "Frieren solto junto de Gintama, na tier A.",
    );
    expect(announcements.onDragEnd({ active, over: over("none") })).toBe(
      "Frieren solto em Sem tier.",
    );
    expect(announcements.onDragEnd({ active, over: null })).toBe(
      "Frieren solto fora da tierlist; nada mudou.",
    );
  });

  it("não anuncia nem altera nada sobre o próprio card", () => {
    expect(announcements.onDragOver({ active, over: over("a1") })).toBeUndefined();
    expect(announcements.onDragEnd({ active, over: over("a1") })).toBe(
      "Frieren solto na posição original; nada mudou.",
    );
  });

  it("anuncia o cancelamento", () => {
    expect(announcements.onDragCancel({ active, over: null })).toBe(
      "Arraste cancelado; Frieren voltou ao lugar.",
    );
  });

  it("usa 'anime' quando o id não está na lista", () => {
    expect(announcements.onDragStart({ active: { id: "zz" } as Active })).toBe("Pegou anime.");
  });
});
