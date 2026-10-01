import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Image as ImageIcon } from "lucide-react";
import {
  formatDateBR,
  formatReleaseRelative,
  isVagueEntry,
  selectUpcomingStrip,
  type Anime,
  type UpcomingStripItem,
} from "@/lib/anime-storage";
import { prefersReducedMotion } from "@/lib/tier-drop-animation";
import { Button } from "@/components/ui/button";

type UpcomingStripProps = {
  animes: Anime[];
  onOpen: (animeId: string) => void;
};

/** Premieres within this many days (including today) get the primary highlight. */
const SOON_DAYS = 7;

function itemTone({ entry, days }: UpcomingStripItem): "released" | "soon" | "later" | "vague" {
  // Only a known day can be counted down, highlighted or marked as premiered.
  if (days === null || isVagueEntry(entry)) return "vague";
  if (days < 0) return "released";
  if (days <= SOON_DAYS) return "soon";
  return "later";
}

const DOT_TONE = {
  soon: "bg-primary-on-dark shadow-[0_0_12px_2px_color-mix(in_srgb,var(--primary-glow)_55%,transparent)]",
  released: "bg-accent",
  later: "bg-border-interactive",
  vague: "border-[1.5px] border-dashed border-border-interactive bg-background",
} as const;

const LABEL_TONE = {
  soon: "text-(--primary-glow)",
  released: "text-accent",
  later: "text-foreground",
  vague: "text-muted-foreground",
} as const;

/** "2 temporadas agendadas", "1 temporada anunciada" or "2 agendadas · 6 anunciadas". */
function stripCountLabel(scheduled: number, announced: number): string {
  const part = (n: number, word: string, withNoun: boolean) =>
    `${n} ${withNoun ? (n === 1 ? "temporada " : "temporadas ") : ""}${word}${n === 1 ? "" : "s"}`;
  if (scheduled > 0 && announced > 0) {
    return `${part(scheduled, "agendada", false)} · ${part(announced, "anunciada", false)}`;
  }
  return scheduled > 0 ? part(scheduled, "agendada", true) : part(announced, "anunciada", true);
}

export function UpcomingStrip({ animes, onOpen }: UpcomingStripProps) {
  const titleId = useId();
  const items = useMemo(() => selectUpcomingStrip(animes), [animes]);
  const announced = items.filter((item) => item.entry.releaseDate === null).length;
  const scheduled = items.filter(
    (item) => item.entry.releaseDate !== null && itemTone(item) !== "released",
  ).length;
  const trackRef = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const updateEdges = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setAtStart(track.scrollLeft <= 4);
    setAtEnd(track.scrollLeft + track.clientWidth >= track.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    updateEdges();
    const observer = new ResizeObserver(updateEdges);
    observer.observe(track);
    return () => observer.disconnect();
  }, [items.length, updateEdges]);

  if (items.length === 0) return null;

  function scrollByPage(direction: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({
      left: direction * track.clientWidth * 0.8,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }

  return (
    <section aria-labelledby={titleId} className="mb-6">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 id={titleId} className="font-display text-[17px] font-bold tracking-tight">
          Em breve
          {(scheduled > 0 || announced > 0) && (
            <span className="ml-2.5 font-sans text-xs font-normal text-muted-foreground">
              {stripCountLabel(scheduled, announced)}
            </span>
          )}
        </h2>
        <div className="hidden gap-1.5 sm:flex">
          <Button
            variant="outline"
            size="icon"
            className="focus-ring h-9 w-9 rounded-full"
            aria-label="Anteriores"
            disabled={atStart}
            onClick={() => scrollByPage(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="focus-ring h-9 w-9 rounded-full"
            aria-label="Próximos"
            disabled={atEnd}
            onClick={() => scrollByPage(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ul
        ref={trackRef}
        onScroll={updateEdges}
        className={`flex snap-x snap-mandatory items-start overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          atEnd
            ? ""
            : "[mask-image:linear-gradient(to_right,var(--background)_calc(100%-2.5rem),transparent)]"
        }`}
      >
        {items.map((item, index) => (
          <UpcomingStripEntry
            key={`${item.anime.id}:${item.entry.seasonId ?? "legado"}`}
            item={item}
            // From the last dated item on, the rail position is no longer a date.
            dashedRail={
              item.entry.releaseDate === null || items[index + 1]?.entry.releaseDate === null
            }
            onOpen={onOpen}
          />
        ))}
      </ul>
    </section>
  );
}

function UpcomingStripEntry({
  item,
  dashedRail,
  onOpen,
}: {
  item: UpcomingStripItem;
  dashedRail: boolean;
  onOpen: (animeId: string) => void;
}) {
  const { anime, entry } = item;
  const tone = itemTone(item);
  const label = formatReleaseRelative(entry.releaseDate, entry.releasePrecision);
  const exactDate = tone === "vague" ? null : entry.releaseDate;
  const cover = entry.imageUrl ?? anime.cover ?? anime.imageUrl;

  return (
    <li className="group/item shrink-0 snap-start">
      <button
        type="button"
        onClick={() => onOpen(anime.id)}
        aria-label={`${entry.title}, ${anime.name}, ${
          entry.releaseDate === null ? "anunciada, sem data" : label
        }${exactDate ? `, ${formatDateBR(exactDate)}` : ""}`}
        className="focus-ring group/button block w-32 rounded-lg pr-3 text-left sm:w-38 sm:pr-4"
      >
        <div
          className={`relative flex h-7 items-center gap-1 before:absolute before:top-1/2 before:left-0 before:-right-3 group-last/item:before:right-0 sm:before:-right-4 ${
            dashedRail
              ? "before:h-0 before:border-t before:border-dashed before:border-(--border-strong)"
              : "before:h-px before:bg-(--border-strong)"
          }`}
        >
          <span
            aria-hidden="true"
            className={`relative size-2.5 shrink-0 rounded-full ring-4 ring-background ${DOT_TONE[tone]}`}
          />
          <span
            className={`relative whitespace-nowrap bg-background px-1.5 font-display text-[13px] font-bold tracking-tight ${LABEL_TONE[tone]}`}
          >
            {label}
          </span>
        </div>

        <div className="relative mt-1.5 aspect-[2/3] overflow-hidden rounded-lg border border-border transition-[translate,border-color] duration-200 ease-out-soft group-hover/button:border-border-interactive group-focus-visible/button:border-border-interactive motion-safe:group-hover/button:-translate-y-0.5 motion-reduce:transition-none">
          {cover ? (
            <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-card text-primary/40">
              <ImageIcon className="h-8 w-8" />
            </div>
          )}
          {tone === "released" && (
            <span className="absolute top-1.5 left-1.5 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">
              Estreou
            </span>
          )}
          {exactDate && (
            <span className="absolute bottom-1.5 left-1.5 rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-bold text-foreground backdrop-blur-sm">
              {formatDateBR(exactDate, { year: false })}
            </span>
          )}
        </div>

        <div className="mt-2 line-clamp-2 font-display text-[13px] leading-tight font-bold">
          {entry.title}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{anime.name}</div>
      </button>
    </li>
  );
}
