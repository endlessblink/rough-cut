export const TRACK_HEIGHT_MIN = 40;
export const TRACK_HEIGHT_MAX = 240;
export const TRACK_HEIGHT_STORAGE_KEY = 'roughCut.timelineTrackHeights.v1';
export function defaultTrackHeight(label, minimum = TRACK_HEIGHT_MIN) { return Math.max(minimum, label.toLowerCase() === 'audio' ? 96 : 44); }
export function clampTrackHeight(value, minimum = TRACK_HEIGHT_MIN) {
  const numeric = Number(value);
  return Math.max(minimum, Math.min(Math.max(minimum, TRACK_HEIGHT_MAX), Math.round(Number.isFinite(numeric) ? numeric : minimum)));
}
export function readTrackHeight(label, storage, minimum = TRACK_HEIGHT_MIN) {
  try { const values = JSON.parse(storage.getItem(TRACK_HEIGHT_STORAGE_KEY) ?? '{}'); const value = values && typeof values === 'object' && !Array.isArray(values) ? values[label] : undefined; return typeof value === 'number' && Number.isFinite(value) ? clampTrackHeight(value, minimum) : defaultTrackHeight(label, minimum); } catch { return defaultTrackHeight(label, minimum); }
}
export function persistTrackHeight(label, value, storage) {
  try { const parsed = JSON.parse(storage.getItem(TRACK_HEIGHT_STORAGE_KEY) ?? '{}'); const values = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; storage.setItem(TRACK_HEIGHT_STORAGE_KEY, JSON.stringify({...values,[label]:value})); } catch { /* A preference failure never prevents resizing. */ }
}
export function keyboardTrackHeight(key, current, minimum, defaultValue, shift = false) {
  if (key === 'Home') return minimum;
  if (key === 'End') return Math.max(minimum, TRACK_HEIGHT_MAX);
  if (key === 'Enter') return clampTrackHeight(defaultValue, minimum);
  if (key === 'ArrowUp' || key === 'ArrowDown') return clampTrackHeight(current + (key === 'ArrowDown' ? 1 : -1) * (shift ? 24 : 8), minimum);
  return null;
}
