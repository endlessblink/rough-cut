/** `/home/me/Documents/Rough Cut MVP/exports` -> `…/Documents/Rough Cut MVP/exports` (the full path stays in a tooltip). */
export function shortenPath(path: string, keep = 3) {
  const parts = path.split('/').filter(Boolean);
  return parts.length > keep ? `…/${parts.slice(-keep).join('/')}` : path;
}
