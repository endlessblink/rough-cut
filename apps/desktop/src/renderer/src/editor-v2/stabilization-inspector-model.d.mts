import type { NleProject } from '../nle/types';

export type StabilizationTarget = {
  sourceId: string;
  assetId: string;
  isCamera: boolean;
};

export type StabilizationStatusLike = {
  phase?: string;
  progress?: number;
  error?: string;
};

export function findStabilizationTarget(
  project: NleProject,
  block: { mediaId?: string | null; assetId?: string | null } | null | undefined,
): StabilizationTarget | null;

export function stabilizationStatusLabel(status: StabilizationStatusLike | null | undefined): string;
