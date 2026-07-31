export const TIMELINE_PLAYHEAD_PUBLISH_INTERVAL_MS: number;

export function shouldPublishTimelinePlayhead(input: {
  timeMode: 'source' | 'timeline';
  isPlaying: boolean;
  immediate?: boolean;
  nextTime: number;
  displayDuration: number;
  fps: number;
  nowMs: number;
  lastPublishedAtMs: number;
}): boolean;
