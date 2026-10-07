import { execFile } from 'node:child_process';

// Windows DirectShow device discovery via
// `ffmpeg -list_devices true -f dshow -i dummy` (it prints to stderr and exits
// non-zero, which is expected). Mirrors the shape of the Linux pactl / v4l2
// listings so the renderer and preflight need no Windows special cases.

const LOOPBACK_NAME = /stereo mix|virtual-audio-capturer|what u hear|loopback|wave out mix/i;

export function parseDshowDevices(text) {
  const devices = { video: [], audio: [] };
  if (typeof text !== 'string') return devices;
  for (const line of text.split(/\r?\n/)) {
    if (/Alternative name/i.test(line)) continue;
    const match = /"([^"]+)"\s+\((video|audio)(?:,[^)]*)?\)/.exec(line);
    if (!match) continue;
    const [, name, kind] = match;
    if (!devices[kind].some((device) => device.name === name)) {
      devices[kind].push({ id: name, name, label: name, state: 'RUNNING' });
    }
  }
  return devices;
}

function runDshowList(run) {
  return new Promise((resolve) => {
    run(
      'ffmpeg',
      ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'],
      { windowsHide: true },
      (_error, stdout, stderr) => resolve(`${stderr ?? ''}\n${stdout ?? ''}`),
    );
  });
}

export async function listDshowCameraSources({ run = execFile } = {}) {
  return parseDshowDevices(await runDshowList(run)).video;
}

export async function listDshowMicSources({ run = execFile } = {}) {
  const { audio } = parseDshowDevices(await runDshowList(run));
  return audio.filter((device) => !LOOPBACK_NAME.test(device.name));
}

export async function listDshowSystemAudioSources({ run = execFile } = {}) {
  const { audio } = parseDshowDevices(await runDshowList(run));
  return audio
    .filter((device) => LOOPBACK_NAME.test(device.name))
    .map((device) => ({ ...device, monitor: true }));
}

/**
 * Windows analogue of getPrimaryX11DisplayInfo. `display` keeps the
 * `<base>+<x>,<y>` shape so region capture offsets work unchanged.
 */
export function getPrimaryWindowsDisplayInfo(screen) {
  const primary = screen.getPrimaryDisplay();
  const toPhysical = (bounds, scaleFactor) => ({
    x: Math.round(bounds.x * scaleFactor),
    y: Math.round(bounds.y * scaleFactor),
    width: Math.round(bounds.width * scaleFactor),
    height: Math.round(bounds.height * scaleFactor),
  });
  const scaleFactor = primary.scaleFactor || 1;
  const { x, y, width, height } = toPhysical(primary.bounds, scaleFactor);
  return {
    display: `desktop${x >= 0 ? `+${x}` : x},${y}`,
    originX: x,
    originY: y,
    scaleFactor,
    width,
    height,
    displayBounds:
      typeof screen.getAllDisplays === 'function'
        ? screen.getAllDisplays().map((display) => toPhysical(display.bounds, display.scaleFactor || 1))
        : [{ x, y, width, height }],
  };
}
