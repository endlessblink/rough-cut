import { execFile } from 'node:child_process';
import { isUiohookAvailable } from './uiohook-button-listener.mjs';

// Mac (beta) device discovery via `ffmpeg -f avfoundation -list_devices true -i ""` (it prints to stderr and exits
// non-zero, which is expected). Mirrors the shape of the Linux pactl / v4l2 and the Windows dshow listings so the
// renderer and preflight need no Mac special cases. Devices are addressed by name; AVFoundation accepts names.

// macOS has no built-in "what you hear" input. A loopback driver (BlackHole, Loopback, Soundflower) shows up as an
// ordinary audio input, so those are offered as system audio and kept out of the microphone list.
const LOOPBACK_NAME = /blackhole|soundflower|loopback audio|^loopback|ishowu|zoomaudiodevice|aggregate/i;
const SCREEN_NAME = /^capture screen \d+$/i;

export function parseAvfoundationDevices(text) {
  const devices = { video: [], audio: [], screens: [] };
  if (typeof text !== 'string') return devices;
  let section = null;
  for (const line of text.split(/\r?\n/)) {
    if (/AVFoundation video devices/i.test(line)) { section = 'video'; continue; }
    if (/AVFoundation audio devices/i.test(line)) { section = 'audio'; continue; }
    const match = /\]\s*\[(\d+)\]\s+(.+?)\s*$/.exec(line);
    if (!match || !section) continue;
    const name = match[2];
    const device = { id: name, name, label: name, state: 'RUNNING', index: Number(match[1]) };
    if (section === 'video' && SCREEN_NAME.test(name)) devices.screens.push(device);
    else if (!devices[section].some((existing) => existing.name === name)) devices[section].push(device);
  }
  return devices;
}

function runAvfoundationList(run) {
  return new Promise((resolve) => {
    run(
      'ffmpeg',
      ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', ''],
      { timeout: 15_000 },
      (_error, stdout, stderr) => resolve(`${stderr ?? ''}\n${stdout ?? ''}`),
    );
  });
}

const strip = ({ index: _index, ...device }) => device;

export async function listAvfoundationCameraSources({ run = execFile } = {}) {
  return parseAvfoundationDevices(await runAvfoundationList(run)).video.map(strip);
}

export async function listAvfoundationMicSources({ run = execFile } = {}) {
  const { audio } = parseAvfoundationDevices(await runAvfoundationList(run));
  return audio.filter((device) => !LOOPBACK_NAME.test(device.name)).map(strip);
}

export async function listAvfoundationSystemAudioSources({ run = execFile } = {}) {
  const { audio } = parseAvfoundationDevices(await runAvfoundationList(run));
  return audio.filter((device) => LOOPBACK_NAME.test(device.name)).map((device) => ({ ...strip(device), monitor: true }));
}

/**
 * Mac analogue of getPrimaryX11DisplayInfo. AVFoundation records the primary display as "Capture screen 0" at its
 * native (Retina) pixel size, so sizes are logical bounds times the scale factor, like X11. `display` keeps the
 * `<base>+<x>,<y>` shape so region offsets work unchanged (the crop happens in screenOutputFilterArgs).
 * Cursor and click points stay logical (Electron and uiohook both report points on a Mac) and the session scales them.
 */
export function getPrimaryMacDisplayInfo(screen) {
  const primary = screen.getPrimaryDisplay();
  const scaleFactor = primary.scaleFactor || 1;
  const toPhysical = (bounds, factor) => ({
    x: Math.round(bounds.x * factor),
    y: Math.round(bounds.y * factor),
    width: Math.round(bounds.width * factor),
    height: Math.round(bounds.height * factor),
  });
  const { x, y, width, height } = toPhysical(primary.bounds, scaleFactor);
  return {
    display: `Capture screen 0${x >= 0 ? `+${x}` : x},${y}`,
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

// --- Privacy permissions. macOS asks once per app; a denied permission can only be changed in System Settings.

const SETTINGS_PANES = {
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  camera: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
};

export function macPrivacySettingsUrl(kind) {
  return SETTINGS_PANES[kind] ?? SETTINGS_PANES.screen;
}

/** 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown' for screen, microphone, camera and accessibility. */
export function readMacPermissions(systemPreferences, isUiohookAvailable = null) {
  const read = (kind) => {
    try {
      return systemPreferences?.getMediaAccessStatus?.(kind) ?? 'unknown';
    } catch {
      return 'unknown';
    }
  };
  const perms = { screen: read('screen'), microphone: read('microphone'), camera: read('camera') };

  // Accessibility permission: check if uiohook can load (no API available on Mac, so test it)
  if (typeof isUiohookAvailable === 'function') {
    try {
      perms.accessibility = isUiohookAvailable() ? 'granted' : 'not-determined';
    } catch {
      perms.accessibility = 'not-determined';
    }
  } else {
    perms.accessibility = 'unknown';
  }

  return perms;
}

/**
 * Tests whether desktopCapturer can actually capture screen thumbnails (real proof of permission).
 * Returns true only if at least one screen returns a non-empty thumbnail.
 */
export async function canCaptureScreenThumbnails({ desktopCapturer }) {
  try {
    const sources = await desktopCapturer?.getSources?.({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
    if (!Array.isArray(sources) || sources.length === 0) return false;
    // At least one source must have actual image data (not null or empty)
    return sources.some((source) => source.thumbnail && source.thumbnail.toDataURL?.().length > 50);
  } catch {
    return false;
  }
}

/**
 * Asks for what a recording needs before it starts. Microphone and camera show the system prompt; the screen has no
 * prompt API, so listing screens once registers the app under Screen Recording and macOS shows its own prompt.
 * Returns the statuses afterwards. On Mac, trusts actual thumbnail capture over the status API.
 */
export async function requestMacPermissions({ systemPreferences, desktopCapturer, needMic = false, needCamera = false }) {
  const before = readMacPermissions(systemPreferences, isUiohookAvailable);
  for (const [kind, needed] of [['microphone', needMic], ['camera', needCamera]]) {
    if (needed && before[kind] === 'not-determined') {
      try { await systemPreferences.askForMediaAccess(kind); } catch { /* reported by the status below */ }
    }
  }
  if (before.screen !== 'granted') {
    try { await desktopCapturer?.getSources?.({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } }); } catch { /* idem */ }
  }
  const after = readMacPermissions(systemPreferences, isUiohookAvailable);
  // On Mac, verify the status by testing if we can actually capture thumbnails; the status API can be unreliable
  if (after.screen === 'granted') {
    const canCapture = await canCaptureScreenThumbnails({ desktopCapturer });
    if (!canCapture) {
      // Status says granted but we can't actually capture; report as not-determined so the user can retry
      after.screen = 'not-determined';
    }
  }
  return after;
}

const PERMISSION_LABELS = { screen: 'Screen Recording', microphone: 'Microphone', camera: 'Camera', accessibility: 'Accessibility' };

/** Plain words for a missing permission, or null when it is fine (or cannot be read). */
export function macPermissionMessage(kind, status) {
  if (status === 'granted' || status === 'unknown') return null;
  const pane = PERMISSION_LABELS[kind] ?? kind;
  if (status === 'not-determined') {
    return kind === 'screen'
      ? 'macOS will ask to allow screen recording when you start. Allow it, then quit and reopen Rough Cut. You can also click "Open System Settings" below to allow it now.'
      : kind === 'accessibility'
      ? 'Rough Cut needs Accessibility permission to highlight clicks during recording. Open System Settings > Privacy & Security > Accessibility and turn Rough Cut on.'
      : `Rough Cut will ask for the ${pane.toLowerCase()} when you start recording.`;
  }
  if (kind === 'screen') {
    return `Rough Cut is not allowed to record the screen. Click "Open System Settings" below, enable "Rough Cut" under Screen Recording, then quit and reopen Rough Cut.`;
  }
  if (kind === 'accessibility') {
    return `Rough Cut is not allowed to highlight clicks. Open System Settings > Privacy & Security > Accessibility and turn Rough Cut on.`;
  }
  return `Rough Cut is not allowed to use the ${pane.toLowerCase()}. Open System Settings > Privacy & Security > ${pane} and turn Rough Cut on.`;
}
