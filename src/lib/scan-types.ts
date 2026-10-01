import type { ReleasePrecision } from "@/lib/anime-storage";
import type { ChainReport } from "@/lib/jikan-chain";

export type FoundSeason = {
  parentId: string;
  parentName: string;
  malId: number;
  title: string;
  malScore: number | null;
  imageUrl: string | null;
  type: string | null;
  year: number | null;
  episodes: number | null;
  durationMin: number | null;
};

export type UpdatedSeason = {
  parentId: string;
  parentName: string;
  title: string;
  malId: number;
  oldScore: number | null;
  newScore: number | null;
  filledFields: string[];
};

/** Announced season added or rescheduled by a check. */
export type ScheduledSeason = {
  parentId: string;
  parentName: string;
  title: string;
  releaseDate: string | null;
  releasePrecision: ReleasePrecision | null;
};

/** Unreleased season that premiered and was converted by a check. */
export type PremieredSeason = {
  parentId: string;
  parentName: string;
  title: string;
  type: string | null;
  year: number | null;
};

/**
 * How a check ended for one anime. Only "verified" records lastCheckedAt;
 * "partial" (some requests failed) and "truncated" (franchise hit the entry cap)
 * still apply what was found, "failed" (no request answered) applies nothing.
 */
export type CheckStatus = "verified" | "partial" | "truncated" | "failed";

export type UncheckedAnime = {
  parentId: string;
  parentName: string;
  reason: Exclude<CheckStatus, "verified">;
};

export type ScanInterruption = "cancelled" | "outage";

export type ScanResult = {
  available: FoundSeason[];
  scheduled: ScheduledSeason[];
  premiered: PremieredSeason[];
  unchecked: UncheckedAnime[];
  interruption: ScanInterruption | null;
  /** Targets processed, whatever their status. */
  scanned: number;
  verified: number;
};

/** Consecutive animes with no Jikan answer after which a global check stops. */
export const JIKAN_OUTAGE_STREAK = 3;

export function classifyChain(
  report: Pick<ChainReport, "requests" | "failedRequests" | "truncated">,
): CheckStatus {
  if (report.requests > 0 && report.failedRequests >= report.requests) return "failed";
  if (report.failedRequests > 0) return "partial";
  if (report.truncated) return "truncated";
  return "verified";
}

export function isJikanOutage(statuses: CheckStatus[]): boolean {
  if (statuses.length < JIKAN_OUTAGE_STREAK) return false;
  return statuses.slice(-JIKAN_OUTAGE_STREAK).every((status) => status === "failed");
}

export function scanOutcome(result: ScanResult): "nothing" | "allFailed" | "dialog" {
  const allFailed =
    result.scanned > 0 &&
    result.unchecked.length === result.scanned &&
    result.unchecked.every((u) => u.reason === "failed");
  if (allFailed) return "allFailed";
  const found = result.available.length + result.scheduled.length + result.premiered.length;
  if (found === 0 && result.unchecked.length === 0) return "nothing";
  return "dialog";
}
