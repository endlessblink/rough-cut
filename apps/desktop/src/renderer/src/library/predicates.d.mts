import type { ProjectSummary } from './types';

export type LibraryPredicate = {
  id: 'has-camera' | 'today' | 'long-takes';
  label: string;
  matches: (summary: ProjectSummary, now?: Date) => boolean;
};

export const LIBRARY_PREDICATES: ReadonlyArray<LibraryPredicate>;

export function findPredicate(id: string): LibraryPredicate | null;
