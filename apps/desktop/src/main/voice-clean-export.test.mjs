import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVoiceCleanMixSourceArgs,
  planVoiceCleanExport,
  voiceCleanAmountOf,
  withPrimaryRecordingPath,
} from './voice-clean-export.mjs';

const project = (amount, extra = {}) => ({
  settings: amount === undefined ? {} : { voiceClean: { amount } },
  // Same rule as getPrimaryRecording: the first recording-or-video asset.
  assets: [
    { id: 'rec', type: 'recording', filePath: '/r/take.mp4', metadata: { absoluteFilePath: '/r/take.mp4' } },
    { id: 'cam', type: 'video', filePath: '/r/take-camera.mp4', metadata: {} },
  ],
  ...extra,
});

test('amount: missing or junk is 0, values clamp to 0..1', () => {
  assert.equal(voiceCleanAmountOf(project(undefined)), 0);
  assert.equal(voiceCleanAmountOf(project(0.4)), 0.4);
  assert.equal(voiceCleanAmountOf(project(3)), 1);
  assert.equal(voiceCleanAmountOf({ settings: { voiceClean: { amount: 'x' } } }), 0);
});

test('mix args: video stream copied untouched, sound = (1-a)*original + a*cleaned on both sides', () => {
  const args = buildVoiceCleanMixSourceArgs({ sourcePath: '/r/take.mp4', cleanedPath: '/r/take.voice-clean.wav', amount: 0.25, outputPath: '/o/.x.clean-voice.mp4' });
  assert.deepEqual(args.slice(args.indexOf('-c:v'), args.indexOf('-c:v') + 2), ['-c:v', 'copy']);
  assert.ok(args.includes('0:v:0') && args.includes('1:a:0'));
  assert.equal(args[args.indexOf('-af') + 1], 'pan=stereo|c0=0.75*c0+0.25*c1|c1=0.75*c0+0.25*c1');
  assert.equal(args.at(-1), '/o/.x.clean-voice.mp4');
});

test('stand-in: the first recording/video asset is repointed, nothing else changes', () => {
  const original = project(1, { assets: [
    { id: 'rec', type: 'recording', filePath: '/r/take.mp4', pathMode: 'relative', metadata: { absoluteFilePath: '/r/take.mp4', fps: 30 } },
    { id: 'cam', type: 'video', filePath: '/r/take-camera.mp4' },
  ] });
  const swapped = withPrimaryRecordingPath(original, '/o/standin.mp4');
  assert.equal(swapped.assets[0].filePath, '/o/standin.mp4');
  assert.equal(swapped.assets[0].metadata.absoluteFilePath, '/o/standin.mp4');
  assert.equal(swapped.assets[0].metadata.fps, 30);
  assert.equal(swapped.assets[1].filePath, '/r/take-camera.mp4', 'camera untouched');
  assert.equal(original.assets[0].filePath, '/r/take.mp4', 'input not mutated');
});

test('plan: off at amount 0, without a fresh cleaned file, or without a recording', { skip: process.platform === 'win32' ? 'uses POSIX paths or file modes' : false }, async () => {
  const fresh = async () => true;
  assert.equal(await planVoiceCleanExport({ project: project(0), isFresh: fresh }), null);
  assert.equal(await planVoiceCleanExport({ project: project(undefined), isFresh: fresh }), null);
  assert.equal(await planVoiceCleanExport({ project: project(0.5), isFresh: async () => false }), null);
  assert.equal(await planVoiceCleanExport({ project: { settings: { voiceClean: { amount: 1 } }, assets: [] }, isFresh: fresh }), null);
  const checked = [];
  const plan = await planVoiceCleanExport({ project: project(0.5), isFresh: async (source, cleaned) => { checked.push([source, cleaned]); return true; } });
  assert.deepEqual(plan, { amount: 0.5, sourcePath: '/r/take.mp4', cleanedPath: '/r/take.voice-clean.wav' });
  assert.deepEqual(checked, [['/r/take.mp4', '/r/take.voice-clean.wav']]);
});
