import { startOfDay } from './group-by-date.mjs';

// Registry of predicate filters used by the filter-to-select chips. Each
// entry exposes a stable id, a short label, and a pure `matches(summary, now)`
// function. Mirrors the LIBRARY_VIEWS registry pattern — adding a new chip is
// a one-entry append, no shell change needed.
//
// matches() must be tolerant of partial summaries (missing fields treated as
// "doesn't match" rather than throwing) so a corrupt project in the gallery
// can never crash the filter row.

export const LIBRARY_PREDICATES = [
  {
    id: 'has-camera',
    label: 'Has camera',
    matches: (summary) => Boolean(summary?.hasCamera),
  },
  {
    id: 'today',
    label: 'Today',
    matches: (summary, now = new Date()) => {
      if (!summary?.modifiedAt) return false;
      const ts = Date.parse(summary.modifiedAt);
      if (!Number.isFinite(ts)) return false;
      return new Date(ts) >= startOfDay(now);
    },
  },
  {
    id: 'long-takes',
    label: 'Long takes',
    matches: (summary) => Number(summary?.durationMs) >= 60_000,
  },
];

export function findPredicate(id) {
  return LIBRARY_PREDICATES.find((p) => p.id === id) ?? null;
}
