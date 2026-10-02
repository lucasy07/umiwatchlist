import { useQuery } from "@tanstack/react-query";
import { Award, Image as ImageIcon, Pencil, RefreshCw } from "lucide-react";
import { useState } from "react";

import { SeasonThumb } from "@/components/SeasonThumb";
import { UnreleasedTag } from "@/components/UnreleasedTag";
import { tierBg } from "@/components/TierPicker";
import { WatchedIcon } from "@/components/WatchedIcon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  type Anime,
  animeMinutes,
  AWARD_GENRE,
  formatLastChecked,
  formatMinutes,
  isAwardWinning,
  isExcludedFromAverage,
  isUnreleased,
  formatReleaseDate,
  mediaMAL,
  releasedSeasons,
} from "@/lib/anime-storage";
import { anilistBannerQueryOptions, bannerMalId } from "@/lib/anime-banner";
import { formatScore, scoreColor } from "@/lib/score-format";

type AnimeDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anime: Anime | null;
  scoreMode: "mal" | "gosto";
  checking: boolean;
  checkingId: string | null;
  updatingMalScores: boolean;
  onCheckSeasons: (animeId: string) => void;
  onToggleWatched: (animeId: string, next: boolean) => void;
  onEdit: (animeId: string) => void;
  onSelectGenre: (genre: string) => void;
};

function Poster({
  src,
  alt,
  className,
  hidden = false,
}: {
  src: string | null;
  alt: string;
  className: string;
  hidden?: boolean;
}) {
  const base = `aspect-[2/3] shrink-0 rounded-xl ring-1 ring-border/50 shadow-[var(--shadow-card)] ${className}`;
  return src ? (
    <img
      src={src}
      alt={hidden ? "" : alt}
      aria-hidden={hidden || undefined}
      className={`${base} object-cover`}
    />
  ) : (
    <div
      aria-hidden={hidden || undefined}
      className={`${base} flex items-center justify-center bg-secondary text-muted-foreground`}
    >
      <ImageIcon className="h-8 w-8" />
    </div>
  );
}

export function AnimeDetailDialog({
  open,
  onOpenChange,
  anime,
  scoreMode,
  checking,
  checkingId,
  updatingMalScores,
  onCheckSeasons,
  onToggleWatched,
  onEdit,
  onSelectGenre,
}: AnimeDetailDialogProps) {
  const image = anime ? (anime.cover ?? anime.imageUrl ?? null) : null;
  const malId = anime ? bannerMalId(anime) : null;
  const { data: banner = null } = useQuery({
    ...anilistBannerQueryOptions(malId),
    enabled: open && malId != null,
  });
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const bannerLoaded = banner != null && loadedSrc === banner;
  const mal = anime ? mediaMAL(anime.seasons) : null;
  const time = anime ? animeMinutes(anime) : null;
  const seasonCount = anime ? releasedSeasons(anime.seasons).length : 0;
  const meta = anime
    ? [
        `${seasonCount} ${seasonCount === 1 ? "temporada" : "temporadas"}`,
        time && time.episodes > 0 && `${time.episodes} episódios`,
        time && time.minutes > 0 && formatMinutes(time.minutes),
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] gap-0 overflow-y-auto overflow-x-hidden border-border bg-card p-0 sm:max-w-3xl [&>button:last-child]:z-20 [&>button:last-child]:rounded-full [&>button:last-child]:bg-background/55 [&>button:last-child]:p-3.5 [&>button:last-child]:opacity-100 sm:[&>button:last-child]:p-2">
        {anime ? (
          <>
            <section className="relative overflow-hidden px-5 pb-5 pt-14 sm:h-[340px] sm:p-0">
              {image && (
                <img
                  src={image}
                  alt=""
                  aria-hidden="true"
                  className={`absolute inset-[-40px] h-[calc(100%+80px)] w-[calc(100%+80px)] max-w-none scale-110 object-cover blur-2xl transition-opacity duration-500 motion-reduce:transition-none ${
                    bannerLoaded ? "opacity-0" : "opacity-60"
                  }`}
                />
              )}
              {banner && (
                <img
                  src={banner}
                  alt=""
                  aria-hidden="true"
                  onLoad={() => setLoadedSrc(banner)}
                  onError={() => setLoadedSrc(null)}
                  className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-500 motion-reduce:transition-none ${
                    bannerLoaded ? "opacity-100" : "opacity-0"
                  }`}
                />
              )}
              {(image || banner) && (
                <div
                  className="absolute inset-0"
                  style={{ background: "var(--gradient-hero-scrim)" }}
                />
              )}
              {banner && (
                <div
                  aria-hidden="true"
                  className={`absolute inset-0 transition-opacity duration-500 motion-reduce:transition-none ${
                    bannerLoaded ? "opacity-100" : "opacity-0"
                  }`}
                  style={{ background: "var(--gradient-hero-banner-scrim)" }}
                />
              )}

              <div className="relative z-10 flex flex-col gap-3.5 sm:absolute sm:bottom-7 sm:left-8 sm:right-[15rem] sm:max-w-[500px]">
                <div className="flex min-h-36 items-end gap-4 sm:min-h-0">
                  {!bannerLoaded && (
                    <Poster src={image} alt={anime.name} className="w-24 sm:hidden" />
                  )}
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-lg font-display text-lg font-extrabold sm:h-10 sm:w-10 sm:text-xl ${
                        anime.tier
                          ? `${tierBg(anime.tier)} text-tier-foreground`
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {anime.tier ?? "—"}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        MAL
                      </span>
                      <span
                        className={`font-display text-2xl font-bold leading-none tabular-nums ${scoreColor(mal)}`}
                      >
                        {formatScore(mal)}
                        {mal !== null && (
                          <span className="ml-0.5 text-xs text-muted-foreground">/10</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <DialogTitle className="font-display text-2xl font-extrabold leading-tight break-words sm:text-4xl">
                  {anime.name}
                </DialogTitle>

                {meta && <p className="text-sm text-muted-foreground">{meta}</p>}

                {anime.genres === null || anime.genres === undefined ? (
                  <p className="text-sm text-muted-foreground">Sem gêneros</p>
                ) : anime.genres.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum gênero no MAL</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {isAwardWinning(anime) && (
                      <button
                        key={AWARD_GENRE}
                        type="button"
                        aria-label="Filtrar por Award Winning"
                        title="Award Winning (MAL)"
                        onClick={() => onSelectGenre(AWARD_GENRE)}
                        className="focus-ring inline-flex min-h-11 items-center gap-1 rounded-md bg-award px-2 py-1 text-[11px] font-medium text-award-foreground transition-colors hover:brightness-110 sm:min-h-0"
                      >
                        <Award className="h-3 w-3" />
                        Award Winning
                      </button>
                    )}
                    {anime.genres
                      .filter((g) => g.trim().toLowerCase() !== AWARD_GENRE.toLowerCase())
                      .map((g) => (
                        <button
                          key={g}
                          type="button"
                          aria-label={`Filtrar por ${g}`}
                          onClick={() => onSelectGenre(g)}
                          className="focus-ring min-h-11 rounded-sm text-sm text-foreground underline decoration-foreground/40 underline-offset-4 transition-colors hover:text-primary sm:min-h-0"
                        >
                          {g}
                        </button>
                      ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => onEdit(anime.id)}
                    className="h-11 flex-1 sm:h-9 sm:flex-none"
                  >
                    <Pencil className="mr-1 h-4 w-4" /> Editar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => onToggleWatched(anime.id, !anime.watched)}
                    className="h-11 bg-card/60 sm:h-9"
                  >
                    <WatchedIcon watched={anime.watched} />
                    {anime.watched ? "Desmarcar" : "Assistido"}
                  </Button>
                  {scoreMode !== "gosto" && (
                    <>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label="Verificar novas temporadas"
                        title="Verificar novas temporadas"
                        onClick={() => onCheckSeasons(anime.id)}
                        disabled={
                          checking || checkingId !== null || updatingMalScores || !anime.malId
                        }
                        className="h-11 w-11 bg-card/60 sm:h-9 sm:w-9"
                      >
                        <RefreshCw
                          className={`h-4 w-4 ${checkingId === anime.id ? "animate-spin motion-reduce:animate-none" : ""}`}
                        />
                      </Button>
                      <span className="text-[11px] text-muted-foreground">
                        {formatLastChecked(anime.lastCheckedAt)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <Poster
                src={image}
                alt={anime.name}
                hidden={bannerLoaded}
                className={`absolute bottom-7 right-8 z-10 hidden w-44 transition-opacity duration-300 motion-reduce:transition-none sm:block ${
                  bannerLoaded ? "pointer-events-none opacity-0" : ""
                }`}
              />
            </section>

            <div className="grid gap-2 px-5 pb-8 pt-6 sm:px-8">
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Temporadas
              </h4>
              {anime.seasons.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma temporada</p>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-3">
                  {anime.seasons.map((season) => {
                    const unreleased = isUnreleased(season);
                    const excluded = !unreleased && isExcludedFromAverage(season);
                    return (
                      <div
                        key={season.id}
                        className={`flex flex-col gap-1 ${excluded ? "opacity-60" : ""}`}
                      >
                        {unreleased ? (
                          <div className="relative overflow-hidden rounded border border-dashed border-border-interactive">
                            <SeasonThumb
                              season={season}
                              className="aspect-[2/3] w-full opacity-55"
                              alt={season.name}
                            />
                            <UnreleasedTag className="absolute top-1 left-1" />
                          </div>
                        ) : (
                          <SeasonThumb
                            season={season}
                            className="aspect-[2/3] w-full rounded"
                            alt={season.name}
                          />
                        )}
                        <p
                          className="line-clamp-2 text-xs font-medium leading-tight"
                          title={season.name}
                        >
                          {season.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {unreleased ? (
                            <>
                              {formatReleaseDate(season.releaseDate, season.releasePrecision)}
                              <span className="block">não entra em média nem tempo</span>
                            </>
                          ) : (
                            [
                              season.type,
                              season.year,
                              typeof season.malScore === "number" &&
                                `MAL ${season.malScore.toFixed(2)}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          )}
                          {excluded && <span className="block">fora da média</span>}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div role="status" aria-busy="true" className="grid gap-2 px-5 pb-8 pt-14 sm:px-8">
            <DialogTitle className="font-display text-xl font-bold">Detalhes do anime</DialogTitle>
            <p className="text-sm text-muted-foreground">Carregando...</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
