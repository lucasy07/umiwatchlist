import { useQuery } from "@tanstack/react-query";
import { Image as ImageIcon, MoreHorizontal, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { type CSSProperties, useId, useState } from "react";

import { tierColor } from "@/components/TierPicker";
import { WatchedIcon } from "@/components/WatchedIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { anilistBannerQueryOptions, bannerMalId } from "@/lib/anime-banner";
import { type Anime, mediaMAL, rankColor } from "@/lib/anime-storage";

/** Estado e ações comuns aos cards do ranking MAL (pódio, grid e lista). */
export type RankingCardProps = {
  entries: Anime[];
  highlightId: string | null;
  watchedFlashId: string | null;
  animateRankingItems: boolean;
  checkDisabled: boolean;
  checkingId: string | null;
  onOpen: (animeId: string) => void;
  onEdit: (animeId: string) => void;
  onCheckSeasons: (animeId: string) => void;
  onToggleWatched: (animeId: string, next: boolean) => void;
  onRemove: (anime: Anime) => void;
};

/** Ordem visual no desktop: #2, #1, #3. No mobile o #1 ocupa a linha de cima. */
const PLACE_CLASS = ["col-span-2 md:col-span-1 md:order-2", "md:order-1", "md:order-3"] as const;

export function RankingPodium({
  entries,
  highlightId,
  watchedFlashId,
  animateRankingItems,
  checkDisabled,
  checkingId,
  onOpen,
  onEdit,
  onCheckSeasons,
  onToggleWatched,
  onRemove,
}: RankingCardProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="mb-6">
      <h2 id={headingId} className="sr-only">
        Top 3
      </h2>
      <ol className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-[1fr_1.25fr_1fr] md:items-end">
        {entries.map((anime, idx) => (
          <PodiumCard
            key={anime.id}
            anime={anime}
            idx={idx}
            className={`${PLACE_CLASS[idx] ?? ""} ${
              animateRankingItems
                ? "animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-slow motion-reduce:animate-none"
                : ""
            } ${highlightId === anime.id ? "card-flash" : ""} ${
              watchedFlashId === anime.id ? "watched-card-flash" : ""
            }`}
            style={{
              background: "var(--gradient-card)",
              boxShadow:
                idx === 0 ? "var(--shadow-card), var(--shadow-glow)" : "var(--shadow-card)",
              ...(animateRankingItems ? { animationDelay: `${idx * 30}ms` } : {}),
            }}
            checkDisabled={checkDisabled}
            checking={checkingId === anime.id}
            onOpen={onOpen}
            onEdit={onEdit}
            onCheckSeasons={onCheckSeasons}
            onToggleWatched={onToggleWatched}
            onRemove={onRemove}
          />
        ))}
      </ol>
    </section>
  );
}

function PodiumCard({
  anime,
  idx,
  className,
  style,
  checkDisabled,
  checking,
  onOpen,
  onEdit,
  onCheckSeasons,
  onToggleWatched,
  onRemove,
}: {
  anime: Anime;
  idx: number;
  className: string;
  style: CSSProperties;
  checkDisabled: boolean;
  checking: boolean;
  onOpen: (animeId: string) => void;
  onEdit: (animeId: string) => void;
  onCheckSeasons: (animeId: string) => void;
  onToggleWatched: (animeId: string, next: boolean) => void;
  onRemove: (anime: Anime) => void;
}) {
  const first = idx === 0;
  const cover = anime.cover ?? anime.imageUrl ?? null;
  const malAvg = mediaMAL(anime.seasons);
  const scoreText = malAvg != null ? malAvg.toFixed(2) : "—";
  const scoreColor = malAvg != null ? rankColor(malAvg) : "text-muted-foreground";

  return (
    <li
      className={`group relative overflow-hidden rounded-2xl border transition-[translate,border-color,box-shadow] motion-safe:hover:-translate-y-0.5 ${
        first
          ? "border-primary/60 hover:border-primary"
          : "border-border/60 hover:border-primary/50"
      } ${className}`}
      style={style}
    >
      <button
        type="button"
        onClick={() => onOpen(anime.id)}
        aria-label={`#${idx + 1}, ${anime.name}, nota MAL ${malAvg != null ? scoreText : "sem nota"}`}
        className="focus-ring block w-full cursor-pointer appearance-none rounded-2xl border-0 bg-transparent p-0 text-left"
      >
        <div
          aria-hidden="true"
          className={`relative w-full overflow-hidden ${first ? "h-28 sm:h-36" : "h-24 sm:h-28"}`}
        >
          {cover && (
            <img
              src={cover}
              alt=""
              className="absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-xl"
              loading="lazy"
            />
          )}
          <PodiumBanner anime={anime} />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-card/40 to-card" />
        </div>

        <div
          className={`relative flex gap-3 px-3 pb-3 sm:px-4 sm:pb-4 ${
            first
              ? "-mt-14 items-end sm:-mt-20"
              : "-mt-10 flex-col items-start gap-2 sm:-mt-12 lg:flex-row lg:items-end lg:gap-3"
          }`}
        >
          <div
            className={`relative aspect-[2/3] shrink-0 overflow-hidden rounded-lg bg-card-elevated ring-1 ring-border/60 ${
              first ? "w-24 sm:w-28" : "w-16 sm:w-20"
            }`}
          >
            {cover ? (
              <img
                src={cover}
                alt=""
                className="h-full w-full object-cover transition-transform duration-emphasis motion-safe:group-hover:scale-105"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-primary/40">
                <ImageIcon className="h-7 w-7" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className={`font-display font-extrabold leading-none tabular-nums ${
                first
                  ? "text-4xl text-primary sm:text-5xl"
                  : "text-2xl text-muted-foreground sm:text-3xl"
              }`}
            >
              #{idx + 1}
            </div>
            {first && (
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Melhor avaliado
              </p>
            )}
            <h3
              className={`font-display mt-1 line-clamp-2 break-words font-semibold leading-tight tracking-tight ${
                first ? "text-base sm:text-lg" : "text-sm"
              }`}
              title={anime.name}
            >
              {anime.name}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <div className="flex items-baseline gap-1">
                <span
                  className={`font-display font-bold tabular-nums ${scoreColor} ${
                    first ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl"
                  }`}
                >
                  {scoreText}
                </span>
                <span className="text-[10px] text-muted-foreground">/10</span>
              </div>
              <Badge
                variant="outline"
                className="gap-1 border-primary/30 px-1.5 py-0 text-[10px] text-foreground/80"
              >
                <span className={`font-display font-bold ${tierColor(anime.tier)}`}>
                  {anime.tier ?? "—"}
                </span>
              </Badge>
            </div>
          </div>
        </div>
      </button>

      <div className="absolute right-1.5 top-1.5">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 rounded-full bg-background/70 text-muted-foreground backdrop-blur hover:bg-background/90 hover:text-primary"
              aria-label={`Mais ações de ${anime.name}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" collisionPadding={16} className="w-56">
            <DropdownMenuItem className="min-h-11" onSelect={() => onEdit(anime.id)}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11"
              disabled={checkDisabled}
              onSelect={() => onCheckSeasons(anime.id)}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${checking ? "animate-spin motion-reduce:animate-none" : ""}`}
              />
              Verificar novas temporadas
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11"
              onSelect={() => onToggleWatched(anime.id, !anime.watched)}
            >
              <WatchedIcon watched={anime.watched} className="mr-2 h-4 w-4" />
              {anime.watched ? "Desmarcar assistido" : "Marcar como assistido"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="min-h-11 text-destructive focus:text-destructive"
              onSelect={() => onRemove(anime)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remover anime
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

/** Banner do AniList de cada card do pódio, sobre a capa desfocada; mesma query (e cache) do detalhe. */
function PodiumBanner({ anime }: { anime: Anime }) {
  const malId = bannerMalId(anime);
  const { data: banner = null } = useQuery({
    ...anilistBannerQueryOptions(malId),
    enabled: malId != null,
  });
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  if (!banner) return null;
  return (
    <img
      src={banner}
      alt=""
      onLoad={() => setLoadedSrc(banner)}
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-emphasis motion-reduce:transition-none ${
        loadedSrc === banner ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}
