import type { Announcements, UniqueIdentifier } from "@dnd-kit/core";

import type { Season } from "@/lib/anime-storage";

type SeasonEntry = Pick<Season, "id" | "name">;

/** Instruções lidas ao focar a alça de arrastar (o padrão do dnd-kit é em inglês). */
export const SEASON_DND_INSTRUCTIONS =
  "Para pegar uma temporada, pressione espaço ou Enter. Use as setas para mover, espaço ou Enter para soltar e Esc para cancelar.";

/** Anúncios em pt-BR da reordenação de temporadas, com nome e posição. */
export function seasonAnnouncements(seasons: SeasonEntry[]): Announcements {
  const nameOf = (id: UniqueIdentifier) =>
    seasons.find((s) => s.id === String(id))?.name.trim() || "temporada";
  const position = (id: UniqueIdentifier) => {
    const index = seasons.findIndex((s) => s.id === String(id));
    return index === -1 ? "fora da lista" : `na posição ${index + 1} de ${seasons.length}`;
  };
  return {
    onDragStart: ({ active }) => `Pegou ${nameOf(active.id)}.`,
    // Ao pegar, o dnd-kit já dispara onDragOver sobre o próprio item; sem anúncio aqui,
    // o "Pegou …" não é sobrescrito.
    onDragOver: ({ active, over }) => {
      if (over?.id === active.id) return undefined;
      return over
        ? `${nameOf(active.id)} ${position(over.id)}.`
        : `${nameOf(active.id)} fora da lista.`;
    },
    onDragEnd: ({ active, over }) => {
      if (!over || over.id === active.id) {
        return `${nameOf(active.id)} solto na posição original; nada mudou.`;
      }
      return `${nameOf(active.id)} solto ${position(over.id)}.`;
    },
    onDragCancel: ({ active }) => `Arraste cancelado; ${nameOf(active.id)} voltou ao lugar.`,
  };
}
