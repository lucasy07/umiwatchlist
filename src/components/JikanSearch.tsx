import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { moveActiveIndex } from "@/lib/combobox-nav";
import { searchJikanAnime } from "@/lib/jikan-client";

export type JikanPick = {
  malId: number;
  title: string;
  imageUrl: string | null;
  score: number | null;
};

type JikanAnime = {
  mal_id: number;
  title: string;
  year: number | null;
  aired?: { from?: string | null } | null;
  score: number | null;
  images?: { jpg?: { small_image_url?: string; large_image_url?: string } };
};

async function searchJikan(q: string, signal: AbortSignal): Promise<JikanAnime[]> {
  return searchJikanAnime(q, 5, { signal, priority: "interactive" });
}

type AniListMedia = {
  idMal: number | null;
  title: { romaji: string | null; english: string | null } | null;
  startDate: { year: number | null } | null;
  coverImage: { medium: string | null; large: string | null } | null;
  averageScore: number | null;
};

async function searchAniList(q: string, signal: AbortSignal): Promise<JikanAnime[]> {
  const query = `query ($search: String) { Page(perPage: 5) { media(search: $search, type: ANIME, isAdult: false) { idMal title { romaji english } startDate { year } coverImage { medium large } averageScore } } }`;
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables: { search: q } }),
    signal,
  });
  if (!res.ok) throw new Error(String(res.status));
  const json = (await res.json()) as { data?: { Page?: { media?: AniListMedia[] } } };
  const media = json.data?.Page?.media ?? [];
  return media
    .filter((m) => m.idMal != null)
    .map<JikanAnime>((m) => ({
      mal_id: m.idMal as number,
      title: m.title?.romaji ?? m.title?.english ?? "",
      year: m.startDate?.year ?? null,
      aired: null,
      score: m.averageScore != null ? m.averageScore / 10 : null,
      images: {
        jpg: {
          small_image_url: m.coverImage?.medium ?? undefined,
          large_image_url: m.coverImage?.large ?? undefined,
        },
      },
    }));
}

async function searchAnime(q: string, signal: AbortSignal): Promise<JikanAnime[]> {
  try {
    return await searchJikan(q, signal);
  } catch (jikanErr) {
    try {
      return await searchAniList(q, signal);
    } catch {
      throw jikanErr;
    }
  }
}

function useDebounced<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

type Props = {
  value: string;
  onChange: (v: string) => void;
  onPick: (pick: JikanPick) => void;
  placeholder?: string;
  id?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
};

export function JikanSearch({
  value,
  onChange,
  onPick,
  placeholder,
  id,
  autoFocus,
  onEnter,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [suppress, setSuppress] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();
  const optionId = (index: number) => `${listboxId}-option-${index}`;
  const debounced = useDebounced(value.trim(), 500);
  const enabled = focused && !suppress && debounced.length >= 3;

  const { data, isFetching, isError, error, isSuccess } = useQuery({
    queryKey: ["jikan", debounced],
    queryFn: ({ signal }) => searchAnime(debounced, signal),
    enabled,
    staleTime: 60_000,
    retry: false,
  });

  const results = enabled ? (data ?? []) : [];
  const showDropdown =
    focused && enabled && (results.length > 0 || isError || (isSuccess && results.length === 0));
  const showOptions = showDropdown && !isError && results.length > 0;

  // Lista nova (ou fechada): nenhuma opção fica ativa.
  const resultsKey = showOptions ? results.map((r) => r.mal_id).join(",") : "";
  const [prevResultsKey, setPrevResultsKey] = useState(resultsKey);
  if (resultsKey !== prevResultsKey) {
    setPrevResultsKey(resultsKey);
    setActiveIndex(-1);
  }

  const activeId = showOptions && activeIndex >= 0 ? optionId(activeIndex) : undefined;

  useEffect(() => {
    if (!activeId) return;
    document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  const errorMessage = isError
    ? error?.message === "429"
      ? "Muitas buscas em sequência. Aguarde alguns segundos e tente de novo."
      : "Erro ao buscar no MyAnimeList. Tente novamente."
    : null;

  const statusMessage = !enabled
    ? ""
    : isFetching
      ? "Buscando…"
      : isError
        ? (errorMessage ?? "")
        : isSuccess
          ? results.length === 0
            ? "Nenhum resultado"
            : `${results.length} ${results.length === 1 ? "resultado" : "resultados"}`
          : "";

  const pick = (r: JikanAnime) => {
    onPick({
      malId: r.mal_id,
      title: r.title,
      imageUrl: r.images?.jpg?.large_image_url ?? null,
      score: r.score ?? null,
    });
    onChange(r.title);
    setSuppress(true);
  };

  return (
    <div className="relative">
      <Input
        id={id}
        autoFocus={autoFocus}
        value={value}
        role="combobox"
        aria-expanded={showOptions}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        onChange={(e) => {
          setSuppress(false);
          onChange(e.target.value);
        }}
        onFocus={() => setFocused(true)}
        // Fecha no próximo tick: remover as opções durante o blur, com o foco ainda no
        // body, faz o FocusScope do Radix devolver o foco ao dialog em vez do próximo campo.
        onBlur={() => setTimeout(() => setFocused(false), 0)}
        onKeyDown={(e) => {
          if ((e.key === "ArrowDown" || e.key === "ArrowUp") && showOptions) {
            e.preventDefault();
            setActiveIndex((i) =>
              moveActiveIndex(i, e.key === "ArrowDown" ? 1 : -1, results.length),
            );
            return;
          }
          if (e.key === "Enter") {
            const active = showOptions ? results[activeIndex] : undefined;
            if (active) {
              e.preventDefault();
              pick(active);
              return;
            }
            onEnter?.();
          }
          if (e.key === "Escape") setSuppress(true);
        }}
        placeholder={placeholder}
        className="pr-9"
        autoComplete="off"
      />
      {isFetching && enabled && (
        <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground motion-reduce:animate-none" />
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {statusMessage}
      </p>
      {showDropdown && !showOptions && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md">
          {isError ? (
            <p className="px-3 py-3 text-sm text-destructive">{errorMessage}</p>
          ) : (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              Nenhum resultado para “{debounced}”.
            </p>
          )}
        </div>
      )}
      <ul
        id={listboxId}
        role="listbox"
        tabIndex={-1}
        hidden={!showOptions}
        className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-md"
      >
        {showOptions &&
          results.map((r, index) => {
            const year = r.year ?? (r.aired?.from ? new Date(r.aired.from).getFullYear() : null);
            const thumb = r.images?.jpg?.small_image_url;
            const active = index === activeIndex;
            return (
              <li
                key={r.mal_id}
                id={optionId(index)}
                role="option"
                aria-selected={active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => pick(r)}
                className={`flex w-full cursor-pointer items-center gap-3 px-2 py-2 text-left text-sm transition-colors ${
                  active ? "bg-accent text-accent-foreground" : ""
                }`}
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt=""
                    className="h-12 w-9 flex-shrink-0 rounded object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-12 w-9 flex-shrink-0 rounded bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.title}</p>
                  {year && (
                    <p className={`text-xs ${active ? "" : "text-muted-foreground"}`}>{year}</p>
                  )}
                </div>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
