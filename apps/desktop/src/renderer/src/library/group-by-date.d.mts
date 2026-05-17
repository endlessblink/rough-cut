import type { ProjectSummary } from './types';

export type DateGroup = {
  id: 'today' | 'yesterday' | 'this-week' | 'this-month' | 'earlier';
  label: string;
  items: ProjectSummary[];
};

export function groupSummariesByDate(
  summaries: ReadonlyArray<ProjectSummary>,
  now?: Date,
): DateGroup[];

export function startOfDay(date: Date): Date;
