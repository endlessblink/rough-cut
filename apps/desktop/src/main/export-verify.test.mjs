import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateExportVerification } from './export-verify.mjs';

const probeOf = ({ duration = 349, audio = 348.99, video = true } = {}) => ({
  format: { duration: String(duration) },
  streams: [
    ...(video ? [{ codec_type: 'video', duration: String(duration) }] : []),
    ...(audio === null ? [] : [{ codec_type: 'audio', duration: String(audio) }]),
  ],
});

test('a complete export passes with a plain-language summary', () => {
  const result = evaluateExportVerification({ probe: probeOf(), expectedDurationSec: 349, sourceHasAudio: true });
  assert.equal(result.ok, true);
  assert.deepEqual(result.problems, []);
  assert.match(result.summary, /^Checked: picture, sound and length look right/);
});

test('a silent export of a recording that has sound is a problem (the walkthrough failure)', () => {
  const result = evaluateExportVerification({ probe: probeOf({ audio: null, duration: 356 }), expectedDurationSec: 349, sourceHasAudio: true });
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems.map((problem) => problem.id), ['no-sound', 'too-long']);
  assert.match(result.summary, /no sound/);
  assert.match(result.summary, /frozen frame/);
});

test('a recording with no sound may export without sound', () => {
  const result = evaluateExportVerification({ probe: probeOf({ audio: null }), expectedDurationSec: 349, sourceHasAudio: false });
  assert.equal(result.ok, true);
  assert.match(result.summary, /^Checked: picture and length/);
});

test('an export that is cut short, or whose sound drifts from the picture, is reported', () => {
  const short = evaluateExportVerification({ probe: probeOf({ duration: 300, audio: 300 }), expectedDurationSec: 349, sourceHasAudio: true });
  assert.deepEqual(short.problems.map((problem) => problem.id), ['too-short']);
  const drift = evaluateExportVerification({ probe: probeOf({ duration: 349, audio: 340 }), expectedDurationSec: 349, sourceHasAudio: true });
  assert.deepEqual(drift.problems.map((problem) => problem.id), ['sound-length']);
});

test('without an expected length only the picture and sound are judged', () => {
  const result = evaluateExportVerification({ probe: probeOf({ duration: 1234, audio: 1234 }), expectedDurationSec: null, sourceHasAudio: true });
  assert.equal(result.ok, true);
  assert.equal(evaluateExportVerification({ probe: { format: {}, streams: [] } }).ok, false);
});

test('animated graphics missing from the export are reported plainly, with the reason', () => {
  const none = evaluateExportVerification({ probe: probeOf(), expectedDurationSec: 349, sourceHasAudio: true, graphics: { expected: 4, included: 0, error: 'capturePage failed' } });
  assert.equal(none.ok, false);
  assert.deepEqual(none.problems.map((problem) => problem.id), ['graphics-missing']);
  assert.match(none.summary, /The project has 4 animated graphics, but none are in this export\. Reason: capturePage failed/);

  const some = evaluateExportVerification({ probe: probeOf(), expectedDurationSec: 349, sourceHasAudio: true, graphics: { expected: 4, included: 3 } });
  assert.deepEqual(some.problems.map((problem) => problem.id), ['graphics-partial']);

  const single = evaluateExportVerification({ probe: probeOf(), expectedDurationSec: 349, sourceHasAudio: true, graphics: { expected: 1, included: 0 } });
  assert.match(single.summary, /1 animated graphic, but none/);
});

test('with all animations present the check says so; with none expected it stays quiet about them', () => {
  const all = evaluateExportVerification({ probe: probeOf(), expectedDurationSec: 349, sourceHasAudio: true, graphics: { expected: 4, included: 4 } });
  assert.equal(all.ok, true);
  assert.match(all.summary, /picture, sound, animations and length look right/);
  const raw = evaluateExportVerification({ probe: probeOf(), expectedDurationSec: 349, sourceHasAudio: true, graphics: { expected: 0, included: 0 } });
  assert.equal(raw.ok, true);
  assert.doesNotMatch(raw.summary, /animations/);
});
