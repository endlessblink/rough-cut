// Pure model for the Editor v2 media pool: bin classification, the bin
// rail (only bins that exist in the project, plus Generated), and search.
// Kept DOM-free so node --test covers it directly.
import { assetLabel } from '../nle/asset-format.mjs';

export function assetBin(asset) {
  const type = String(asset?.type ?? '').toLowerCase();
  if (type.includes('audio')) return 'audio';
  if (type.includes('image') || type.includes('still')) return 'stills';
  return 'video';
}

export function binsForAssets(assets) {
  const present = new Set((assets ?? []).map((asset) => assetBin(asset)));
  const list = [{ id: 'all', label: 'All media' }];
  if (present.has('video')) list.push({ id: 'video', label: 'Video' });
  if (present.has('audio')) list.push({ id: 'audio', label: 'Audio' });
  if (present.has('stills')) list.push({ id: 'stills', label: 'Stills' });
  list.push({ id: 'generated', label: 'Generated' });
  return list;
}

// Returns [{asset, index}] for the given bin + search query. Indexes are the
// asset's position in the original list (assetLabel numbering depends on it).
export function filterAssets(assets, bin, query) {
  const needle = String(query ?? '').trim().toLowerCase();
  return (assets ?? [])
    .map((asset, index) => ({ asset, index }))
    .filter(({ asset }) => (bin === 'all' || bin === 'generated' ? true : assetBin(asset) === bin))
    .filter(({ asset, index }) => !needle || assetLabel(asset, index).toLowerCase().includes(needle));
}

// Auto-generated recording names ("rough-cut-2026-06-02T15-49-33-067Z") are
// machine ids, not titles. Render them as a short human take name; real
// user-given names pass through untouched.
export function shortProjectName(name) {
  const value = String(name ?? '').trim();
  const match = value.match(/^rough-cut-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-\d{2}-\d{3}Z?$/);
  if (!match) return value;
  const [, , month, day, hour, minute] = match;
  return `Take ${Number(month)}/${Number(day)} ${hour}:${minute}`;
}
