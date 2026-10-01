import type { ReleasePrecision } from "@/lib/anime-storage";

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

export type ScanResult = {
  available: FoundSeason[];
  scheduled: ScheduledSeason[];
  premiered: PremieredSeason[];
  aborted: boolean;
  scanned: number;
};
