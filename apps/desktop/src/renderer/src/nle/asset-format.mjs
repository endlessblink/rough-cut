// Pure helpers for the NLE asset panel. Extracted to .mjs so they are
// testable under the project's node:test runner (which does not load .tsx).

export const NLE_TRACK_LANES = Object.freeze([
  Object.freeze({ kind: 'video', label: 'Video' }),
  Object.freeze({ kind: 'audio', label: 'Audio' }),
  Object.freeze({ kind: 'captions', label: 'Captions' }),
  Object.freeze({ kind: 'motion-graphics', label: 'Motion graphics' }),
]);

export function assetLabel(asset, index) {
  if (!asset || typeof asset !== 'object') return `Asset #${index + 1}`;
  if (typeof asset.label === 'string' && asset.label) return asset.label;
  if (typeof asset.name === 'string' && asset.name) return asset.name;
  if (typeof asset.type === 'string' && asset.type) return `${asset.type} #${index + 1}`;
  return `Asset #${index + 1}`;
}

export function formatDuration(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  const totalMs = Math.round(seconds * 1000);
  const s = Math.floor(totalMs / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}
