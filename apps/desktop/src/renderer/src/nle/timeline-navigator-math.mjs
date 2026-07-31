// Small, dependency-free math helpers for the timeline overview navigator.
// Keeping pointer math here makes the navigator easy to test without a DOM.

export function navigatorFrameAtClientX(clientX, surfaceLeft, surfaceWidth, durationFrames) {
  const width = Number(surfaceWidth);
  const duration = Number(durationFrames);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(duration) || duration <= 0) return 0;
  const frame = Math.round(((Number(clientX) - Number(surfaceLeft)) / width) * duration);
  return Math.max(0, Math.min(duration, frame));
}

export function navigatorClipStyle(timelineIn, timelineOut, durationFrames) {
  const duration = Number(durationFrames);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const start = Math.max(0, Math.min(duration, Number(timelineIn)));
  const end = Math.max(start, Math.min(duration, Number(timelineOut)));
  if (end <= start) return null;
  return {
    left: `${(start / duration) * 100}%`,
    width: `${((end - start) / duration) * 100}%`,
  };
}
