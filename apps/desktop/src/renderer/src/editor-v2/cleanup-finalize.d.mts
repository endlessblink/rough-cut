import type { CleanupDraftProjection } from '@rough-cut/project-model';

export function finalizeCleanupDraftProject<T>(
  project: T,
  projection: CleanupDraftProjection,
): T;
