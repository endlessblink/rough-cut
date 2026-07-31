import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TIMELINE_PLAYHEAD_PUBLISH_INTERVAL_MS,
  shouldPublishTimelinePlayhead,
} from './timeline-playhead-publish.mjs';

const base = {
  timeMode: 'timeline',
  isPlaying: true,
  nextTime: 3.2,
  displayDuration: 20,
  fps: 30,
  nowMs: 1_000,
  lastPublishedAtMs: 1_000,
};

test('timeline playback republishes the canonical playhead every 50ms', () => {
  assert.equal(TIMELINE_PLAYHEAD_PUBLISH_INTERVAL_MS, 50);
  assert.equal(
    shouldPublishTimelinePlayhead({
      ...base,
      nowMs: base.lastPublishedAtMs + 49,
    }),
    false,
  );
  assert.equal(
    shouldPublishTimelinePlayhead({
      ...base,
      nowMs: base.lastPublishedAtMs + 50,
    }),
    true,
  );
});

test('seeks and playback boundaries publish immediately', () => {
  assert.equal(shouldPublishTimelinePlayhead({ ...base, immediate: true }), true);
  assert.equal(shouldPublishTimelinePlayhead({ ...base, nextTime: 0 }), true);
  assert.equal(
    shouldPublishTimelinePlayhead({ ...base, nextTime: base.displayDuration }),
    true,
  );
});

test('source playback and paused timeline changes remain immediate', () => {
  assert.equal(
    shouldPublishTimelinePlayhead({ ...base, timeMode: 'source' }),
    true,
  );
  assert.equal(
    shouldPublishTimelinePlayhead({ ...base, isPlaying: false }),
    true,
  );
});
