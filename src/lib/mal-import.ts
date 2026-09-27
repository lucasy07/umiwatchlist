import {
  createAnime,
  isExcludedFromAverage,
  setWatched,
  tierFromAverage,
  uid,
  updateSeasons,
  updateTier,
  type Anime,
  type Season,
  type Tier,
} from "@/lib/anime-storage";
import { buildChain, type ChainSeason } from "@/lib/jikan-chain";

export type MalStatus = "completed" | "watching" | "on_hold" | "dropped" | "plan_to_watch";

export type MalEntry = {
  malId: number;
  title: string;
  type: string | null;
  episodes: number | null;
  status: MalStatus;
  score: number;
};

export type MalImportSummary = {
  created: number;
  alreadyInList: number;
  ignoredPlanToWatch: number;
  linkedToExisting: string[];
  failed: string[];
};

export type MalImportOptions = {
  onProgress?: (progress: { done: number; total: number; currentName: string }) => void;
  signal?: AbortSignal;
  onCreated?: (anime: Anime) => void;
  onUpdated?: (anime: Anime) => void;
};

function normalizeStatus(value: string): MalStatus {
  switch (value.trim().toLowerCase()) {
    case "completed":
      return "completed";
    case "watching":
      return "watching";
    case "on-hold":
      return "on_hold";
    case "dropped":
      return "dropped";
    default:
      return "plan_to_watch";
  }
}

export async function parseMalExport(file: File): Promise<MalEntry[]> {
  try {
    const header = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    const gzip = header[0] === 0x1f && header[1] === 0x8b;
    const xml = gzip
      ? await new Response(file.stream().pipeThrough(new DecompressionStream("gzip"))).text()
      : await file.text();
    const document = new DOMParser().parseFromString(xml, "application/xml");
    if (document.querySelector("parsererror")) throw new Error("XML inválido");
    const read = (element: Element, tag: string) =>
      element.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
    const entries = Array.from(document.getElementsByTagName("anime")).map((element) => {
      const malId = Number(read(element, "series_animedb_id"));
      const episodes = Number(read(element, "series_episodes"));
      const score = Number(read(element, "my_score"));
      return {
        malId,
        title: read(element, "series_title"),
        type: read(element, "series_type") || null,
        episodes: Number.isFinite(episodes) && episodes > 0 ? episodes : null,
        status: normalizeStatus(read(element, "my_status")),
        score: Number.isFinite(score) && score > 0 ? score : 0,
      } satisfies MalEntry;
    });
    if (
      entries.length === 0 ||
      entries.some((entry) => !Number.isInteger(entry.malId) || entry.malId <= 0)
    ) {
      throw new Error("Arquivo sem animes válidos");
    }
    return entries;
  } catch {
    throw new Error("Não foi possível ler a lista do MAL. Verifique se o arquivo XML é válido.");
  }
}

function seasonFrom(entry: MalEntry, detail?: ChainSeason): Season {
  return {
    id: uid(),
    name: detail?.title ?? entry.title,
    malId: entry.malId,
    year: detail?.year ?? null,
    malScore: detail?.malScore ?? null,
    type: detail?.type ?? entry.type,
    episodes: detail?.episodes ?? entry.episodes,
    durationMin: detail?.durationMin ?? null,
    imageUrl: detail?.imageUrl ?? null,
  };
}

function aggregate(
  entries: MalEntry[],
  seasons: Season[],
): { watched: boolean; tier: Tier | null } {
  const counted = entries.filter((entry) => {
    const season = seasons.find((s) => s.malId === entry.malId);
    return season ? !isExcludedFromAverage(season) : true;
  });
  const relevant = counted.length > 0 ? counted : entries;
  const scores = counted.map((entry) => entry.score).filter((score) => score > 0);
  return {
    watched: relevant.length > 0 && relevant.every((entry) => entry.status === "completed"),
    tier:
      scores.length > 0
        ? tierFromAverage(scores.reduce((sum, score) => sum + score, 0) / scores.length)
        : null,
  };
}

function isAborted(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof Error && error.name === "AbortError");
}

export async function runMalImport(
  entries: MalEntry[],
  existingAnimes: readonly Anime[],
  { onProgress, signal, onCreated, onUpdated }: MalImportOptions = {},
): Promise<MalImportSummary> {
  const summary: MalImportSummary = {
    created: 0,
    alreadyInList: 0,
    ignoredPlanToWatch: 0,
    linkedToExisting: [],
    failed: [],
  };
  const existing = new Set<number>();
  for (const anime of existingAnimes) {
    if (anime.malId != null) existing.add(anime.malId);
    for (const season of anime.seasons) if (season.malId != null) existing.add(season.malId);
  }

  const grouped = new Set<number>();
  const createdById = new Map<number, Anime>();
  const entriesByAnime = new Map<string, MalEntry[]>();
  let done = 0;
  const report = (currentName: string) =>
    onProgress?.({ done, total: entries.length, currentName });
  report("");

  for (let index = 0; index < entries.length; index++) {
    if (signal?.aborted) break;
    if (grouped.has(index)) continue;
    const entry = entries[index];
    if (existing.has(entry.malId)) {
      grouped.add(index);
      summary.alreadyInList++;
      done++;
      report(entry.title);
      continue;
    }

    let members: Array<{ entry: MalEntry; index: number }> = [{ entry, index }];
    try {
      let chain: ChainSeason[] = [];
      try {
        chain = await buildChain(entry.malId, undefined, signal);
      } catch (error) {
        if (isAborted(error, signal)) break;
      }
      if (signal?.aborted) break;
      if (!chain.some((detail) => detail.malId === entry.malId)) chain = [];
      if (chain.length > 0) {
        const chainIds = new Set(chain.map((detail) => detail.malId));
        members = entries.flatMap((candidate, candidateIndex) =>
          !grouped.has(candidateIndex) && chainIds.has(candidate.malId)
            ? [{ entry: candidate, index: candidateIndex }]
            : [],
        );
      }
      const group = members.map((member) => member.entry);
      const label = entry.title;
      if (
        chain.some((detail) => existing.has(detail.malId)) ||
        group.some((candidate) => existing.has(candidate.malId))
      ) {
        summary.linkedToExisting.push(label);
      } else {
        const hasCompleted = group.some((candidate) => candidate.status === "completed");
        const kept = group.filter((candidate) => {
          if (hasCompleted && candidate.status === "plan_to_watch") {
            summary.ignoredPlanToWatch++;
            return false;
          }
          return true;
        });
        const details = new Map(chain.map((detail) => [detail.malId, detail]));
        const ordered = [
          ...chain.flatMap((detail) =>
            kept.filter((candidate) => candidate.malId === detail.malId),
          ),
          ...kept.filter((candidate) => !details.has(candidate.malId)),
        ];
        const overlap = chain
          .map((detail) => createdById.get(detail.malId))
          .find((anime) => anime != null);
        const previous = overlap ? (entriesByAnime.get(overlap.id) ?? []) : [];
        const added = ordered.filter(
          (candidate) => !overlap?.seasons.some((season) => season.malId === candidate.malId),
        );
        const newSeasons = added.map((candidate) =>
          seasonFrom(candidate, details.get(candidate.malId)),
        );
        const seasons = overlap ? [...overlap.seasons, ...newSeasons] : newSeasons;
        const combined = [...previous, ...added];
        const { watched, tier } = aggregate(combined, seasons);
        if (signal?.aborted) break;
        if (overlap) {
          await updateSeasons(overlap.id, seasons);
          await updateTier(overlap.id, tier);
          await setWatched(overlap.id, watched);
          const updated = { ...overlap, seasons, tier, watched };
          for (const season of seasons)
            if (season.malId != null) createdById.set(season.malId, updated);
          entriesByAnime.set(updated.id, combined);
          onUpdated?.(updated);
        } else {
          const first = ordered[0];
          const firstDetail = details.get(first.malId);
          const created = await createAnime({
            name: firstDetail?.title ?? first.title,
            cover: firstDetail?.imageUrl ?? undefined,
            malId: first.malId,
            imageUrl: firstDetail?.imageUrl ?? null,
            malScore: firstDetail?.malScore ?? null,
            genres: firstDetail?.genres ?? null,
            seasons,
            watched,
            tier,
          });
          summary.created++;
          for (const season of seasons)
            if (season.malId != null) createdById.set(season.malId, created);
          entriesByAnime.set(created.id, combined);
          onCreated?.(created);
        }
      }
    } catch (error) {
      if (isAborted(error, signal)) break;
      summary.failed.push(entry.title);
    }
    for (const member of members) grouped.add(member.index);
    done += members.length;
    report(entry.title);
  }
  return summary;
}
