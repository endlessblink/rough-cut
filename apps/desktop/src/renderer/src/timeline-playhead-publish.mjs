// Keep the React-owned timeline indicator within one display frame budget at
// ordinary playback rates; the media/render loop remains the clock authority.
export const TIMELINE_PLAYHEAD_PUBLISH_INTERVAL_MS = 16;

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
