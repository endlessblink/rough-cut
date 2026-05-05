import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFfmpegCaptureArgs,
  buildFfmpegCameraCaptureArgs,
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

test('camera capture uses v4l2 input and writes silent h264 video', () => {
  const args = buildFfmpegCameraCaptureArgs({
    outputPath: '/tmp/camera.mkv',
    fps: 30,
    devicePath: '/dev/video2',
    width: 1280,
    height: 720,
  });

  assert.deepEqual(args.slice(args.indexOf('-f'), args.indexOf('-f') + 2), ['-f', 'v4l2']);
  assert.equal(args[args.indexOf('-i') + 1], '/dev/video2');
  assert.equal(args[args.indexOf('-video_size') + 1], '1280x720');
  assert.equal(args.includes('-an'), true);
  assert.equal(args[args.indexOf('-c:v') + 1], 'libx264');
  assert.equal(args.at(-1), '/tmp/camera.mkv');
});

test('screen capture maps microphone audio when a mic source is selected', () => {
  const args = buildFfmpegCaptureArgs({
    outputPath: '/tmp/capture.mkv',
    fps: 30,
    display: ':0+0,0',
    width: 1920,
    height: 1080,
    micSource: 'alsa_input.usb-Samson_Technologies_Samson_Q2U_Microphone-00.analog-stereo',
  });

  assert.equal(args.includes('-f'), true);
  assert.equal(args.includes('pulse'), true);
  assert.equal(args.includes('alsa_input.usb-Samson_Technologies_Samson_Q2U_Microphone-00.analog-stereo'), true);
  assert.deepEqual(args.slice(args.indexOf('-map'), args.indexOf('-map') + 4), ['-map', '0:v', '-map', '1:a']);
  assert.equal(args[args.indexOf('-c:a') + 1], 'aac');
  assert.equal(args[args.indexOf('-b:a') + 1], '192k');
});

test('screen capture maps system audio monitor when selected', () => {
  const args = buildFfmpegCaptureArgs({
    outputPath: '/tmp/capture.mkv',
    fps: 30,
    display: ':0+0,0',
    width: 1920,
    height: 1080,
    systemAudioSource: 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor',
  });

  assert.equal(args.includes('alsa_output.pci-0000_00_1f.3.analog-stereo.monitor'), true);
  assert.deepEqual(args.slice(args.indexOf('-map'), args.indexOf('-map') + 4), ['-map', '0:v', '-map', '1:a']);
  assert.equal(args[args.indexOf('-c:a') + 1], 'aac');
});

test('screen capture mixes system audio and microphone when both are selected', () => {
  const args = buildFfmpegCaptureArgs({
    outputPath: '/tmp/capture.mkv',
    fps: 30,
    display: ':0+0,0',
    width: 1920,
    height: 1080,
    micSource: 'alsa_input.usb-Samson_Technologies_Samson_Q2U_Microphone-00.analog-stereo',
    systemAudioSource: 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor',
  });

  assert.equal(args.includes('[1:a][2:a]amix=inputs=2[a]'), true);
  assert.deepEqual(args.slice(args.indexOf('-map'), args.indexOf('-map') + 4), ['-map', '0:v', '-map', '[a]']);
  assert.equal(args[args.indexOf('-c:a') + 1], 'aac');
});

test('screen capture allows enough time for mp4 finalization on stop', () => {
  assert.equal(FFMPEG_STOP_TIMEOUT_MS >= 60_000, true);
  assert.equal(FFMPEG_SIGINT_TIMEOUT_MS >= 60_000, true);
  assert.equal(FFMPEG_SIGTERM_TIMEOUT_MS >= 15_000, true);
});
