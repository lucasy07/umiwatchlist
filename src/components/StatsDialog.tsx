import { useMemo } from "react";
import { User } from "lucide-react";
import type { Anime, Tier } from "@/lib/anime-storage";
import {
  mediaMAL,
  allGenres,
  TIER_VALUE,
  seasonMinutes,
  animeMinutes,
  formatMinutes,
} from "@/lib/anime-storage";
import { useAuth } from "@/auth/AuthProvider";
import { useAvatarSrc } from "@/hooks/use-avatar-src";
import { tierColor, tierBg } from "@/components/TierPicker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type StatsDialogProps = {
  animes: Anime[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Stats = {
  total: number;
  watchedCount: number;
  queuedCount: number;
  totalSeasons: number;
  genresCount: number;
  watchedPercent: number;
  avgMal: number | null;
  scoredCount: number;
  bestAnime: Anime | null;
  bestScore: number | null;
  mostSeasonsAnime: Anime | null;
  mostSeasons: number | null;
  dominantTier: string | null;
  dominantTierCount: number;
  topGenre: { name: string; count: number } | null;
  seasonsPerAnime: number | null;
  tierDistribution: Array<{ tier: Tier | "none"; count: number; max: number }>;
  topGenres: Array<{ name: string; count: number; max: number }>;
  seasonTypeCounts: Array<{ name: string; count: number }>;
  decadeCounts: Array<{ name: string; count: number; max: number }>;
  timeMinutes: number;
  timeEpisodes: number;
  missingSeasons: number;
  timeTopAnimes: Array<{ name: string; minutes: number; max: number }>;
  timeByTier: Array<{ tier: Tier; minutes: number; max: number }>;
  timeByGenre: Array<{ name: string; minutes: number; max: number }>;
  avgEpisodesPerSeason: number | null;
  avgEpisodeDuration: number | null;
};

export function StatsDialog({ animes, open, onOpenChange }: StatsDialogProps) {
  const { user, profile } = useAuth();
  const avatarSrc = useAvatarSrc(profile?.avatar_url);

  // All calculations are based on the entire collection, never the filtered view.
  const stats = useMemo<Stats>(() => {
    const total = animes.length;
    const watchedCount = animes.filter((a) => a.watched).length;
    const queuedCount = total - watchedCount;
    const totalSeasons = animes.reduce((sum, a) => sum + a.seasons.length, 0);
    const genres = allGenres(animes);
    const watchedPercent = total === 0 ? 0 : Math.round((watchedCount / total) * 100);

    const malScores = animes.map((a) => mediaMAL(a.seasons)).filter((s): s is number => s !== null);
    const avgMal =
      malScores.length === 0 ? null : malScores.reduce((s, x) => s + x, 0) / malScores.length;

    let bestAnime: Anime | null = null;
    let bestScore: number | null = null;
    for (const a of animes) {
      const score = mediaMAL(a.seasons);
      if (score !== null && (bestScore === null || score > bestScore)) {
        bestScore = score;
        bestAnime = a;
      }
    }

    let mostSeasonsAnime: Anime | null = null;
    let mostSeasons = -1;
    for (const a of animes) {
      if (a.seasons.length > mostSeasons) {
        mostSeasons = a.seasons.length;
        mostSeasonsAnime = a;
      }
    }
    if (mostSeasonsAnime && mostSeasons <= 0) mostSeasonsAnime = null;

    const tierCounts = new Map<string, number>();
    for (const a of animes) {
      if (!a.watched || !a.tier) continue;
      tierCounts.set(a.tier, (tierCounts.get(a.tier) ?? 0) + 1);
    }
    let dominantTier: string | null = null;
    let dominantTierCount = 0;
    for (const [tier, count] of tierCounts) {
      if (count > dominantTierCount) {
        dominantTierCount = count;
        dominantTier = tier;
      }
    }

    const topGenre = genres[0] ?? null;

    // Tier distribution among watched animes
    const tierDistribution: Array<{ tier: Tier | "none"; count: number }> = (
      Object.keys(TIER_VALUE) as Tier[]
    )
      .sort((a, b) => TIER_VALUE[b] - TIER_VALUE[a])
      .map((tier) => {
        const count = animes.filter((a) => a.watched && a.tier === tier).length;
        return { tier, count };
      });
    const unwatchedWithoutTier = animes.filter((a) => a.watched && !a.tier).length;
    tierDistribution.push({ tier: "none", count: unwatchedWithoutTier });
    const maxTierCount = Math.max(...tierDistribution.map((d) => d.count), 1);
    const tierDistributionWithMax = tierDistribution.map((d) => ({ ...d, max: maxTierCount }));

    // Top genres
    const topGenres = genres.slice(0, 8);
    const maxGenreCount = topGenres.length > 0 ? Math.max(...topGenres.map((g) => g.count), 1) : 1;
    const topGenresWithMax = topGenres.map((g) => ({ ...g, max: maxGenreCount }));

    // Season types
    const typeCounts = new Map<string, number>();
    for (const a of animes) {
      for (const s of a.seasons) {
        const type =
          typeof s.type === "string" && s.type.trim() !== "" ? s.type.trim() : "Sem tipo";
        typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
      }
    }
    const seasonTypeCounts = [...typeCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    // Decades from season years
    const decadeCounts = new Map<string, number>();
    for (const a of animes) {
      for (const s of a.seasons) {
        if (typeof s.year === "number" && !Number.isNaN(s.year)) {
          const decade = Math.floor(s.year / 10) * 10;
          const key = `${decade}s`;
          decadeCounts.set(key, (decadeCounts.get(key) ?? 0) + 1);
        }
      }
    }
    const decadeList = [...decadeCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        const decadeA = parseInt(a.name, 10);
        const decadeB = parseInt(b.name, 10);
        return decadeA - decadeB;
      });
    const maxDecadeCount =
      decadeList.length > 0 ? Math.max(...decadeList.map((d) => d.count), 1) : 1;
    const decadeListWithMax = decadeList.map((d) => ({ ...d, max: maxDecadeCount }));

    // ---- Time block (watched animes only, all season types) ----
    const watchedAnimes = animes.filter((a) => a.watched);
    let timeMinutes = 0;
    let timeEpisodes = 0;
    let missingSeasons = 0;
    let epsSum = 0;
    let epsSeasons = 0;
    let weightedDurationSum = 0;
    let weightedEpisodes = 0;
    for (const a of watchedAnimes) {
      for (const s of a.seasons) {
        const m = seasonMinutes(s);
        if (m === null) missingSeasons += 1;
        else {
          timeMinutes += m;
          timeEpisodes += typeof s.episodes === "number" ? s.episodes : 0;
        }
        if (typeof s.episodes === "number" && s.episodes > 0) {
          epsSum += s.episodes;
          epsSeasons += 1;
          if (typeof s.durationMin === "number" && s.durationMin > 0) {
            weightedDurationSum += s.episodes * s.durationMin;
            weightedEpisodes += s.episodes;
          }
        }
      }
    }

    const topAnimeTimes = watchedAnimes
      .map((a) => ({ name: a.name, minutes: animeMinutes(a).minutes }))
      .filter((x) => x.minutes > 0)
      .sort((x, y) => y.minutes - x.minutes || x.name.localeCompare(y.name))
      .slice(0, 10);
    const maxAnimeTime = topAnimeTimes.length > 0 ? topAnimeTimes[0].minutes : 1;
    const timeTopAnimes = topAnimeTimes.map((x) => ({ ...x, max: maxAnimeTime }));

    const tierTimes = (Object.keys(TIER_VALUE) as Tier[])
      .sort((x, y) => TIER_VALUE[y] - TIER_VALUE[x])
      .map((tier) => ({
        tier,
        minutes: watchedAnimes
          .filter((a) => a.tier === tier)
          .reduce((sum, a) => sum + animeMinutes(a).minutes, 0),
      }));
    const maxTierTime = Math.max(...tierTimes.map((t) => t.minutes), 1);
    const timeByTier = tierTimes.map((t) => ({ ...t, max: maxTierTime }));

    const genreTime = new Map<string, number>();
    for (const a of watchedAnimes) {
      const mins = animeMinutes(a).minutes;
      if (mins <= 0 || !Array.isArray(a.genres)) continue;
      for (const g of new Set(a.genres)) {
        genreTime.set(g, (genreTime.get(g) ?? 0) + mins);
      }
    }
    const genreTimeList = [...genreTime.entries()]
      .map(([name, minutes]) => ({ name, minutes }))
      .sort((x, y) => y.minutes - x.minutes || x.name.localeCompare(y.name))
      .slice(0, 8);
    const maxGenreTime = genreTimeList.length > 0 ? genreTimeList[0].minutes : 1;
    const timeByGenre = genreTimeList.map((g) => ({ ...g, max: maxGenreTime }));

    return {
      total,
      watchedCount,
      queuedCount,
      totalSeasons,
      genresCount: genres.length,
      watchedPercent,
      avgMal,
      scoredCount: malScores.length,
      bestAnime,
      bestScore,
      mostSeasonsAnime,
      mostSeasons: mostSeasonsAnime ? mostSeasons : null,
      dominantTier,
      dominantTierCount,
      topGenre,
      seasonsPerAnime: total === 0 ? null : totalSeasons / total,
      tierDistribution: tierDistributionWithMax,
      topGenres: topGenresWithMax,
      seasonTypeCounts,
      decadeCounts: decadeListWithMax,
      timeMinutes,
      timeEpisodes,
      missingSeasons,
      timeTopAnimes,
      timeByTier,
      timeByGenre,
      avgEpisodesPerSeason: epsSeasons === 0 ? null : epsSum / epsSeasons,
      avgEpisodeDuration: weightedEpisodes === 0 ? null : weightedDurationSum / weightedEpisodes,
    };
  }, [animes]);

  const createdAt = user?.created_at ? new Date(user.created_at) : null;
  const displayName = profile?.username ?? user?.email ?? "—";
  const nameInitial = (profile?.username?.[0] ?? user?.email?.[0] ?? null)?.toUpperCase();

  const MINUTES_PER_LEVEL = 1440;

  function formatCompactMinutes(min: number): string {
    if (min < 1000) return String(Math.round(min));
    return `${(Math.round(min / 100) / 10).toFixed(1)}k`;
  }

  const level = Math.floor(stats.timeMinutes / MINUTES_PER_LEVEL) + 1;
  const minutesIntoLevel = stats.timeMinutes % MINUTES_PER_LEVEL;
  const levelPercent = stats.timeMinutes === 0 ? 0 : (minutesIntoLevel / MINUTES_PER_LEVEL) * 100;
  const levelTitle = (() => {
    let base = `Nível ${level} — ${formatMinutes(minutesIntoLevel)} de ${formatMinutes(MINUTES_PER_LEVEL)} assistidas neste nível`;
    if (stats.missingSeasons > 0) {
      base += ` · ${stats.missingSeasons} temporadas sem dados de duração ficam de fora da contagem`;
    }
    return base;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-full max-h-[100dvh] w-full max-w-none overflow-y-auto overflow-x-hidden rounded-none border-border bg-card sm:h-auto sm:max-h-[90vh] sm:max-w-4xl sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>Estatísticas</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          {/* Collection header */}
          <div className="rounded-xl border border-border/60 bg-background/30 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar className="h-16 w-16 shrink-0 rounded-full ring-1 ring-primary/40">
                  {avatarSrc && (
                    <AvatarImage src={avatarSrc} alt={displayName} className="object-cover" />
                  )}
                  <AvatarFallback className="bg-primary/15 text-lg font-bold text-primary">
                    {nameInitial ?? <User className="h-5 w-5" />}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-2xl font-semibold">{displayName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    entrou em{" "}
                    {createdAt && !Number.isNaN(createdAt.getTime())
                      ? createdAt.toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </p>
                </div>
              </div>

              <div className="flex justify-between gap-4 border-t pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                <div className="text-center">
                  <p className="font-display font-bold tabular-nums">{stats.total}</p>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                    Animes
                  </p>
                </div>
                <div className="text-center">
                  <p className="font-display font-bold tabular-nums">{stats.totalSeasons}</p>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                    Temporadas
                  </p>
                </div>
                <div className="text-center">
                  <p className="font-display font-bold tabular-nums">{stats.genresCount}</p>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                    Gêneros
                  </p>
                </div>
                <div className="text-center">
                  <p className="font-display font-bold tabular-nums">{stats.watchedCount}</p>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                    Assistidos
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <span className="font-display text-2xl font-bold tabular-nums">{level}</span>
              <div className="flex-1" title={levelTitle} aria-label={levelTitle}>
                <Progress value={levelPercent} className="bg-foreground/7" />
              </div>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {stats.timeMinutes === 0
                  ? "sem dados de duração"
                  : `${formatCompactMinutes(minutesIntoLevel)} / ${formatCompactMinutes(MINUTES_PER_LEVEL)}`}
              </span>
            </div>
          </div>

          {/* Time block */}
          <div className="rounded-xl border border-border/60 bg-background/30 p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Tempo
            </p>
            {stats.timeMinutes === 0 ? (
              <p className="text-sm text-muted-foreground">Ainda sem dados de duração</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="min-w-0">
                  <p className="font-display text-3xl font-bold tabular-nums text-primary">
                    {formatMinutes(stats.timeMinutes)}
                  </p>
                  <p className="inline-flex items-baseline gap-1 text-[11px] text-muted-foreground">
                    <span className="font-display text-sm font-bold tabular-nums text-foreground">
                      {stats.timeEpisodes}
                    </span>
                    episódios assistidos
                    {stats.avgEpisodesPerSeason !== null && (
                      <span>· {stats.avgEpisodesPerSeason.toFixed(1)} eps por temporada</span>
                    )}
                  </p>
                  {stats.avgEpisodeDuration !== null && (
                    <p className="text-[11px] text-muted-foreground">
                      Episódio médio de {Math.round(stats.avgEpisodeDuration)} min
                    </p>
                  )}
                  {stats.missingSeasons > 0 && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {stats.missingSeasons} temporadas sem dados de duração
                    </p>
                  )}

                  {stats.timeTopAnimes.length > 0 && (
                    <div className="mt-4 flex flex-col gap-2">
                      <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                        Top 10 por tempo
                      </p>
                      {stats.timeTopAnimes.map((a) => (
                        <div key={a.name} className="flex min-w-0 items-center gap-3">
                          <span
                            className="w-32 shrink-0 truncate text-xs text-muted-foreground lg:w-44"
                            title={a.name}
                          >
                            {a.name}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="h-2.5 w-full overflow-hidden rounded-full bg-foreground/5">
                              <div
                                className="h-full rounded-full bg-primary/60 transition-[width] duration-500 ease-out-soft motion-reduce:transition-none"
                                style={{ width: `${(a.minutes / a.max) * 100}%` }}
                              />
                            </div>
                          </div>
                          <span className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                            {formatMinutes(a.minutes)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                      Tempo por tier
                    </p>
                    {stats.timeByTier.map((t) => (
                      <div key={t.tier} className="flex min-w-0 items-center gap-3">
                        <span
                          className={`w-6 shrink-0 font-display text-xs font-bold ${tierColor(t.tier)}`}
                        >
                          {t.tier}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-foreground/5">
                            <div
                              className={`h-full rounded-full transition-[width] duration-500 ease-out-soft motion-reduce:transition-none ${tierBg(t.tier)}`}
                              style={{ width: `${(t.minutes / t.max) * 100}%` }}
                            />
                          </div>
                        </div>
                        <span className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                          {t.minutes === 0 ? "—" : formatMinutes(t.minutes)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {stats.timeByGenre.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                        Tempo por gênero
                      </p>
                      {stats.timeByGenre.map((g) => (
                        <div key={g.name} className="flex min-w-0 items-center gap-3">
                          <span
                            className="w-24 shrink-0 truncate text-xs text-muted-foreground lg:w-28"
                            title={g.name}
                          >
                            {g.name}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="h-2.5 w-full overflow-hidden rounded-full bg-foreground/5">
                              <div
                                className="h-full rounded-full bg-primary/60 transition-[width] duration-500 ease-out-soft motion-reduce:transition-none"
                                style={{ width: `${(g.minutes / g.max) * 100}%` }}
                              />
                            </div>
                          </div>
                          <span className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                            {formatMinutes(g.minutes)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            {stats.timeMinutes === 0 && stats.missingSeasons > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {stats.missingSeasons} temporadas sem dados de duração
              </p>
            )}
          </div>

          {/* Records grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Collection group */}
            <div className="min-w-0 rounded-xl border border-border/60 bg-background/30 p-4">
              <p className="mb-3 text-[9px] uppercase tracking-widest text-muted-foreground">
                Coleção
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                    Assistidos
                  </p>
                  <p className="font-display font-bold tabular-nums">
                    {stats.total === 0 ? "—" : stats.watchedCount}
                  </p>
                  {stats.total > 0 && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {Math.round((stats.watchedCount / stats.total) * 100)}% da lista
                    </p>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                    Na fila
                  </p>
                  <p className="font-display font-bold tabular-nums">
                    {stats.total === 0 ? "—" : stats.queuedCount}
                  </p>
                  {stats.total > 0 && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {Math.round((stats.queuedCount / stats.total) * 100)}% da lista
                    </p>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                    Temporadas
                  </p>
                  <p className="font-display font-bold tabular-nums">
                    {stats.totalSeasons === 0 ? "—" : stats.totalSeasons}
                  </p>
                  {stats.seasonsPerAnime !== null && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {stats.seasonsPerAnime.toFixed(1)} por anime
                    </p>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                    Média MAL
                  </p>
                  <p
                    className={`font-display font-bold tabular-nums ${stats.avgMal === null ? "" : "text-primary"}`}
                  >
                    {stats.avgMal === null ? "—" : stats.avgMal.toFixed(2)}
                  </p>
                  {stats.scoredCount > 0 && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {stats.scoredCount} com nota
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Highlights group */}
            <div className="min-w-0 rounded-xl border border-border/60 bg-background/30 p-4">
              <p className="mb-3 text-[9px] uppercase tracking-widest text-muted-foreground">
                Destaques
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                    Melhor nota
                  </p>
                  <p
                    className={`font-display font-bold tabular-nums ${stats.bestScore === null ? "" : "text-primary"}`}
                  >
                    {stats.bestScore === null ? "—" : stats.bestScore.toFixed(2)}
                  </p>
                  {stats.bestAnime ? (
                    <p
                      className="truncate text-[11px] text-muted-foreground"
                      title={stats.bestAnime.name}
                    >
                      {stats.bestAnime.name}
                    </p>
                  ) : null}
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                    Mais temporadas
                  </p>
                  <p className="font-display font-bold tabular-nums">
                    {stats.mostSeasons === null ? "—" : stats.mostSeasons}
                  </p>
                  {stats.mostSeasonsAnime ? (
                    <p
                      className="truncate text-[11px] text-muted-foreground"
                      title={stats.mostSeasonsAnime.name}
                    >
                      {stats.mostSeasonsAnime.name}
                    </p>
                  ) : null}
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                    Tier dominante
                  </p>
                  <p
                    className={`font-display font-bold tabular-nums ${stats.dominantTier ? tierColor(stats.dominantTier as import("@/lib/anime-storage").Tier) : ""}`}
                  >
                    {stats.dominantTier ?? "—"}
                  </p>
                  {stats.dominantTier !== null && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {stats.dominantTierCount} animes
                    </p>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                    Gênero mais comum
                  </p>
                  <p className="font-display font-bold tabular-nums text-sm">
                    {stats.topGenre ? stats.topGenre.name : "—"}
                  </p>
                  {stats.topGenre && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {stats.topGenre.count} animes
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Distribution blocks */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Tier distribution */}
            <div className="min-w-0 rounded-xl border border-border/60 bg-background/30 p-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Distribuição por tier
              </p>
              <div className="flex flex-col gap-2">
                {stats.tierDistribution.map((d) => {
                  const isNone = d.tier === "none";
                  const pct = (d.count / d.max) * 100;
                  return (
                    <div key={d.tier} className="flex items-center gap-3">
                      <div
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-display text-xs font-bold ${
                          isNone
                            ? "border border-border/60 bg-secondary text-muted-foreground"
                            : `${tierBg(d.tier as Tier)} text-tier-foreground`
                        }`}
                      >
                        {isNone ? "—" : d.tier}
                      </div>
                      <div className="flex-1">
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-foreground/5">
                          <div
                            className={`h-full rounded-full transition-[width] duration-500 ease-out-soft motion-reduce:transition-none ${
                              isNone ? "bg-muted-foreground/40" : tierBg(d.tier as Tier)
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">
                        {d.count}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Conta apenas animes assistidos
              </p>
            </div>

            {/* Top genres */}
            <div className="min-w-0 rounded-xl border border-border/60 bg-background/30 p-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Top gêneros
              </p>
              {stats.topGenres.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ainda sem gêneros</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {stats.topGenres.map((g) => {
                    const pct = (g.count / g.max) * 100;
                    return (
                      <div key={g.name} className="flex items-center gap-3">
                        <span
                          className="w-24 shrink-0 truncate text-xs text-muted-foreground lg:w-28"
                          title={g.name}
                        >
                          {g.name}
                        </span>
                        <div className="flex-1">
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-foreground/5">
                            <div
                              className="h-full rounded-full bg-primary/60 transition-[width] duration-500 ease-out-soft motion-reduce:transition-none"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">
                          {g.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Season types */}
            <div className="min-w-0 rounded-xl border border-border/60 bg-background/30 p-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Por tipo
              </p>
              {stats.seasonTypeCounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ainda sem temporadas</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {stats.seasonTypeCounts.map((t) => (
                    <div
                      key={t.name}
                      className="inline-flex items-center gap-1.5 rounded-md bg-foreground/5 px-2.5 py-1.5 text-xs text-muted-foreground"
                    >
                      <span className="truncate">{t.name}</span>
                      <span className="font-display font-semibold tabular-nums text-foreground">
                        {t.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Decades */}
            {stats.decadeCounts.length > 0 && (
              <div className="min-w-0 rounded-xl border border-border/60 bg-background/30 p-4">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Por década de estreia
                </p>
                <div className="flex flex-col gap-2">
                  {stats.decadeCounts.map((d) => {
                    const pct = (d.count / d.max) * 100;
                    return (
                      <div key={d.name} className="flex items-center gap-3">
                        <span className="w-16 shrink-0 text-xs text-muted-foreground lg:w-20">
                          {d.name}
                        </span>
                        <div className="flex-1">
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-foreground/5">
                            <div
                              className="h-full rounded-full bg-primary/60 transition-[width] duration-500 ease-out-soft motion-reduce:transition-none"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">
                          {d.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
