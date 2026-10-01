import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSilenceDetect, silencesToCutRanges } from './silence-detect.mjs';

const STDERR = `
[silencedetect @ 0x1] silence_start: 0
[silencedetect @ 0x1] silence_end: 5.5 | silence_duration: 5.5
[silencedetect @ 0x1] silence_start: 50.3
[silencedetect @ 0x1] silence_end: 52.4 | silence_duration: 2.1
[silencedetect @ 0x1] silence_start: 99.0
[silencedetect @ 0x1] silence_end: 99.8 | silence_duration: 0.8
[silencedetect @ 0x1] silence_start: 352.5
`;

test('ffmpeg silencedetect output becomes silent ranges, including one that runs to the end', () => {
  assert.deepEqual(parseSilenceDetect(STDERR, { durationSec: 356 }), [
    { startSec: 0, endSec: 5.5 },
    { startSec: 50.3, endSec: 52.4 },
    { startSec: 99, endSec: 99.8 },
    { startSec: 352.5, endSec: 356 },
  ]);
});

test('silences become padded cut ranges; short ones and already-cut ones are skipped', () => {
  const silences = parseSilenceDetect(STDERR, { durationSec: 356 });
  const cuts = silencesToCutRanges(silences, { fps: 30, durationFrames: 10680, existingCuts: [{ startFrame: 10500, endFrame: 10680 }] });
  assert.deepEqual(cuts.map(({ startFrame, endFrame }) => [startFrame, endFrame]), [
    [0, 158], // starts at 0: no padding at the outer edge, 0.25 s kept before speech
    [1517, 1565], // 0.25 s breathing room both sides
  ]);
});
