export const PODIUM_SIZE = 3;

export type PodiumSplit<T> = {
  /** Os 3 primeiros quando o pódio aparece; null quando a lista é exibida inteira. */
  podium: T[] | null;
  /** O que vai para a lista/grid abaixo do pódio: sempre o ranking inteiro. */
  rest: T[];
  /** Índice real do primeiro item de `rest` no ranking; sempre 0, a lista começa no #1. */
  offset: number;
};

/**
 * Decide se o pódio aparece: só no modo MAL, sem busca por texto e com pelo menos 3 animes.
 * O pódio é só destaque; a lista abaixo continua completa, a partir do #1.
 */
export function splitPodium<T>(
  ranked: T[],
  opts: { scoreMode: "mal" | "gosto"; search: string },
): PodiumSplit<T> {
  const visible =
    opts.scoreMode === "mal" && opts.search.trim() === "" && ranked.length >= PODIUM_SIZE;
  return { podium: visible ? ranked.slice(0, PODIUM_SIZE) : null, rest: ranked, offset: 0 };
}
