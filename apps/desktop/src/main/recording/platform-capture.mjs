// Per-platform FFmpeg input arguments. Linux output is byte-identical to the
// args that used to be inlined in ffmpeg-capture.mjs (guarded by
// ffmpeg-capture-args.test.mjs); the win32 branches are the Windows port.

export function isWindows(platform = process.platform) {
  return platform === 'win32';
}

export function captureSupported({ platform = process.platform, env = process.env } = {}) {
  if (platform === 'win32') return true;
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

export function screenInputArgs({ fps, width, height, display, platform = process.platform }) {
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

export function audioInputArgs(source, { platform = process.platform } = {}) {
  if (platform === 'win32') {
    return ['-f', 'dshow', '-ac', '2', '-ar', '48000', '-i', `audio=${source}`];
  }
  return ['-f', 'pulse', '-ac', '2', '-ar', '48000', '-i', source];
}

export function cameraInputArgs({ fps, width, height, device, platform = process.platform }) {
  if (platform === 'win32') {
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
