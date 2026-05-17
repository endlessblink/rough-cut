/**
 * Bucket project summaries into date groups for the library shell.
 * Buckets are returned in stable display order; empty buckets are dropped.
 * Pure function — the renderer can call this on every render without caching.
 */
export function groupSummariesByDate(summaries, now = new Date()) {
  const todayStart = startOfDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(todayStart.getDate() - 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(todayStart.getDate() - 6); // last 7 days including today
  const monthStart = new Date(todayStart);
  monthStart.setDate(todayStart.getDate() - 29); // last 30 days including today

  const groups = {
    today: { id: 'today', label: 'Today', items: [] },
    yesterday: { id: 'yesterday', label: 'Yesterday', items: [] },
    thisWeek: { id: 'this-week', label: 'This week', items: [] },
    thisMonth: { id: 'this-month', label: 'This month', items: [] },
    earlier: { id: 'earlier', label: 'Earlier', items: [] },
  };

  for (const summary of summaries) {
    const ts = summary?.modifiedAt ? Date.parse(summary.modifiedAt) : NaN;
    if (!Number.isFinite(ts)) { groups.earlier.items.push(summary); continue; }
    const when = new Date(ts);
    if (when >= todayStart) groups.today.items.push(summary);
    else if (when >= yesterdayStart) groups.yesterday.items.push(summary);
    else if (when >= weekStart) groups.thisWeek.items.push(summary);
    else if (when >= monthStart) groups.thisMonth.items.push(summary);
    else groups.earlier.items.push(summary);
  }

  return [groups.today, groups.yesterday, groups.thisWeek, groups.thisMonth, groups.earlier]
    .filter((group) => group.items.length > 0);
}

// Exported so the filter-to-select "Today" predicate can share the same
// day boundary as the date-section headers — they can never drift.
export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
