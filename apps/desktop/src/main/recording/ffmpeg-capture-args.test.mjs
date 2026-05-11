import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFfmpegCaptureArgs,
  buildFfmpegCameraCaptureArgs,
  buildFfmpegCameraPreviewArgs,
  buildFfmpegUnifiedCaptureArgs,
  createMjpegFrameParser,
  FFMPEG_SIGINT_TIMEOUT_MS,
  FFMPEG_SIGTERM_TIMEOUT_MS,
  FFMPEG_STOP_TIMEOUT_MS,
  FFMPEG_CAMERA_SIGINT_TIMEOUT_MS,
  FFMPEG_CAMERA_SIGTERM_TIMEOUT_MS,
  FFMPEG_CAMERA_STOP_TIMEOUT_MS,
} from './ffmpeg-capture.mjs';

function indexesOf(args, value) {
  const indexes = [];
  args.forEach((item, index) => {
    if (item === value) indexes.push(index);
  });
  return indexes;
}

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

test('camera preview uses main-process v4l2 ffmpeg and emits mjpeg frames', () => {
  const args = buildFfmpegCameraPreviewArgs({
    devicePath: '/dev/video2',
    fps: 15,
    width: 1280,
    height: 720,
    previewWidth: 320,
  });

  const inputIndex = args.indexOf('-i');
  assert.equal(args[inputIndex + 1], '/dev/video2');
  assert.equal(args[args.indexOf('-f') + 1], 'v4l2');
  assert.equal(args[args.indexOf('-input_format') + 1], 'mjpeg');
  assert.equal(args[args.indexOf('-video_size') + 1], '1280x720');
  assert.equal(args[args.indexOf('-vf') + 1], 'fps=15,scale=320:-1');
  assert.equal(args.at(-2), 'mjpeg');
  assert.equal(args.at(-1), 'pipe:1');
});

test('mjpeg frame parser extracts split jpeg frames and discards junk', () => {
  const frames = [];
  const parser = createMjpegFrameParser((frame) => frames.push(frame));
  const frameA = Buffer.from([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9]);
  const frameB = Buffer.from([0xff, 0xd8, 0x03, 0xff, 0xd9]);

  parser.observe(Buffer.concat([Buffer.from([0x00, 0x11]), frameA.subarray(0, 3)]));
  parser.observe(Buffer.concat([frameA.subarray(3), frameB]));

  assert.equal(frames.length, 2);
  assert.deepEqual(frames[0], frameA);
  assert.deepEqual(frames[1], frameB);
});

test('unified capture maps screen and camera as separate video streams', () => {
  const args = buildFfmpegUnifiedCaptureArgs({
    outputPath: '/tmp/unified.mkv',
    fps: 30,
    display: ':0+0,0',
    width: 1920,
    height: 1080,
    cameraDevicePath: '/dev/video2',
    cameraWidth: 1280,
    cameraHeight: 720,
  });

  const inputIndexes = indexesOf(args, '-i');
  assert.equal(inputIndexes.length, 2);
  assert.equal(args[inputIndexes[0] + 1], ':0+0,0');
  assert.equal(args[inputIndexes[1] + 1], '/dev/video2');
  assert.ok(args.indexOf('-draw_mouse') < inputIndexes[0]);
  assert.ok(args.indexOf('-input_format') < inputIndexes[1]);
  assert.deepEqual(args.slice(args.indexOf('-map'), args.indexOf('-map') + 4), ['-map', '0:v', '-map', '1:v']);
  assert.equal(args[args.indexOf('-c:v:0') + 1], 'libx264');
  assert.equal(args[args.indexOf('-crf:v:0') + 1], '16');
  assert.equal(args[args.indexOf('-c:v:1') + 1], 'libx264');
  assert.equal(args[args.indexOf('-crf:v:1') + 1], '18');
  assert.equal(args.at(-2), 'matroska');
  assert.equal(args.at(-1), '/tmp/unified.mkv');
});

test('unified capture keeps camera audio disabled while preserving mic and system mix', () => {
  const args = buildFfmpegUnifiedCaptureArgs({
    outputPath: '/tmp/unified.mkv',
    fps: 30,
    display: ':0+0,0',
    width: 1920,
    height: 1080,
    cameraDevicePath: '/dev/video2',
    micSource: 'alsa_input.usb-Samson_Technologies_Samson_Q2U_Microphone-00.analog-stereo',
    systemAudioSource: 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor',
    systemAudioGainPercent: 50,
  });

  assert.equal(args.includes('1:a'), false);
  assert.equal(args.includes('[2:a]volume=0.50[sysa];[sysa][3:a]amix=inputs=2[a]'), true);
  const mapIndex = args.indexOf('-map');
  assert.deepEqual(args.slice(mapIndex, mapIndex + 6), ['-map', '0:v', '-map', '1:v', '-map', '[a]']);
  assert.equal(args[args.indexOf('-c:a') + 1], 'aac');
});

test('camera capture sets v4l2 reliability flags so shutdown does not wedge in D-state', () => {
  const args = buildFfmpegCameraCaptureArgs({
    outputPath: '/tmp/camera.mkv',
    fps: 30,
    devicePath: '/dev/video0',
  });
  assert.equal(args[args.indexOf('-use_wallclock_as_timestamps') + 1], '1');
  assert.equal(args[args.indexOf('-fflags') + 1], 'nobuffer');
  assert.equal(args[args.indexOf('-thread_queue_size') + 1], '1024');
  // rw_timeout was attempted but ffmpeg 6.1's v4l2 demuxer rejects it
  // ("Option rw_timeout not found"). Guard against accidentally re-adding.
  assert.equal(args.includes('-rw_timeout'), false);
  // Force MJPEG. Without this, UVC webcams negotiate YUYV (uncompressed)
  // which caps at 10 fps for 1280x720 on common consumer hardware,
  // producing a stuttering camera in playback regardless of -framerate.
  assert.equal(args[args.indexOf('-input_format') + 1], 'mjpeg');
  // Reliability flags must precede the input so they bind to the input
  // stream; ffmpeg ignores input-side options that come after `-i`.
  assert.ok(args.indexOf('-thread_queue_size') < args.indexOf('-i'));
  assert.ok(args.indexOf('-fflags') < args.indexOf('-i'));
  assert.ok(args.indexOf('-input_format') < args.indexOf('-i'));
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

test('camera capture stop cascade is short so v4l2-stuck ffmpeg falls back fast', () => {
  // Camera ffmpeg can wedge in an uninterruptible v4l2 read where only
  // SIGKILL gets through. Long timeouts there are pure dead time that
  // freezes the post-stop UI. Cap the cascade well under the screen
  // path's 60s/60s/15s. Also keep camera <= screen so a future
  // accidental bump on the screen side doesn't silently relax these.
  assert.ok(FFMPEG_CAMERA_STOP_TIMEOUT_MS <= 10_000);
  assert.ok(FFMPEG_CAMERA_SIGINT_TIMEOUT_MS <= 10_000);
  assert.ok(FFMPEG_CAMERA_SIGTERM_TIMEOUT_MS <= 5_000);
  assert.ok(FFMPEG_CAMERA_STOP_TIMEOUT_MS <= FFMPEG_STOP_TIMEOUT_MS);
  assert.ok(FFMPEG_CAMERA_SIGINT_TIMEOUT_MS <= FFMPEG_SIGINT_TIMEOUT_MS);
  assert.ok(FFMPEG_CAMERA_SIGTERM_TIMEOUT_MS <= FFMPEG_SIGTERM_TIMEOUT_MS);
});
