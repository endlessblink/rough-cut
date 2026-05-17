export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatRelativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const sameDay = then.toDateString() === now.toDateString();
  if (sameDay) {
    return then.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (then.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const sixDaysAgo = new Date(now);
  sixDaysAgo.setDate(now.getDate() - 6);
  if (then >= sixDaysAgo) {
    return then.toLocaleDateString([], { weekday: 'long' });
  }
  if (then.getFullYear() === now.getFullYear()) {
    return then.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return then.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}
