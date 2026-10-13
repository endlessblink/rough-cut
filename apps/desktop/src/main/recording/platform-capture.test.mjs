import assert from 'node:assert/strict';
import test from 'node:test';
import { audioInputArgs, cameraInputArgs, captureSupported, parseDisplayOffset, screenInputArgs } from './platform-capture.mjs';
import { getPrimaryWindowsDisplayInfo, physicalExtent, parseDshowCameraModes, pickDshowCameraMode, setDshowCameraModesForTest, listDshowCameraSources, listDshowMicSources, listDshowSystemAudioSources, parseDshowDevices } from './windows-devices.mjs';

const DSHOW_OUTPUT = `[dshow @ 000001] "Integrated Camera" (video)
[dshow @ 000001]   Alternative name "@device_pnp_\\\\?\\usb#vid_04f2"
[dshow @ 000001] "OBS Virtual Camera" (video)
[dshow @ 000001] "Microphone (Realtek(R) Audio)" (audio)
[dshow @ 000001]   Alternative name "@device_cm_{33D9A762}"
[dshow @ 000001] "Stereo Mix (Realtek(R) Audio)" (audio)
`;

test('linux inputs keep the original x11grab / pulse / v4l2 args', () => {
  assert.deepEqual(screenInputArgs({ fps: 30, width: 1920, height: 1080, display: ':0.0+0,0', platform: 'linux' }), [
    '-f', 'x11grab', '-draw_mouse', '0', '-framerate', '30', '-video_size', '1920x1080', '-i', ':0.0+0,0',
  ]);
  assert.deepEqual(audioInputArgs('mic.monitor', { platform: 'linux' }), ['-f', 'pulse', '-ac', '2', '-ar', '48000', '-i', 'mic.monitor']);
  assert.deepEqual(cameraInputArgs({ fps: 30, width: 1280, height: 720, device: '/dev/video0', platform: 'linux' }), [
    '-f', 'v4l2', '-input_format', 'mjpeg', '-framerate', '30', '-video_size', '1280x720', '-i', '/dev/video0',
  ]);
});

test('windows inputs use gdigrab with offsets and dshow devices', () => {
  const screen = screenInputArgs({ fps: 60, width: 800, height: 600, display: 'desktop+100,-20', platform: 'win32' });
  assert.deepEqual(screen, [
    '-f', 'gdigrab', '-draw_mouse', '0', '-framerate', '60', '-offset_x', '100', '-offset_y', '-20', '-video_size', '800x600', '-i', 'desktop',
  ]);
  assert.deepEqual(audioInputArgs('Microphone (USB)', { platform: 'win32' }).slice(-2), ['-i', 'audio=Microphone (USB)']);
  assert.deepEqual(cameraInputArgs({ fps: 30, width: 1280, height: 720, device: 'Integrated Camera', platform: 'win32' }).slice(-2), ['-i', 'video=Integrated Camera']);
});

test('display offsets round-trip and capture support is platform-aware', () => {
  assert.deepEqual(parseDisplayOffset('desktop+1920,0'), { x: 1920, y: 0 });
  assert.deepEqual(parseDisplayOffset('desktop-1920,-40'), { x: -1920, y: -40 });
  assert.equal(captureSupported({ platform: 'win32', env: {} }), true);
  assert.equal(captureSupported({ platform: 'linux', env: { XDG_SESSION_TYPE: 'wayland' } }), false);
  assert.equal(captureSupported({ platform: 'darwin', env: {} }), false);
});

test('dshow listing separates cameras, mics and loopback audio', async () => {
  const devices = parseDshowDevices(DSHOW_OUTPUT);
  assert.deepEqual(devices.video.map((d) => d.name), ['Integrated Camera', 'OBS Virtual Camera']);
  const run = (_cmd, _args, _opts, cb) => cb(new Error('exit 1'), '', DSHOW_OUTPUT);
  assert.deepEqual((await listDshowCameraSources({ run })).map((d) => d.name), ['Integrated Camera', 'OBS Virtual Camera']);
  assert.deepEqual((await listDshowMicSources({ run })).map((d) => d.name), ['Microphone (Realtek(R) Audio)']);
  const system = await listDshowSystemAudioSources({ run, loopbackAvailable: () => false });
  assert.deepEqual(system.map((d) => d.name), ['Stereo Mix (Realtek(R) Audio)']);
  assert.equal(system[0].monitor, true);
});

test('real WASAPI loopback is offered first when the native module is available, with no Stereo Mix needed', async () => {
  const noDevices = (_cmd, _args, _opts, cb) => cb(new Error('exit 1'), '', '');
  const system = await listDshowSystemAudioSources({ run: noDevices, loopbackAvailable: () => true });
  assert.deepEqual(system.map((d) => d.id), ['wasapi-loopback']);
  assert.equal(system[0].monitor, true);
  const run = (_cmd, _args, _opts, cb) => cb(new Error('exit 1'), '', DSHOW_OUTPUT);
  const both = await listDshowSystemAudioSources({ run, loopbackAvailable: () => true });
  assert.deepEqual(both.map((d) => d.id), ['wasapi-loopback', 'Stereo Mix (Realtek(R) Audio)']);
});

test('on Windows a tcp:// system-audio source is read as raw s16le, never as a dshow device', () => {
  assert.deepEqual(audioInputArgs('tcp://127.0.0.1:5555', { platform: 'win32' }), ['-f', 's16le', '-ar', '48000', '-ac', '2', '-i', 'tcp://127.0.0.1:5555']);
  assert.equal(audioInputArgs('tcp://127.0.0.1:5555', { platform: 'win32' }).includes('-use_wallclock_as_timestamps'), false);
  assert.deepEqual(audioInputArgs('Microphone (USB)', { platform: 'win32' }), ['-f', 'dshow', '-ac', '2', '-ar', '48000', '-i', 'audio=Microphone (USB)']);
});

test('windows display info is in physical pixels with an offset-shaped display string', () => {
  const screen = {
    getPrimaryDisplay: () => ({ bounds: { x: 0, y: 0, width: 1280, height: 720 }, scaleFactor: 1.5 }),
    getAllDisplays: () => [{ bounds: { x: 0, y: 0, width: 1280, height: 720 }, scaleFactor: 1.5 }],
  };
  const info = getPrimaryWindowsDisplayInfo(screen);
  assert.equal(info.display, 'desktop+0,0');
  assert.equal(info.width, 1920);
  assert.equal(info.height, 1080);
});

// Real `ffmpeg -list_options` output from the USB webcam this port was developed against: 30 fps only at 720p.
const WEBCAM_OPTIONS = [
  '[in#0 @ 0000015007910d00] DirectShow video device options (from video devices)',
  '[in#0 @ 0000015007910d00]   vcodec=mjpeg  min s=1280x720 fps=30 max s=1280x720 fps=30',
  '[in#0 @ 0000015007910d00]   vcodec=mjpeg  min s=640x480 fps=30 max s=640x480 fps=30',
  '[in#0 @ 0000015007910d00]   pixel_format=yuyv422  min s=1280x720 fps=10 max s=1280x720 fps=10',
  '[in#0 @ 0000015007910d00]   pixel_format=yuyv422  min s=640x480 fps=30 max s=640x480 fps=30',
].join('\n');

test('camera modes are parsed from list_options output', () => {
  const modes = parseDshowCameraModes(WEBCAM_OPTIONS);
  assert.deepEqual(modes[0], { kind: 'codec', format: 'mjpeg', width: 1280, height: 720, fps: 30 });
  assert.equal(modes.length, 4);
  assert.deepEqual(parseDshowCameraModes('nothing useful'), []);
});

test('the picker prefers MJPEG at the wanted size and opens at a rate the camera really has', () => {
  const modes = parseDshowCameraModes(WEBCAM_OPTIONS);
  // The preview asks for 15 fps; this camera has no 15 fps mode, so it is opened at 30 and lowered by a filter.
  assert.deepEqual(pickDshowCameraMode(modes, { width: 1280, height: 720, fps: 15 }), { kind: 'codec', format: 'mjpeg', width: 1280, height: 720, fps: 30 });
  // A size it lacks falls to the closest one that is not smaller.
  assert.equal(pickDshowCameraMode(modes, { width: 800, height: 600, fps: 30 }).width, 1280);
  assert.equal(pickDshowCameraMode([], { width: 1280, height: 720, fps: 30 }), null);
});

test('a probed camera is opened in its advertised mode; an unprobed one keeps the requested values', () => {
  setDshowCameraModesForTest('Test Cam', parseDshowCameraModes(WEBCAM_OPTIONS));
  try {
    assert.deepEqual(cameraInputArgs({ fps: 15, width: 1280, height: 720, device: 'Test Cam', platform: 'win32' }), [
      '-f', 'dshow', '-vcodec', 'mjpeg', '-framerate', '30', '-video_size', '1280x720', '-i', 'video=Test Cam',
    ]);
  } finally {
    setDshowCameraModesForTest('Test Cam', null);
  }
  assert.deepEqual(cameraInputArgs({ fps: 15, width: 1280, height: 720, device: 'Test Cam', platform: 'win32' }), [
    '-f', 'dshow', '-framerate', '15', '-video_size', '1280x720', '-i', 'video=Test Cam',
  ]);
});

test('fractional display scaling never asks the grabber for a pixel past the screen edge', () => {
  // The display this was found on: 2560x1440 physical at 150%, which Electron reports as 1707x960.
  assert.equal(physicalExtent(1707, 1.5), 2560);
  assert.equal(physicalExtent(960, 1.5), 1440);
  // Exact scales are unchanged, and results are always even.
  assert.equal(physicalExtent(1536, 1.25), 1920);
  assert.equal(physicalExtent(864, 1.25), 1080);
  assert.equal(physicalExtent(1920, 1), 1920);
  assert.equal(physicalExtent(1093, 1.25) % 2, 0);
  const screen = {
    getPrimaryDisplay: () => ({ bounds: { x: 0, y: 0, width: 1707, height: 960 }, scaleFactor: 1.5 }),
    getAllDisplays: () => [{ bounds: { x: 0, y: 0, width: 1707, height: 960 }, scaleFactor: 1.5 }],
  };
  const info = getPrimaryWindowsDisplayInfo(screen);
  assert.deepEqual([info.width, info.height], [2560, 1440]);
  assert.deepEqual(info.displayBounds, [{ x: 0, y: 0, width: 2560, height: 1440 }]);
});
