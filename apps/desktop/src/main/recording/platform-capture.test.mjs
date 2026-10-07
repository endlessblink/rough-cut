import assert from 'node:assert/strict';
import test from 'node:test';
import { audioInputArgs, cameraInputArgs, captureSupported, parseDisplayOffset, screenInputArgs } from './platform-capture.mjs';
import { getPrimaryWindowsDisplayInfo, listDshowCameraSources, listDshowMicSources, listDshowSystemAudioSources, parseDshowDevices } from './windows-devices.mjs';

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
  const system = await listDshowSystemAudioSources({ run });
  assert.deepEqual(system.map((d) => d.name), ['Stereo Mix (Realtek(R) Audio)']);
  assert.equal(system[0].monitor, true);
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
