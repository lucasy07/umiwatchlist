import type { Announcements, UniqueIdentifier } from "@dnd-kit/core";

import { type Anime, type Tier, TIER_VALUE } from "@/lib/anime-storage";

type TierlistEntry = Pick<Anime, "id" | "name" | "tier">;

/** Instruções lidas ao focar uma capa da tierlist (o padrão do dnd-kit é em inglês). */
export const TIERLIST_DND_INSTRUCTIONS =
  "Para pegar um anime, pressione espaço ou Enter. Use as setas para mover entre as fileiras, espaço ou Enter para soltar e Esc para cancelar.";

function isTier(id: string): id is Tier {
  return Object.hasOwn(TIER_VALUE, id);
}

function tierPhrase(tier: Tier | null) {
  return tier ? `na tier ${tier}` : "sem tier";
}

/**
 * Locução do alvo do arraste ("na tier S", "junto de X, na tier A"): outro anime, uma
 * fileira de tier ou a fileira "none" (Sem tier), com os mesmos ids do TierlistBoard.
 */
export function describeTierTarget(overId: UniqueIdentifier, entries: TierlistEntry[]): string {
  const id = String(overId);
  if (id === "none") return "em Sem tier";
  if (isTier(id)) return `na tier ${id}`;
  const anime = entries.find((a) => a.id === id);
  return anime ? `junto de ${anime.name}, ${tierPhrase(anime.tier)}` : "junto de outro anime";
}

/** Anúncios em pt-BR do arraste da tierlist, com nome do anime e da tier. */
export function tierlistAnnouncements(entries: TierlistEntry[]): Announcements {
  const nameOf = (id: UniqueIdentifier) =>
    entries.find((a) => a.id === String(id))?.name ?? "anime";
  return {
    onDragStart: ({ active }) => `Pegou ${nameOf(active.id)}.`,
    // Ao pegar, o dnd-kit já dispara onDragOver sobre o próprio card; sem anúncio aqui,
    // o "Pegou …" não é sobrescrito.
    onDragOver: ({ active, over }) => {
      if (over?.id === active.id) return undefined;
      return over
        ? `${nameOf(active.id)} ${describeTierTarget(over.id, entries)}.`
        : `${nameOf(active.id)} fora de uma fileira.`;
    },
    onDragEnd: ({ active, over }) => {
      if (!over) return `${nameOf(active.id)} solto fora da tierlist; nada mudou.`;
      if (over.id === active.id)
        return `${nameOf(active.id)} solto na posição original; nada mudou.`;
      return `${nameOf(active.id)} solto ${describeTierTarget(over.id, entries)}.`;
    },
    onDragCancel: ({ active }) => `Arraste cancelado; ${nameOf(active.id)} voltou ao lugar.`,
  };
}
