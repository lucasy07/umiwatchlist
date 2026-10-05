import {
  Award,
  CalendarClock,
  Image as ImageIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { RankingCardProps } from "@/components/RankingPodium";
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
import { useTilt } from "@/hooks/use-tilt";
import {
  formatReleaseRelative,
  isAwardWinning,
  isVagueEntry,
  mediaMAL,
  nextRelease,
  rankColor,
  releasedSeasons,
} from "@/lib/anime-storage";

type RankingGridProps = RankingCardProps & {
  /** Índice real do primeiro item de `entries` no ranking. */
  offset: number;
  enableItemViewTransitions: boolean;
  onAddSeason: (animeId: string) => void;
};

/** Grid de capas do ranking MAL, abaixo do pódio. */
export function RankingGrid({
  entries,
  offset,
  highlightId,
  watchedFlashId,
  animateRankingItems,
  enableItemViewTransitions,
  checkDisabled,
  checkingId,
  onOpen,
  onEdit,
  onAddSeason,
  onCheckSeasons,
  onToggleWatched,
  onRemove,
}: RankingGridProps) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
      {entries.map((anime, restIdx) => {
        const idx = restIdx + offset;
        const malAvg = mediaMAL(anime.seasons);
        const next = nextRelease(anime);
        const seasonCount = releasedSeasons(anime.seasons).length;
        const primaryValue = malAvg != null ? malAvg.toFixed(2) : "—";
        const primaryColor = malAvg != null ? rankColor(malAvg) : "text-muted-foreground";
        return (
          <li
            key={anime.id}
            id={`anime-${anime.id}`}
            className={`${animateRankingItems ? "animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-slow motion-reduce:animate-none" : ""} [transform-style:preserve-3d] ${
              highlightId === anime.id ? "card-flash" : ""
            } ${watchedFlashId === anime.id ? "watched-card-flash" : ""}`}
            style={{
              viewTransitionName: enableItemViewTransitions ? `anime-${anime.id}` : undefined,
              ...(animateRankingItems ? { animationDelay: `${Math.min(idx, 12) * 30}ms` } : {}),
            }}
          >
            <TiltCardInner tierS={anime.tier === "S"}>
              <button
                type="button"
                onClick={() => onOpen(anime.id)}
                aria-label={`#${idx + 1}, ${anime.name}, nota MAL ${malAvg != null ? primaryValue : "sem nota"}`}
                title={anime.name}
                className="block w-full cursor-pointer appearance-none border-0 bg-transparent p-0 text-left outline-none"
              >
                <div className="relative aspect-[2/3] w-full overflow-hidden bg-card-elevated">
                  {anime.cover || anime.imageUrl ? (
                    <img
                      src={anime.cover ?? anime.imageUrl ?? undefined}
                      alt={anime.name}
                      className="h-full w-full object-cover transition-transform duration-emphasis motion-safe:group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-primary/40">
                      <ImageIcon className="h-10 w-10" />
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                  <div
                    className={`font-display absolute left-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full border px-2 text-xs font-bold backdrop-blur ${
                      idx === 0
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground"
                    }`}
                  >
                    #{idx + 1}
                  </div>
                  <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
                    <div className="flex items-baseline gap-1 rounded-full border border-primary/30 bg-background/80 px-2.5 py-1 backdrop-blur">
                      <span
                        className={`font-display text-sm font-bold tabular-nums ${primaryColor}`}
                      >
                        {primaryValue}
                      </span>
                      <span className="text-[9px] text-muted-foreground">/10</span>
                    </div>
                    <Badge
                      variant="outline"
                      className="gap-1 border-border/60 bg-background/80 px-1.5 py-0 text-[10px] backdrop-blur"
                    >
                      <span className={`font-display font-bold ${tierColor(anime.tier)}`}>
                        {anime.tier ?? "—"}
                      </span>
                    </Badge>
                  </div>
                  {isAwardWinning(anime) && (
                    <div
                      className="absolute right-2 bottom-3 flex h-7 w-7 items-center justify-center rounded-full bg-award text-award-foreground"
                      title="Award Winning (MAL)"
                      aria-label="Award Winning (MAL)"
                    >
                      <Award className="h-3.5 w-3.5" />
                    </div>
                  )}
                  {next && (
                    <span
                      className={`absolute left-2 top-11 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-lg ${
                        isVagueEntry(next)
                          ? "border border-(--border-strong) bg-card-elevated text-foreground"
                          : "bg-primary text-primary-foreground"
                      }`}
                    >
                      <CalendarClock className="h-3 w-3" />
                      {formatReleaseRelative(next.releaseDate, next.releasePrecision)}
                    </span>
                  )}
                  <div
                    className={`absolute inset-x-0 bottom-0 p-3 ${isAwardWinning(anime) ? "pr-11" : ""}`}
                  >
                    <h3 className="font-display line-clamp-2 text-sm font-semibold leading-tight tracking-tight">
                      {anime.name}
                    </h3>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {seasonCount} {seasonCount === 1 ? "temporada" : "temporadas"}
                    </p>
                  </div>
                </div>
              </button>

              <div className="@container">
                <div className="flex gap-1 p-2 @min-[224px]:hidden">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onAddSeason(anime.id)}
                    className="h-11 flex-1 text-xs transition-[color,box-shadow] duration-base hover:bg-primary/15 hover:text-primary hover:ring-1 hover:ring-primary/40 focus-visible:bg-primary/15 focus-visible:text-primary focus-visible:ring-1 focus-visible:ring-primary/40 active:bg-primary/25"
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Temp.
                  </Button>
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 text-muted-foreground hover:text-primary"
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
                          className={`mr-2 h-4 w-4 ${checkingId === anime.id ? "animate-spin motion-reduce:animate-none" : ""}`}
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
                <div className="hidden gap-1 p-2 @min-[224px]:flex">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onAddSeason(anime.id)}
                    className="h-8 flex-1 text-xs transition-[color,box-shadow] duration-base hover:bg-primary/15 hover:text-primary hover:ring-1 hover:ring-primary/40 focus-visible:bg-primary/15 focus-visible:text-primary focus-visible:ring-1 focus-visible:ring-primary/40 active:bg-primary/25"
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Temp.
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(anime.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    aria-label="Editar"
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onCheckSeasons(anime.id)}
                    disabled={checkDisabled}
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    aria-label="Verificar novas temporadas"
                    title="Verificar novas temporadas"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${checkingId === anime.id ? "animate-spin motion-reduce:animate-none" : ""}`}
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onToggleWatched(anime.id, !anime.watched)}
                    className={`h-8 w-8 hover:text-primary ${anime.watched ? "text-primary" : "text-muted-foreground"}`}
                    aria-label={anime.watched ? "Desmarcar assistido" : "Marcar como assistido"}
                    title={anime.watched ? "Desmarcar assistido" : "Marcar como assistido"}
                  >
                    <WatchedIcon watched={anime.watched} className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemove(anime)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    aria-label="Remover anime"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </TiltCardInner>
          </li>
        );
      })}
    </ul>
  );
}

function TiltCardInner({
  children,
  tierS = false,
}: {
  children: React.ReactNode;
  tierS?: boolean;
}) {
  const tilt = useTilt();
  return (
    <div
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
      // O card corta o outline do botão (overflow-hidden): o foco aparece no próprio card.
      className={`group relative overflow-hidden rounded-2xl border has-[>button:focus-visible]:outline-2 has-[>button:focus-visible]:outline-offset-2 has-[>button:focus-visible]:outline-ring ${
        tierS ? "border-tier-s/70 ring-1 ring-inset ring-tier-s/40" : "border-border/60"
      } transition-[border-color,box-shadow] duration-base hover:border-primary/50 hover:shadow-[var(--shadow-elegant)]`}
      style={{
        background: "var(--gradient-card)",
        boxShadow: "var(--shadow-card)",
        transformOrigin: "center",
      }}
    >
      {children}
    </div>
  );
}
