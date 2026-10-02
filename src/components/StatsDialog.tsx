import { useMemo, useState, type ReactNode } from "react";
import { Tags, Tv, User } from "lucide-react";
import type { Anime, Tier } from "@/lib/anime-storage";
import {
  mediaMAL,
  allGenres,
  TIER_VALUE,
  seasonMinutes,
  animeMinutes,
  formatMinutes,
  withReleasedSeasons,
} from "@/lib/anime-storage";
import { useAuth } from "@/auth/AuthProvider";
import { useAvatarSrc } from "@/hooks/use-avatar-src";
import { tierColor, tierBg } from "@/components/TierPicker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  CountUp,
  GenreRadar,
  LevelRing,
  TierDonut,
  TypeSegments,
  YearArea,
} from "@/components/StatsCharts";

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
  yearCounts: Array<{ year: number; count: number }>;
  timeMinutes: number;
  timeEpisodes: number;
  missingSeasons: number;
  timeTopAnimes: Array<{ name: string; minutes: number; max: number }>;
  timeByTier: Array<{ tier: Tier; minutes: number; max: number }>;
  timeByGenre: Array<{ name: string; minutes: number; max: number }>;
  avgEpisodesPerSeason: number | null;
  avgEpisodeDuration: number | null;
};

export function StatsDialog({ animes: allAnimes, open, onOpenChange }: StatsDialogProps) {
  const { user, profile } = useAuth();
  const avatarSrc = useAvatarSrc(profile?.avatar_url);

  // All calculations are based on the entire collection, never the filtered view.
  // Unreleased seasons stay out of every metric.
  const stats = useMemo<Stats>(() => {
    const animes = allAnimes.map(withReleasedSeasons);
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
    const watchedWithoutTier = animes.filter((a) => a.watched && !a.tier).length;
    tierDistribution.push({ tier: "none", count: watchedWithoutTier });
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

    // Seasons per premiere year, with empty years filled in so the area stays continuous
    const yearMap = new Map<number, number>();
    for (const a of animes) {
      for (const s of a.seasons) {
        if (typeof s.year === "number" && !Number.isNaN(s.year)) {
          yearMap.set(s.year, (yearMap.get(s.year) ?? 0) + 1);
        }
      }
    }
    const yearCounts: Array<{ year: number; count: number }> = [];
    if (yearMap.size > 0) {
      const years = [...yearMap.keys()];
      const lastYear = Math.max(...years);
      for (let y = Math.min(...years); y <= lastYear; y++) {
        yearCounts.push({ year: y, count: yearMap.get(y) ?? 0 });
      }
    }

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
      yearCounts,
      timeMinutes,
      timeEpisodes,
      missingSeasons,
      timeTopAnimes,
      timeByTier,
      timeByGenre,
      avgEpisodesPerSeason: epsSeasons === 0 ? null : epsSum / epsSeasons,
      avgEpisodeDuration: weightedEpisodes === 0 ? null : weightedDurationSum / weightedEpisodes,
    };
  }, [allAnimes]);

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

  const dominantTier = stats.dominantTier as Tier | null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-full max-h-[100dvh] w-full max-w-none overflow-y-auto overflow-x-hidden rounded-none border-border bg-card sm:h-auto sm:max-h-[90vh] sm:max-w-4xl sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>Estatísticas</DialogTitle>
        </DialogHeader>

        <div className="grid min-w-0 gap-6 py-1">
          {/* Hero: profile, watched time and level */}
          <section
            aria-label="Perfil"
            className="relative overflow-hidden rounded-2xl border border-border/60 bg-card-elevated p-5"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-primary/15 blur-3xl"
            />
            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <LevelRing percent={levelPercent} label={levelTitle}>
                  <Avatar className="h-full w-full rounded-full">
                    {avatarSrc && (
                      <AvatarImage src={avatarSrc} alt={displayName} className="object-cover" />
                    )}
                    <AvatarFallback className="bg-primary/15 text-lg font-bold text-primary">
                      {nameInitial ?? <User className="h-5 w-5" />}
                    </AvatarFallback>
                  </Avatar>
                </LevelRing>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-2xl font-semibold">{displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    entrou em{" "}
                    {createdAt && !Number.isNaN(createdAt.getTime())
                      ? createdAt.toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </p>
                  <p className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="rounded-md bg-primary/15 px-1.5 py-0.5 font-display font-bold tabular-nums text-primary">
                      Nv {level}
                    </span>
                    <span className="tabular-nums">
                      {stats.timeMinutes === 0
                        ? "sem dados de duração"
                        : `${formatCompactMinutes(minutesIntoLevel)} / ${formatCompactMinutes(MINUTES_PER_LEVEL)} min`}
                    </span>
                  </p>
                </div>
              </div>

              <div className="min-w-0 sm:text-right">
                <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                  Tempo assistido
                </p>
                {stats.timeMinutes === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">Ainda sem dados de duração</p>
                ) : (
                  <>
                    <p className="font-display text-4xl font-bold leading-tight tabular-nums text-primary">
                      <CountUp
                        value={stats.timeMinutes}
                        format={(n) => formatMinutes(Math.round(n))}
                      />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold tabular-nums text-foreground">
                        {stats.timeEpisodes}
                      </span>{" "}
                      episódios
                      {stats.avgEpisodeDuration !== null && (
                        <> · {Math.round(stats.avgEpisodeDuration)} min em média</>
                      )}
                    </p>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* KPIs */}
          <section aria-label="Resumo" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="Assistidos"
              value={stats.total === 0 ? "—" : <CountUp value={stats.watchedCount} />}
              caption={stats.total > 0 ? `de ${stats.total} · ${stats.watchedPercent}%` : null}
            >
              {stats.total > 0 && (
                <Progress
                  value={stats.watchedPercent}
                  aria-label={`${stats.watchedPercent}% da lista assistida`}
                  className="mt-2 h-1 bg-foreground/7"
                />
              )}
            </StatTile>
            <StatTile
              label="Na fila"
              value={stats.total === 0 ? "—" : <CountUp value={stats.queuedCount} />}
              caption={
                stats.total > 0
                  ? `${Math.round((stats.queuedCount / stats.total) * 100)}% da lista`
                  : null
              }
            />
            <StatTile
              label="Temporadas"
              value={stats.totalSeasons === 0 ? "—" : <CountUp value={stats.totalSeasons} />}
              caption={
                stats.seasonsPerAnime !== null
                  ? `${stats.seasonsPerAnime.toFixed(1)} por anime`
                  : null
              }
            />
            <StatTile
              label="Média MAL"
              value={
                stats.avgMal === null ? (
                  "—"
                ) : (
                  <CountUp value={stats.avgMal} format={(n) => n.toFixed(2)} />
                )
              }
              valueClass={stats.avgMal === null ? "" : "text-primary"}
              caption={stats.scoredCount > 0 ? `${stats.scoredCount} com nota` : null}
            />
          </section>

          {/* Highlights */}
          <Section title="Destaques">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <HighlightTile
                label="Melhor nota"
                value={stats.bestScore === null ? "—" : stats.bestScore.toFixed(2)}
                valueClass={stats.bestScore === null ? "" : "text-primary"}
                caption={stats.bestAnime?.name ?? null}
                media={<AnimeCover anime={stats.bestAnime} />}
              />
              <HighlightTile
                label="Mais temporadas"
                value={stats.mostSeasons === null ? "—" : stats.mostSeasons}
                caption={stats.mostSeasonsAnime?.name ?? null}
                media={<AnimeCover anime={stats.mostSeasonsAnime} />}
              />
              <HighlightTile
                label="Gênero mais comum"
                value={stats.topGenre ? stats.topGenre.name : "—"}
                caption={stats.topGenre ? `${stats.topGenre.count} animes` : null}
                media={
                  <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                    <Tags className="h-4 w-4 text-primary" />
                  </div>
                }
              />
            </div>
          </Section>

          {/* Taste */}
          <Section title="Gosto">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel
                title="Distribuição por tier"
                footer={
                  dominantTier
                    ? `Só animes assistidos · mais comum: ${dominantTier} (${stats.dominantTierCount})`
                    : "Só animes assistidos"
                }
              >
                <TierDonut data={stats.tierDistribution} dominant={dominantTier} />
              </Panel>

              <Panel
                title="Perfil de gêneros"
                aside={stats.genresCount > 0 ? `${stats.genresCount} na coleção` : undefined}
              >
                {stats.topGenres.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ainda sem gêneros</p>
                ) : stats.topGenres.length >= 3 ? (
                  <GenreRadar data={stats.topGenres} />
                ) : (
                  stats.topGenres.map((g, i) => (
                    <BarRow
                      key={g.name}
                      index={i}
                      label={g.name}
                      value={g.count}
                      max={g.max}
                      display={g.count}
                    />
                  ))
                )}
              </Panel>
            </div>
          </Section>

          {/* Time */}
          <Section title="Tempo">
            {stats.timeMinutes === 0 ? (
              <Panel>
                <p className="text-sm text-muted-foreground">Ainda sem dados de duração</p>
              </Panel>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Panel
                  title="Top 10 por tempo"
                  aside={
                    stats.avgEpisodesPerSeason !== null
                      ? `${stats.avgEpisodesPerSeason.toFixed(1)} eps por temporada`
                      : undefined
                  }
                >
                  {stats.timeTopAnimes.map((a, i) => (
                    <BarRow
                      key={a.name}
                      index={i}
                      label={a.name}
                      labelClass="w-28 text-xs text-muted-foreground lg:w-40"
                      value={a.minutes}
                      max={a.max}
                      display={formatMinutes(a.minutes)}
                    />
                  ))}
                </Panel>

                <div className="grid min-w-0 content-start gap-4">
                  <Panel title="Por tier">
                    {stats.timeByTier.map((t, i) => (
                      <BarRow
                        key={t.tier}
                        index={i}
                        label={t.tier}
                        labelClass={`w-6 font-display text-xs font-bold ${tierColor(t.tier)}`}
                        value={t.minutes}
                        max={t.max}
                        display={t.minutes === 0 ? "—" : formatMinutes(t.minutes)}
                        barClass={tierBg(t.tier)}
                      />
                    ))}
                  </Panel>

                  {stats.timeByGenre.length > 0 && (
                    <Panel title="Por gênero">
                      {stats.timeByGenre.map((g, i) => (
                        <BarRow
                          key={g.name}
                          index={i}
                          label={g.name}
                          value={g.minutes}
                          max={g.max}
                          display={formatMinutes(g.minutes)}
                        />
                      ))}
                    </Panel>
                  )}
                </div>
              </div>
            )}
            {stats.missingSeasons > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {stats.missingSeasons} temporadas sem dados de duração ficam de fora
              </p>
            )}
          </Section>

          {/* Catalog */}
          <Section title="Catálogo">
            <div className="grid grid-cols-1 gap-4">
              <Panel title="Por tipo">
                {stats.seasonTypeCounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ainda sem temporadas</p>
                ) : (
                  <TypeSegments data={stats.seasonTypeCounts} />
                )}
              </Panel>

              {stats.yearCounts.length > 1 && (
                <Panel title="Estreias por ano">
                  <YearArea data={stats.yearCounts} />
                </Panel>
              )}
            </div>
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid min-w-0 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both gap-3 duration-slow motion-reduce:animate-none">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Panel({
  title,
  aside,
  footer,
  children,
}: {
  title?: string;
  aside?: string;
  footer?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border/60 bg-background/30 p-4">
      {title && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h4 className="text-sm font-medium">{title}</h4>
          {aside && <span className="truncate text-[11px] text-muted-foreground">{aside}</span>}
        </div>
      )}
      <div className="flex flex-col gap-2">{children}</div>
      {footer && <p className="mt-3 text-[11px] text-muted-foreground">{footer}</p>}
    </div>
  );
}

function StatTile({
  label,
  value,
  caption,
  valueClass = "",
  children,
}: {
  label: string;
  value: ReactNode;
  caption: string | null;
  valueClass?: string;
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border/60 bg-background/30 p-4">
      <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 font-display text-2xl font-bold tabular-nums ${valueClass}`}>{value}</p>
      {caption && <p className="truncate text-xs text-muted-foreground">{caption}</p>}
      {children}
    </div>
  );
}

function HighlightTile({
  label,
  value,
  caption,
  media,
  valueClass = "",
}: {
  label: string;
  value: ReactNode;
  caption: string | null;
  media: ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border/60 bg-background/30 p-3">
      {media}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <p className={`truncate font-display text-lg font-bold tabular-nums ${valueClass}`}>
          {value}
        </p>
        {caption && (
          <p className="truncate text-xs text-muted-foreground" title={caption}>
            {caption}
          </p>
        )}
      </div>
    </div>
  );
}

function AnimeCover({ anime }: { anime: Anime | null }) {
  const [error, setError] = useState(false);
  const src = anime ? (anime.cover ?? anime.imageUrl ?? null) : null;

  return (
    <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-secondary" aria-hidden="true">
      {src && !error ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          draggable={false}
          className="h-full w-full object-cover"
          onError={() => setError(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Tv className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

function BarRow({
  index = 0,
  label,
  labelClass = "w-24 text-xs text-muted-foreground lg:w-28",
  value,
  max,
  display,
  barClass = "bg-primary/60",
  valueClass = "text-muted-foreground",
}: {
  index?: number;
  label: ReactNode;
  labelClass?: string;
  value: number;
  max: number;
  display: ReactNode;
  barClass?: string;
  valueClass?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className={`shrink-0 truncate ${labelClass}`}
        title={typeof label === "string" ? label : undefined}
      >
        {label}
      </span>
      <div className="min-w-0 flex-1">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-foreground/5">
          <div
            className={`stat-bar-grow h-full rounded-full transition-[width] duration-emphasis ease-out-soft motion-reduce:transition-none ${barClass}`}
            style={{
              width: `${max > 0 ? (value / max) * 100 : 0}%`,
              animationDelay: `${index * 40}ms`,
            }}
          />
        </div>
      </div>
      <span className={`shrink-0 text-right text-[11px] tabular-nums ${valueClass}`}>
        {display}
      </span>
    </div>
  );
}
