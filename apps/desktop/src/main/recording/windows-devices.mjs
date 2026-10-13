import { execFile } from 'node:child_process';
import { LOOPBACK_SOURCE_ID, isLoopbackAvailable } from './system-audio-loopback.mjs';

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
  const cameras = parseDshowDevices(await runDshowList(run)).video;
  // Learn what each camera really offers, so opening it later never asks for a mode it does not have.
  await Promise.all(cameras.map((camera) => probeDshowCameraModes(camera.name, { run })));
  return cameras;
}

// --- Camera modes. DirectShow only opens a camera in a mode it advertises: asking for 15 fps from a camera that
// offers 30 fps at 1280x720 fails with "I/O error". MJPEG is preferred, as on Linux: raw YUYV caps at very low
// frame rates at 720p on typical UVC webcams (10 fps on the camera this was developed against).

const cameraModeCache = new Map();

/** Parses `ffmpeg -list_options true -f dshow -i video=NAME` output into modes. */
export function parseDshowCameraModes(text) {
  const modes = [];
  const pattern = /(vcodec|pixel_format)=(\S+)\s+min s=(\d+)x(\d+) fps=([\d.]+) max s=(\d+)x(\d+) fps=([\d.]+)/;
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const match = pattern.exec(line);
    if (!match) continue;
    const [, kind, format, minW, minH, minFps, maxW, maxH, maxFps] = match;
    const base = { kind: kind === 'vcodec' ? 'codec' : 'raw', format };
    modes.push({ ...base, width: Number(minW), height: Number(minH), fps: Number(minFps) });
    if (minW !== maxW || minH !== maxH) modes.push({ ...base, width: Number(maxW), height: Number(maxH), fps: Number(maxFps) });
  }
  return modes;
}

/**
 * Best advertised mode for a wanted size and rate: MJPEG first, then the exact size, then the closest size not
 * smaller than wanted, then the largest. The camera is opened at the mode's own rate; callers lower it afterwards.
 */
export function pickDshowCameraMode(modes, { width, height, fps }) {
  if (!Array.isArray(modes) || modes.length === 0) return null;
  const rank = (mode) => {
    const codecScore = mode.kind === 'codec' && mode.format === 'mjpeg' ? 0 : 1;
    const exact = mode.width === width && mode.height === height;
    const area = mode.width * mode.height;
    const wanted = width * height;
    const sizeScore = exact ? 0 : area >= wanted ? 1 + (area - wanted) / wanted : 100 + (wanted - area) / wanted;
    const fpsScore = Math.abs(mode.fps - fps) / 1000;
    return [codecScore, sizeScore, fpsScore];
  };
  return [...modes].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i += 1) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return 0;
  })[0];
}

export async function probeDshowCameraModes(deviceName, { run = execFile } = {}) {
  const text = await new Promise((resolve) => {
    run(
      'ffmpeg',
      ['-hide_banner', '-list_options', 'true', '-f', 'dshow', '-i', `video=${deviceName}`],
      { windowsHide: true, timeout: 10000 },
      (_error, stdout, stderr) => resolve(`${stderr ?? ''}\n${stdout ?? ''}`),
    );
  });
  const modes = parseDshowCameraModes(text);
  if (modes.length > 0) cameraModeCache.set(deviceName, modes);
  return modes;
}

/** The mode to open `deviceName` with, from what probing learned; null if the camera was never probed. */
export function getDshowCameraMode(deviceName, wanted) {
  return pickDshowCameraMode(cameraModeCache.get(deviceName), wanted);
}

export function setDshowCameraModesForTest(deviceName, modes) {
  if (modes) cameraModeCache.set(deviceName, modes);
  else cameraModeCache.delete(deviceName);
}

export async function listDshowMicSources({ run = execFile } = {}) {
  const { audio } = parseDshowDevices(await runDshowList(run));
  return audio.filter((device) => !LOOPBACK_NAME.test(device.name));
}

// "What you hear" first: real WASAPI loopback through the feed in system-audio-loopback.mjs. Stereo Mix style
// DirectShow devices stay listed after it for machines whose drivers provide one.
export async function listDshowSystemAudioSources({ run = execFile, loopbackAvailable = isLoopbackAvailable } = {}) {
  const { audio } = parseDshowDevices(await runDshowList(run));
  const dshow = audio
    .filter((device) => LOOPBACK_NAME.test(device.name))
    .map((device) => ({ ...device, monitor: true }));
  if (!loopbackAvailable()) return dshow;
  return [
    { id: LOOPBACK_SOURCE_ID, name: LOOPBACK_SOURCE_ID, label: 'System audio (everything you hear)', state: 'RUNNING', monitor: true },
    ...dshow,
  ];
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
