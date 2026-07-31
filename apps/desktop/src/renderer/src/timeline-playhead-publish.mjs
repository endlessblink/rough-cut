export const TIMELINE_PLAYHEAD_PUBLISH_INTERVAL_MS = 50;

export function shouldPublishTimelinePlayhead({
  timeMode,
  isPlaying,
  immediate = false,
  nextTime,
  displayDuration,
  fps,
  nowMs,
  lastPublishedAtMs,
}) {
  if (immediate || timeMode !== 'timeline' || !isPlaying) return true;
  if (nextTime <= 0 || nextTime >= displayDuration - 1 / fps) return true;
  if (!Number.isFinite(lastPublishedAtMs) || nowMs < lastPublishedAtMs) return true;
  return nowMs - lastPublishedAtMs >= TIMELINE_PLAYHEAD_PUBLISH_INTERVAL_MS;
}
