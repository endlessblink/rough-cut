import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Wiring guards for track/clip volume in the live preview (the rules themselves
// are unit-tested in audio-volume.test.mjs; real levels were measured in a
// silent Chromium run).
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');

test('every playback-segment level carries the clip volume, including the standby that takes over at a cut', () => {
  const joinCalls = source.match(/setScreenGain\([^;]*timelineJoinGain\(/g) ?? [];
  assert.equal(joinCalls.length, 4);
  for (const call of joinCalls) assert.match(call, /playbackSegmentGain\(timelineJoinGain\(/);
  assert.match(source, /setScreenGain\(standby, playbackSegmentGain\(timelineJoinGain\(buildTimelinePlaybackSegments\(\), nextSegment, nextSegment\.timelineIn\), nextSegment\)\);/);
  // The standby stays silent while it pre-rolls.
  assert.match(source, /setScreenGain\(standby, 0\);/);
});

test('track volume is the master gain, moved with a short ramp; never element.volume', () => {
  assert.match(source, /master\.gain\.value = masterGain\(\{ audioMuted: audioMutedRef\.current, trackGain: trackGainRef\.current \}\);/);
  assert.match(source, /audio\.master\.gain\.setTargetAtTime\(masterGain\(\{ audioMuted: audioMutedRef\.current, trackGain \}\), audio\.context\.currentTime, 0\.004\);/);
  assert.doesNotMatch(source, /\.volume\s*=\s*(trackGain|clipGain)/);
});

test('slider moves are read through refs, so they never restart playback', () => {
  assert.match(source, /trackGainRef\.current = trackGain;/);
  assert.match(source, /clipGainOverrideRef\.current = clipGainOverride;/);
  assert.match(source, /return slotGain\(joinGain, segment, clipGainOverrideRef\.current\);/);
  // Neither prop is a dependency of the playback or render-loop effects.
  for (const deps of source.match(/\}, \[[^\]]*isPlaying[^\]]*\]\);/g) ?? []) {
    assert.doesNotMatch(deps, /trackGain|clipGainOverride/);
  }
});

test('the boost limiter is only in the path while something plays above 100%', () => {
  assert.match(source, /const wanted = previewNeedsLimiter\(/);
  assert.match(source, /if \(wanted === Boolean\(audio\.limiter\)\) return;/);
  assert.match(source, /shaper\.curve = boostLimiterCurve\(\);/);
  assert.match(source, /limiter: null/);
});
