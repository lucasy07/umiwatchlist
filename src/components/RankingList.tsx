import {
  Award,
  CalendarClock,
  ChevronDown,
  Image as ImageIcon,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { Collapse } from "@/components/Collapse";
import type { RankingCardProps } from "@/components/RankingPodium";
import { SortableCardSeasons } from "@/components/SortableCardSeasons";
import { TierPicker, tierColor } from "@/components/TierPicker";
import { WatchedIcon } from "@/components/WatchedIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AWARD_GENRE,
  type Tier,
  formatReleaseDate,
  formatReleaseRelative,
  isAwardWinning,
  isVagueEntry,
  mediaMAL,
  nextRelease,
  rankColor,
  releasedSeasons,
} from "@/lib/anime-storage";

type RankingListProps = Omit<RankingCardProps, "onOpen"> & {
  /** Índice real do primeiro item de `entries` no ranking. */
  offset: number;
  enableItemViewTransitions: boolean;
  /** Fica na rota para sobreviver à troca entre grid e lista. */
  expanded: Record<string, boolean>;
  /** Gêneros do filtro ativo, em minúsculas, para destacar as tags do card. */
  genreFilterLower: Set<string>;
  onToggleExpand: (animeId: string) => void;
  onSelectAwardFilter: () => void;
  onSetTier: (animeId: string, tier: Tier | null) => void;
  onReorderSeasons: (animeId: string, from: number, to: number) => void;
  onDeleteSeason: (animeId: string, seasonId: string) => void;
  onClearUpcoming: (animeId: string) => void;
  onAddSeason: (animeId: string) => void;
};

/** Lista expansível do ranking MAL, abaixo do pódio. */
export function RankingList({
  entries,
  offset,
  highlightId,
  watchedFlashId,
  animateRankingItems,
  enableItemViewTransitions,
  checkDisabled,
  checkingId,
  expanded,
  genreFilterLower,
  onEdit,
  onAddSeason,
  onCheckSeasons,
  onToggleWatched,
  onRemove,
  onToggleExpand,
  onSelectAwardFilter,
  onSetTier,
  onReorderSeasons,
  onDeleteSeason,
  onClearUpcoming,
}: RankingListProps) {
  return (
    <ul className="grid gap-4">
      {entries.map((anime, restIdx) => {
        const idx = restIdx + offset;
        const malAvg = mediaMAL(anime.seasons);
        const next = nextRelease(anime);
        const seasonCount = releasedSeasons(anime.seasons).length;
        const primaryValue = malAvg != null ? malAvg.toFixed(2) : "—";
        const primaryColor = malAvg != null ? rankColor(malAvg) : "text-muted-foreground";
        const isOpen = expanded[anime.id] ?? false;
        const score = (
          <div className="flex items-baseline gap-1">
            <span
              className={`font-display text-xl font-bold tabular-nums sm:text-3xl ${primaryColor}`}
            >
              {primaryValue}
            </span>
            <span className="text-[10px] text-muted-foreground">/10</span>
          </div>
        );
        const tierBadge = (
          <Badge
            variant="outline"
            className="gap-1 border-primary/30 px-1.5 py-0 text-[10px] text-foreground/80"
          >
            <span
              key={anime.tier ?? "none"}
              className={`tier-badge-pop font-display font-bold transition-colors duration-base motion-reduce:transition-none ${tierColor(anime.tier)}`}
            >
              {anime.tier ?? "—"}
            </span>
          </Badge>
        );
        return (
          <li
            key={anime.id}
            id={`anime-${anime.id}`}
            className={`group relative overflow-hidden rounded-2xl border border-border/60 transition-[translate,border-color,box-shadow] ${animateRankingItems ? "animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-slow motion-reduce:animate-none" : ""} motion-safe:hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[var(--shadow-elegant)] ${
              highlightId === anime.id ? "card-flash" : ""
            } ${watchedFlashId === anime.id ? "watched-card-flash" : ""}`}
            style={{
              viewTransitionName: enableItemViewTransitions ? `anime-${anime.id}` : undefined,
              background: "var(--gradient-card)",
              boxShadow: "var(--shadow-card)",
              ...(animateRankingItems ? { animationDelay: `${Math.min(idx, 12) * 30}ms` } : {}),
            }}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-y-0 left-0 w-[6px] bg-tier-s transition-opacity duration-base motion-reduce:transition-none ${
                anime.tier === "S" ? "opacity-100" : "opacity-0"
              }`}
            />
            <div
              className="flex items-center gap-3 p-3 sm:gap-4 sm:p-5"
              onDoubleClick={(e) => {
                if ((e.target as HTMLElement).closest("button, a, input")) return;
                onToggleExpand(anime.id);
              }}
              onMouseDown={(e) => {
                if (e.detail > 1) e.preventDefault();
              }}
            >
              <div
                className={`font-display hidden h-10 w-8 shrink-0 items-center justify-center text-sm font-bold sm:flex sm:h-14 sm:w-10 sm:text-xl ${
                  idx === 0
                    ? "text-primary"
                    : idx === 1
                      ? "text-foreground/80"
                      : idx === 2
                        ? "text-primary/60"
                        : "text-muted-foreground/70"
                }`}
              >
                #{idx + 1}
              </div>
              <div className="relative self-stretch min-h-[120px] w-20 shrink-0 overflow-hidden rounded-lg bg-card-elevated ring-1 ring-border/40 sm:min-h-[168px] sm:w-28">
                {anime.cover || anime.imageUrl ? (
                  <img
                    src={anime.cover ?? anime.imageUrl ?? undefined}
                    alt={anime.name}
                    className="h-full w-full object-cover transition-transform duration-emphasis motion-safe:group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageIcon className="h-7 w-7 text-primary/40" />
                  </div>
                )}
                <div
                  className={`font-display absolute left-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full border px-1.5 text-[11px] font-bold backdrop-blur sm:hidden ${
                    idx === 0
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground"
                  }`}
                >
                  #{idx + 1}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  className="font-display line-clamp-2 break-words text-base font-semibold tracking-tight sm:line-clamp-1 sm:text-lg"
                  title={anime.name}
                >
                  {anime.name}
                </h3>
                <div className="mt-1 flex items-center gap-2 sm:hidden">
                  {score}
                  {tierBadge}
                </div>
                <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                  {seasonCount} {seasonCount === 1 ? "temporada" : "temporadas"}
                </p>
                {next && (
                  <span
                    className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      isVagueEntry(next)
                        ? "bg-card-elevated text-muted-foreground"
                        : "bg-primary/15 text-primary"
                    }`}
                  >
                    <CalendarClock className="h-3 w-3" />
                    {formatReleaseRelative(next.releaseDate, next.releasePrecision)}
                  </span>
                )}
                {(isAwardWinning(anime) || (anime.genres && anime.genres.length > 0)) && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {isAwardWinning(anime) && (
                      <button
                        type="button"
                        aria-label="Filtrar por Award Winning"
                        title="Award Winning (MAL)"
                        onClick={onSelectAwardFilter}
                        className="focus-ring inline-flex items-center gap-1 rounded-md bg-award px-1.5 py-0.5 text-[10px] font-medium text-award-foreground transition-colors hover:brightness-110"
                      >
                        <Award className="h-3 w-3" />
                        Award Winning
                      </button>
                    )}
                    {anime.genres
                      ?.filter((g) => g.trim().toLowerCase() !== AWARD_GENRE.toLowerCase())
                      .map((g) => {
                        const on = genreFilterLower.has(g.toLowerCase());
                        return (
                          <span
                            key={g}
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                              on
                                ? "bg-primary/15 text-primary"
                                : "bg-foreground/5 text-muted-foreground"
                            }`}
                          >
                            {g}
                          </span>
                        );
                      })}
                  </div>
                )}
              </div>
              <div className="hidden flex-col items-end gap-1 sm:flex">
                {score}
                {tierBadge}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onToggleExpand(anime.id)}
                className="h-11 w-11 shrink-0 rounded-full text-muted-foreground hover:text-primary sm:h-9 sm:w-9"
                aria-label={isOpen ? "Recolher" : "Expandir"}
                aria-expanded={isOpen}
              >
                <ChevronDown
                  className={`h-5 w-5 transition-transform duration-base ease-spring motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`}
                />
              </Button>
            </div>

            <Collapse open={isOpen}>
              <div className="border-t border-border bg-background/30 px-4 py-3 sm:px-5">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Meu tier
                  </span>
                  <TierPicker value={anime.tier} onChange={(t) => onSetTier(anime.id, t)} />
                </div>
                {anime.seasons.length === 0 ? (
                  <p className="py-2 text-center text-sm text-muted-foreground">
                    Nenhuma temporada ainda
                  </p>
                ) : (
                  <SortableCardSeasons
                    seasons={anime.seasons}
                    onReorder={(from, to) => onReorderSeasons(anime.id, from, to)}
                    onDelete={(seasonId) => onDeleteSeason(anime.id, seasonId)}
                  />
                )}
                {next && (
                  <div
                    className={`mt-3 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                      isVagueEntry(next)
                        ? "border-border bg-card-elevated/50"
                        : "border-primary/20 bg-primary/5"
                    }`}
                  >
                    <div className="min-w-0">
                      <div
                        className={`flex items-center gap-1.5 text-xs font-semibold ${
                          isVagueEntry(next) ? "text-foreground" : "text-primary"
                        }`}
                      >
                        <CalendarClock className="h-3.5 w-3.5" />
                        {formatReleaseRelative(next.releaseDate, next.releasePrecision)}
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {next.title} • {formatReleaseDate(next.releaseDate, next.releasePrecision)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        next.seasonId
                          ? onDeleteSeason(anime.id, next.seasonId)
                          : onClearUpcoming(anime.id)
                      }
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Remover lançamento"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onAddSeason(anime.id)}
                    className="flex-1"
                  >
                    <Plus className="mr-1 h-4 w-4" /> Temporada
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(anime.id)}
                    className="flex-1"
                  >
                    <Pencil className="mr-1 h-4 w-4" /> Editar anime
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onToggleWatched(anime.id, !anime.watched)}
                    className="flex-1"
                  >
                    <WatchedIcon watched={anime.watched} />
                    {anime.watched ? "Desmarcar" : "Assistido"}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => onCheckSeasons(anime.id)}
                    disabled={checkDisabled}
                    className="text-muted-foreground hover:text-primary"
                    aria-label="Verificar novas temporadas"
                    title="Verificar novas temporadas"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${checkingId === anime.id ? "animate-spin motion-reduce:animate-none" : ""}`}
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(anime)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remover anime"
                    title="Remover anime"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Collapse>
          </li>
        );
      })}
    </ul>
  );
}
