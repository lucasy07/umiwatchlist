import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
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

  const errorMessage = isError
    ? error?.message === "429"
      ? "Muitas buscas em sequência. Aguarde alguns segundos e tente de novo."
      : "Erro ao buscar no MyAnimeList. Tente novamente."
    : null;

  return (
    <div className="relative">
      <Input
        id={id}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => {
          setSuppress(false);
          onChange(e.target.value);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter?.();
          if (e.key === "Escape") setSuppress(true);
        }}
        placeholder={placeholder}
        className="pr-9"
        autoComplete="off"
      />
      {isFetching && enabled && (
        <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground motion-reduce:animate-none" />
      )}
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md">
          {isError ? (
            <p className="px-3 py-3 text-sm text-destructive">{errorMessage}</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              Nenhum resultado para "{debounced}".
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {results.map((r) => {
                const year =
                  r.year ?? (r.aired?.from ? new Date(r.aired.from).getFullYear() : null);
                const thumb = r.images?.jpg?.small_image_url;
                return (
                  <li key={r.mal_id}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onPick({
                          malId: r.mal_id,
                          title: r.title,
                          imageUrl: r.images?.jpg?.large_image_url ?? null,
                          score: r.score ?? null,
                        });
                        onChange(r.title);
                        setSuppress(true);
                      }}
                      className="flex w-full items-center gap-3 px-2 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
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
                        {year && <p className="text-xs text-muted-foreground">{year}</p>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
