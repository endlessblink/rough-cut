// Recordings are saved as `rough-cut-2026-07-19T18-07-16-622Z` — a UTC timestamp
// that reads like a temp file. Show those as the local date and time instead;
// any name the user typed is shown unchanged.
const TIMESTAMP_NAME = /^rough-cut-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})(?:-(\d{1,3}))?Z$/;

export function formatProjectName(name, locale) {
  const match = TIMESTAMP_NAME.exec(String(name ?? '').trim());
  if (!match) return name;
  const [, y, mo, d, h, mi, s, ms = '0'] = match;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), Number(ms)));
  if (Number.isNaN(date.getTime())) return name;
  const day = date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/,/g, '');
  const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} · ${time}`;
}
