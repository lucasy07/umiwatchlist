import { queryOptions } from "@tanstack/react-query";

import type { Anime } from "@/lib/anime-storage";
import { fetchAnilistBanner } from "@/lib/anilist-client";

/** malId usado para buscar o banner: o do anime ou o da primeira temporada que tiver. */
export function bannerMalId(anime: Pick<Anime, "malId" | "seasons">): number | null {
  return anime.malId ?? anime.seasons.find((s) => s.malId)?.malId ?? null;
}

/** Opções compartilhadas da query do banner, para o pódio e o detalhe usarem o mesmo cache. */
export function anilistBannerQueryOptions(malId: number | null) {
  return queryOptions({
    queryKey: ["anilist-banner", malId],
    queryFn: ({ signal }) => fetchAnilistBanner(malId as number, signal),
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  });
}
