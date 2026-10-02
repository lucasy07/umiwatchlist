import type { CSSProperties, ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  XAxis,
  YAxis,
} from "recharts";
import type { Tier } from "@/lib/anime-storage";
import { tierBg } from "@/components/TierPicker";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useCountUp } from "@/hooks/use-count-up";

const CHART_ANIMATION_MS = 900;

/** Number that counts up from 0 when it mounts. */
export function CountUp({
  value,
  format = (n) => String(Math.round(n)),
}: {
  value: number;
  format?: (n: number) => string;
}) {
  const shown = useCountUp(value);
  return <>{format(shown)}</>;
}

/** Circular level progress drawn around `children` (the avatar). */
export function LevelRing({
  percent,
  size = 80,
  stroke = 4,
  label,
  children,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  label: string;
  children: ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const offset = length * (1 - Math.min(Math.max(percent, 0), 100) / 100);

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
      title={label}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-foreground/10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={offset}
          className="stat-ring-draw stroke-primary"
          style={{ "--ring-length": `${length}px` } as CSSProperties}
        />
      </svg>
      <div className="absolute inset-[7px] flex items-center justify-center">{children}</div>
    </div>
  );
}

type TierSlice = { tier: Tier | "none"; count: number };

const TIER_CHART_CONFIG: ChartConfig = {
  S: { label: "Tier S", color: "var(--tier-s)" },
  A: { label: "Tier A", color: "var(--tier-a)" },
  B: { label: "Tier B", color: "var(--tier-b)" },
  C: { label: "Tier C", color: "var(--tier-c)" },
  D: { label: "Tier D", color: "var(--tier-d)" },
  E: { label: "Tier E", color: "var(--tier-e)" },
  none: { label: "Sem tier", color: "var(--muted-foreground)" },
};

/** Donut of watched animes per tier, with the total in the center and a legend beside it. */
export function TierDonut({ data, dominant }: { data: TierSlice[]; dominant: Tier | null }) {
  const reduced = useReducedMotion();
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const slices = data
    .filter((d) => d.count > 0)
    .map((d) => ({ ...d, fill: `var(--color-${d.tier})` }));

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum anime assistido com tier ainda</p>;
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative h-40 w-40 shrink-0">
        <ChartContainer config={TIER_CHART_CONFIG} className="aspect-square h-full w-full">
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent nameKey="tier" hideLabel />}
            />
            <Pie
              data={slices}
              dataKey="count"
              nameKey="tier"
              innerRadius="62%"
              outerRadius="100%"
              paddingAngle={slices.length > 1 ? 3 : 0}
              cornerRadius={4}
              stroke="none"
              startAngle={90}
              endAngle={-270}
              isAnimationActive={!reduced}
              animationDuration={CHART_ANIMATION_MS}
              animationEasing="ease-out"
            >
              {slices.map((s) => (
                <Cell key={s.tier} fill={s.fill} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-bold tabular-nums">
            <CountUp value={total} />
          </span>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            assistidos
          </span>
        </div>
      </div>

      <ul className="grid w-full min-w-0 grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-1">
        {data.map((d) => {
          const isNone = d.tier === "none";
          const isDominant = !isNone && d.tier === dominant;
          return (
            <li key={d.tier} className="flex min-w-0 items-center gap-2 text-xs">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded font-display text-[11px] font-bold ${
                  isNone
                    ? "border border-border/60 bg-secondary text-muted-foreground"
                    : `${tierBg(d.tier as Tier)} text-tier-foreground`
                }`}
                aria-hidden="true"
              >
                {isNone ? "—" : d.tier}
              </span>
              <span className="sr-only">{isNone ? "Sem tier" : `Tier ${d.tier}`}</span>
              <span
                className={`tabular-nums ${isDominant ? "font-semibold text-foreground" : "text-muted-foreground"}`}
              >
                {d.count}
              </span>
              <span className="ml-auto tabular-nums text-muted-foreground">
                {Math.round((d.count / total) * 100)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const GENRE_CHART_CONFIG: ChartConfig = {
  count: { label: "Animes", color: "var(--primary)" },
};

/** Radar of the top genres: the shape of the collection's taste. Needs 3+ genres. */
export function GenreRadar({ data }: { data: Array<{ name: string; count: number }> }) {
  const reduced = useReducedMotion();

  return (
    <ChartContainer config={GENRE_CHART_CONFIG} className="mx-auto aspect-[4/3] w-full max-w-md">
      <RadarChart data={data} outerRadius="72%">
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <PolarGrid className="stroke-border" />
        <PolarAngleAxis
          dataKey="name"
          tick={{ fontSize: 10, className: "fill-muted-foreground" }}
          tickLine={false}
        />
        <Radar
          dataKey="count"
          fill="var(--color-count)"
          fillOpacity={0.3}
          stroke="var(--color-count)"
          strokeWidth={2}
          dot={{ r: 3, fillOpacity: 1 }}
          isAnimationActive={!reduced}
          animationDuration={CHART_ANIMATION_MS}
          animationEasing="ease-out"
        />
      </RadarChart>
    </ChartContainer>
  );
}

const YEAR_CHART_CONFIG: ChartConfig = {
  count: { label: "Temporadas", color: "var(--primary)" },
};

/** Area chart of seasons per premiere year. */
export function YearArea({ data }: { data: Array<{ year: number; count: number }> }) {
  const reduced = useReducedMotion();

  return (
    <ChartContainer config={YEAR_CHART_CONFIG} className="aspect-auto h-44 w-full">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id="stats-year-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-count)" stopOpacity={0.45} />
            <stop offset="100%" stopColor="var(--color-count)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="year" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={44} />
        <ChartTooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={<ChartTooltipContent labelFormatter={(_, p) => p[0]?.payload?.year} />}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="var(--color-count)"
          strokeWidth={2}
          fill="url(#stats-year-fill)"
          activeDot={{ r: 4 }}
          isAnimationActive={!reduced}
          animationDuration={CHART_ANIMATION_MS}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ChartContainer>
  );
}

const SEGMENT_COLORS = ["bg-chart-1", "bg-chart-2", "bg-chart-4"] as const;
const OTHER_SEGMENT_COLOR = "bg-muted-foreground/50";

/**
 * 100% bar split by season type. The three largest types get their own color; the rest
 * fold into "Outros" so colors never cycle. Every segment is labeled in the legend.
 */
export function TypeSegments({ data }: { data: Array<{ name: string; count: number }> }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const head = data.slice(0, SEGMENT_COLORS.length);
  const restCount = data.slice(SEGMENT_COLORS.length).reduce((sum, d) => sum + d.count, 0);
  const segments = [
    ...head.map((d, i) => ({ ...d, color: SEGMENT_COLORS[i] })),
    ...(restCount > 0 ? [{ name: "Outros", count: restCount, color: OTHER_SEGMENT_COLOR }] : []),
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="stat-bar-grow flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
        {segments.map((s) => (
          <div
            key={s.name}
            className={`h-full first:rounded-l-full last:rounded-r-full ${s.color}`}
            style={{ width: `${(s.count / total) * 100}%` }}
            title={`${s.name}: ${s.count}`}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((s) => (
          <li key={s.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${s.color}`} aria-hidden="true" />
            <span>{s.name}</span>
            <span className="font-display font-semibold tabular-nums text-foreground">
              {s.count}
            </span>
            <span className="tabular-nums">· {Math.round((s.count / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
