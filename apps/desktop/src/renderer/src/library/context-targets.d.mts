import type { ProjectSummary } from './types';

export function resolveContextTargets(options: {
  summaries: ReadonlyArray<ProjectSummary>;
  selection: ReadonlySet<string>;
  targetPath: string;
}): ProjectSummary[];
