import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFfmpegCaptureArgs,
  FFMPEG_SIGINT_TIMEOUT_MS,
  FFMPEG_SIGTERM_TIMEOUT_MS,
  FFMPEG_STOP_TIMEOUT_MS,
} from './ffmpeg-capture.mjs';

test('screen capture uses CRF-only H.264 without VBV/CBR constraints', () => {
  const args = buildFfmpegCaptureArgs({
    outputPath: '/tmp/capture.mp4',
    fps: 30,
    display: ':0+0,0',
    width: 1920,
    height: 1080,
  });

  assert.equal(args[args.indexOf('-c:v') + 1], 'libx264');
  assert.equal(args[args.indexOf('-preset') + 1], 'superfast');
  assert.equal(args.includes('-tune'), false);
  assert.equal(args[args.indexOf('-crf') + 1], '16');
  assert.equal(args[args.indexOf('-pix_fmt') + 1], 'yuv420p');
  assert.equal(args[args.indexOf('-x264-params') + 1], 'scenecut=0:sliced-threads=0');
  assert.equal(args.includes('-maxrate'), false);
  assert.equal(args.includes('-bufsize'), false);
  assert.equal(args.includes('-movflags'), false);
  assert.equal(args.join(' ').includes('nal-hrd=cbr'), false);
});

test('screen capture allows enough time for mp4 finalization on stop', () => {
  assert.equal(FFMPEG_STOP_TIMEOUT_MS >= 60_000, true);
  assert.equal(FFMPEG_SIGINT_TIMEOUT_MS >= 60_000, true);
  assert.equal(FFMPEG_SIGTERM_TIMEOUT_MS >= 15_000, true);
});
