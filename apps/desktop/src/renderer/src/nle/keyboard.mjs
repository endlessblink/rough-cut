export function isTypingTarget(target) {
  if (!target || typeof target !== 'object') return false;
  const tag = typeof target.tagName === 'string' ? target.tagName.toUpperCase() : '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable === true;
}

export function clampFrame(frame, durationFrames) {
  const target = Math.round(Number(frame) || 0);
  const duration = Math.max(0, Math.round(Number(durationFrames) || 0));
  return Math.max(0, Math.min(duration, target));
}
