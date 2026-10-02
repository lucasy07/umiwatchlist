export const PODIUM_SIZE = 3;

export type PodiumSplit<T> = {
  /** Os 3 primeiros quando o pódio aparece; null quando a lista é exibida inteira. */
  podium: T[] | null;
  /** O que vai para a lista/grid abaixo do pódio. */
  rest: T[];
  /** Índice real do primeiro item de `rest` no ranking (para exibir #4, #5...). */
  offset: number;
};

/**
 * Decide numa única condição se o pódio aparece e onde a lista começa, para nenhum
 * anime sumir nem duplicar: só no modo MAL, sem busca por texto e com pelo menos 3 animes.
 */
export function splitPodium<T>(
  ranked: T[],
  opts: { scoreMode: "mal" | "gosto"; search: string },
): PodiumSplit<T> {
  const visible =
    opts.scoreMode === "mal" && opts.search.trim() === "" && ranked.length >= PODIUM_SIZE;
  if (!visible) return { podium: null, rest: ranked, offset: 0 };
  return {
    podium: ranked.slice(0, PODIUM_SIZE),
    rest: ranked.slice(PODIUM_SIZE),
    offset: PODIUM_SIZE,
  };
}
