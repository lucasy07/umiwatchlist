import type { ReleasePrecision } from "@/lib/anime-storage";
import type { ChainReport, ChainSeason } from "@/lib/jikan-chain";

/** Released season a check found outside the anime; added through `seasonFromChain`. */
export type FoundSeason = ChainSeason & {
  parentId: string;
  parentName: string;
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
  /** Animes that ended verified only thanks to the AniList fallback. */
  viaAnilist: number;
  /** The final AniList batch that completes unreleased dates failed. */
  datesFailed: boolean;
};

/**
 * Consecutive "failed" animes that mark a source as down: with Jikan statuses, the rest of the
 * check skips Jikan; with combined statuses (both sources failed), the check stops.
 */
export const OUTAGE_STREAK = 3;

export function classifyChain(
  report: Pick<ChainReport, "requests" | "failedRequests" | "truncated">,
): CheckStatus {
  if (report.requests > 0 && report.failedRequests >= report.requests) return "failed";
  if (report.failedRequests > 0) return "partial";
  if (report.truncated) return "truncated";
  return "verified";
}

export function isOutageStreak(statuses: CheckStatus[]): boolean {
  if (statuses.length < OUTAGE_STREAK) return false;
  return statuses.slice(-OUTAGE_STREAK).every((status) => status === "failed");
}

const STATUS_SEVERITY: Record<CheckStatus, number> = {
  verified: 0,
  truncated: 1,
  partial: 2,
  failed: 3,
};

/**
 * Final status of an anime checked by Jikan and, as fallback, AniList (null = not asked).
 * A complete AniList chain verifies it; otherwise the worse of the sources that answered, so
 * "failed" still means nothing was applied: both failed (or Jikan was skipped and AniList failed).
 */
export function combineCheckStatus(
  jikan: CheckStatus | null,
  anilist: CheckStatus | null,
): CheckStatus {
  if (anilist === "verified") return "verified";
  if (jikan === null || jikan === "failed") return anilist ?? "failed";
  if (anilist === null || anilist === "failed") return jikan;
  return STATUS_SEVERITY[anilist] > STATUS_SEVERITY[jikan] ? anilist : jikan;
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
