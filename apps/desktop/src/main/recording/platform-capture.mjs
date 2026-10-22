import { getDshowCameraMode } from './windows-devices.mjs';
// Per-platform FFmpeg input arguments. Linux output is byte-identical to the
// args that used to be inlined in ffmpeg-capture.mjs (guarded by
// ffmpeg-capture-args.test.mjs); the win32 branches are the Windows port and the
// darwin branches the Mac beta (AVFoundation, see mac-devices.mjs).

export function isWindows(platform = process.platform) {
  return platform === 'win32';
}

export function isMac(platform = process.platform) {
  return platform === 'darwin';
}

export function captureSupported({ platform = process.platform, env = process.env } = {}) {
  if (platform === 'win32' || platform === 'darwin') return true;
  return (
    platform === 'linux' &&
    (env.XDG_SESSION_TYPE === 'x11' || (env.DISPLAY !== undefined && env.DISPLAY !== ''))
  );
}

/**
 * Windows display strings reuse the X11 shape `<base>+<x>,<y>` so the
 * region/offset handling in recording-session stays shared.
 */
export function parseDisplayOffset(display) {
  const match = /^(.*?)([+-]\d+),(-?\d+)$/.exec(String(display ?? ''));
  if (!match) return { x: 0, y: 0 };
  return { x: Number(match[2]), y: Number(match[3]) };
}

/** The device part of a `<base>+<x>,<y>` display string ("Capture screen 0" on a Mac). */
export function displayBase(display) {
  return String(display ?? '').replace(/[+-]\d+,-?\d+$/, '');
}

export function screenInputArgs({ fps, width, height, display, platform = process.platform }) {
  if (platform === 'darwin') {
    // AVFoundation always delivers the whole screen at its native (Retina) pixel size; a region is cut out
    // afterwards by screenOutputFilterArgs. The cursor is drawn by the editor, never baked in.
    return [
      '-f',
      'avfoundation',
      '-capture_cursor',
      '0',
      '-capture_mouse_clicks',
      '0',
      '-pixel_format',
      'uyvy422',
      '-framerate',
      String(fps),
      '-i',
      `${displayBase(display) || 'Capture screen 0'}:none`,
    ];
  }
  if (platform === 'win32') {
    const { x, y } = parseDisplayOffset(display);
    return [
      '-f',
      'gdigrab',
      '-draw_mouse',
      '0',
      '-framerate',
      String(fps),
      '-offset_x',
      String(x),
      '-offset_y',
      String(y),
      '-video_size',
      `${width}x${height}`,
      '-i',
      'desktop',
    ];
  }
  return [
    '-f',
    'x11grab',
    '-draw_mouse',
    '0',
    '-framerate',
    String(fps),
    '-video_size',
    `${width}x${height}`,
    '-i',
    display,
  ];
}

/**
 * Output-side video filter for the screen stream. Only the Mac needs one: AVFoundation cannot capture a region,
 * so the region (same physical-pixel numbers the other platforms hand to their grabbers) is cropped here. The
 * size is clamped to the frame so a full-screen capture whose rounding differs by a pixel never fails.
 */
export function screenOutputFilterArgs({ width, height, display, platform = process.platform }) {
  if (platform !== 'darwin') return [];
  const { x, y } = parseDisplayOffset(display);
  const w = Math.max(2, Math.round(Number(width) || 0));
  const h = Math.max(2, Math.round(Number(height) || 0));
  const even = (value) => `trunc(${value}/2)*2`;
  return ['-vf', `crop=w=${even(`min(iw-${Math.max(0, x)}\\,${w})`)}:h=${even(`min(ih-${Math.max(0, y)}\\,${h})`)}:x=${Math.max(0, x)}:y=${Math.max(0, y)}`];
}

export function audioInputArgs(source, { platform = process.platform } = {}) {
  if (platform === 'darwin') {
    // ":<name>" selects an audio-only AVFoundation device. The output side resamples to 48 kHz stereo.
    return ['-f', 'avfoundation', '-i', `:${source}`];
  }
  if (platform === 'win32') {
    // System audio arrives from the local loopback feed (see system-audio-loopback.mjs) as raw s16le over TCP.
    // The feed already paces itself against the wall clock. Do not add -use_wallclock_as_timestamps here: measured
    // with ffmpeg 9 it makes the raw demuxer deliver nothing, while the plain input is read normally.
    if (typeof source === 'string' && source.startsWith('tcp://')) {
      return ['-f', 's16le', '-ar', '48000', '-ac', '2', '-i', source];
    }
    return ['-f', 'dshow', '-ac', '2', '-ar', '48000', '-i', `audio=${source}`];
  }
  return ['-f', 'pulse', '-ac', '2', '-ar', '48000', '-i', source];
}

export function cameraInputArgs({ fps, width, height, device, platform = process.platform }) {
  if (platform === 'darwin') {
    // AVFoundation opens a camera only at a size and rate inside one of its advertised ranges; 1280x720 at
    // up to 30 fps is offered by every built-in FaceTime camera. uyvy422 is the format they all list.
    return [
      '-f',
      'avfoundation',
      '-pixel_format',
      'uyvy422',
      '-framerate',
      String(Math.min(30, Number(fps) || 30)),
      '-video_size',
      `${width}x${height}`,
      '-i',
      `${device}:none`,
    ];
  }
  if (platform === 'win32') {
    // Open the camera in a mode it really advertises (see windows-devices.mjs). Requesting a rate or size it does not
    // offer fails with "I/O error"; the preview and capture filters lower the rate afterwards. An unprobed camera
    // falls back to the requested values.
    const mode = getDshowCameraMode(device, { width, height, fps });
    if (mode) {
      return [
        '-f',
        'dshow',
        ...(mode.kind === 'codec' ? ['-vcodec', mode.format] : ['-pixel_format', mode.format]),
        '-framerate',
        String(mode.fps),
        '-video_size',
        `${mode.width}x${mode.height}`,
        '-i',
        `video=${device}`,
      ];
    }
    return [
      '-f',
      'dshow',
      '-framerate',
      String(fps),
      '-video_size',
      `${width}x${height}`,
      '-i',
      `video=${device}`,
    ];
  }
  return [
    '-f',
    'v4l2',
    '-input_format',
    'mjpeg',
    '-framerate',
    String(fps),
    '-video_size',
    `${width}x${height}`,
    '-i',
    device,
  ];
}
