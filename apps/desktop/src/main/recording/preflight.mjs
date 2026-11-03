import { statfs } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { isXinputAvailable } from './xinput-button-listener.mjs';
import { isXdotoolAvailable } from './xdotool-cursor.mjs';
import { isUiohookAvailable } from './uiohook-button-listener.mjs';
import { buildInstallHint, readDistroFamily } from './missing-tools-hint.mjs';
import { macPermissionMessage } from './mac-devices.mjs';

const MIN_FREE_BYTES_30_MIN = 8 * 1024 * 1024 * 1024;
const MIN_FREE_BYTES_60_MIN = 16 * 1024 * 1024 * 1024;

export async function getRecordingPreflightStatus({ recordingsDir, displayInfo, micSources = [], systemAudioSources = [], cameraSources = [], options = {}, platform = process.platform, isInputHookAvailable = isUiohookAvailable, macPermissions = null } = {}) {
  const disk = await readDiskStatus(recordingsDir);
  const display = displayInfo ?? {};
  const selectedMic = options.recordMic ? findSource(micSources, options.micSource) : null;
  const selectedSystemAudio = options.recordSystemAudio ? findSource(systemAudioSources, options.systemAudioSource) : null;
  const selectedCamera = options.recordCamera ? findSource(cameraSources, options.cameraDevicePath) : null;
  const captureRegion = options.captureRegion && Number.isFinite(options.captureRegion.width) && Number.isFinite(options.captureRegion.height) ? options.captureRegion : null;
  const captureWidth = captureRegion?.width ?? display.width ?? 0;
  const captureHeight = captureRegion?.height ?? display.height ?? 0;
  const ffmpegAvailable = commandAvailable('ffmpeg');
  const ffprobeAvailable = commandAvailable('ffprobe');
  const onWindows = platform === 'win32';
  const onMac = platform === 'darwin';
  // Windows and the Mac take the cursor from Electron and clicks from the native hook; Linux uses xdotool/xinput.
  const usesInputHook = onWindows || onMac;
  const xdotoolAvailable = usesInputHook || isXdotoolAvailable();
  const xinputAvailable = usesInputHook ? isInputHookAvailable() : isXinputAvailable();
  const hookName = onMac ? 'Mac input hook' : 'Windows input hook';

  const checks = [
    createCheck('session', sessionLabel(platform), sessionSeverity(platform), sessionDetail(platform)),
    createCheck('capture', options.captureMode === 'region' ? 'Region capture' : 'Full display', captureWidth > 0 && captureHeight > 0 ? 'ok' : 'warn', `${captureWidth || 'unknown'} x ${captureHeight || 'unknown'} at 30 FPS`),
    createCheck('destination', 'Save destination', disk.severity, disk.detail),
    createCheck('ffmpeg', 'FFmpeg', ffmpegAvailable ? 'ok' : 'critical', ffmpegAvailable ? 'Available' : 'Missing; recording/export cannot start safely'),
    createCheck('ffprobe', 'FFprobe', ffprobeAvailable ? 'ok' : 'critical', ffprobeAvailable ? 'Available' : 'Missing; saved media cannot be verified'),
    createCheck('xdotool', 'Cursor position', xdotoolAvailable ? 'ok' : 'warn', usesInputHook ? `${onMac ? 'Mac' : 'Windows'} cursor polling` : xdotoolAvailable ? 'xdotool available' : 'xdotool missing; cursor tracking may be unreliable'),
    createCheck('xinput', 'Click telemetry', xinputAvailable ? 'ok' : 'warn', usesInputHook ? (xinputAvailable ? `${hookName} available${onMac ? ' (clicks need Accessibility permission)' : ''}` : `${hookName} unavailable; auto-zoom uses the cursor-jump heuristic`) : xinputAvailable ? 'xinput available' : 'xinput missing; click telemetry may be skipped'),
    optionalSourceCheck('mic', 'Microphone', options.recordMic, selectedMic, micSources.length),
    optionalSourceCheck('system-audio', 'System audio', options.recordSystemAudio, selectedSystemAudio, systemAudioSources.length),
    optionalSourceCheck('camera', 'Camera', options.recordCamera, selectedCamera, cameraSources.length),
    ...(onMac ? macPermissionChecks(macPermissions, options) : []),
  ];

  const missingTools = [['ffmpeg', ffmpegAvailable], ['ffprobe', ffprobeAvailable], ...(usesInputHook ? [] : [['xdotool', xdotoolAvailable], ['xinput', xinputAvailable]])]
    .filter(([, available]) => !available)
    .map(([id]) => id);

  return {
    status: summarizeSeverity(checks),
    missingTools,
    installHint: onWindows ? buildWindowsInstallHint(missingTools) : onMac ? buildMacInstallHint(missingTools) : buildInstallHint(missingTools, readDistroFamily()),
    checkedAt: new Date().toISOString(),
    recordingsDir,
    display,
    capture: { mode: options.captureMode === 'region' ? 'region' : 'display', width: captureWidth, height: captureHeight, fps: 30 },
    disk,
    checks,
  };
}

// FFmpeg ships ffprobe in the same package; winget needs no admin prompt beyond its own.
export function buildWindowsInstallHint(missingToolIds) {
  if (!missingToolIds.some((id) => id === 'ffmpeg' || id === 'ffprobe')) return null;
  return { family: 'winget', commands: [{ family: 'winget', label: 'Windows', command: 'winget install -e --id Gyan.FFmpeg' }] };
}

// The Mac app ships its own FFmpeg; this only shows up when someone runs it from source without one.
export function buildMacInstallHint(missingToolIds) {
  if (!missingToolIds.some((id) => id === 'ffmpeg' || id === 'ffprobe')) return null;
  return { family: 'brew', commands: [{ family: 'brew', label: 'macOS (Homebrew)', command: 'brew install ffmpeg' }] };
}

// Screen Recording blocks a recording (the file would be black); a denied microphone or camera only drops that
// source, like a missing device, so it warns. Accessibility is needed for click highlighting.
export function macPermissionChecks(permissions, options = {}) {
  if (!permissions) return [];
  const checks = [];
  const screenMessage = macPermissionMessage('screen', permissions.screen);
  checks.push(createCheck('mac-screen-permission', 'Screen Recording permission', screenMessage ? (permissions.screen === 'not-determined' ? 'warn' : 'critical') : 'ok', screenMessage ?? 'Allowed'));
  for (const [kind, id, label, enabled] of [['microphone', 'mac-mic-permission', 'Microphone permission', options.recordMic], ['camera', 'mac-camera-permission', 'Camera permission', options.recordCamera]]) {
    if (!enabled) continue;
    const message = macPermissionMessage(kind, permissions[kind]);
    checks.push(createCheck(id, label, message ? 'warn' : 'ok', message ?? 'Allowed'));
  }
  // Accessibility is needed for click highlighting. Check if uiohook can be initialized.
  const accessibilityMessage = macPermissionMessage('accessibility', permissions.accessibility);
  checks.push(createCheck('mac-accessibility-permission', 'Accessibility (click highlights)', accessibilityMessage ? 'warn' : 'ok', accessibilityMessage ?? 'Allowed'));
  return checks;
}

export function classifyDiskFreeBytes(freeBytes) {
  if (!Number.isFinite(freeBytes)) return { severity: 'warn', detail: 'Free space unknown' };
  if (freeBytes < MIN_FREE_BYTES_30_MIN) return { severity: 'critical', detail: `${formatBytes(freeBytes)} free; below 30 minute safety budget` };
  if (freeBytes < MIN_FREE_BYTES_60_MIN) return { severity: 'warn', detail: `${formatBytes(freeBytes)} free; enough for 30 minutes, below 60 minute safety budget` };
  return { severity: 'ok', detail: `${formatBytes(freeBytes)} free; enough for 60 minute safety budget` };
}

function createCheck(id, label, severity, detail) {
  return { id, label, severity, detail };
}

function optionalSourceCheck(id, label, enabled, selectedSource, sourceCount) {
  if (!enabled) return createCheck(id, label, 'ok', 'Off; screen-only fallback is safe');
  if (selectedSource) return createCheck(id, label, sourceIsDegraded(selectedSource) ? 'warn' : 'ok', `${selectedSource.label || selectedSource.name}${selectedSource.state ? ` (${selectedSource.state.toLowerCase()})` : ''}`);
  return createCheck(id, label, 'warn', sourceCount > 0 ? 'Enabled but selected source was not found; screen recording can continue without it' : 'No source found; screen recording can continue without it');
}

function sourceIsDegraded(source) {
  const state = String(source?.state ?? '').toLowerCase();
  return Boolean(state && !['running', 'idle', 'unknown'].includes(state));
}

async function readDiskStatus(recordingsDir) {
  try {
    const stats = await statfs(recordingsDir).catch(() => statfs(dirname(recordingsDir)));
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    return { freeBytes, ...classifyDiskFreeBytes(freeBytes) };
  } catch (err) {
    return { freeBytes: null, severity: 'warn', detail: `Free space unavailable: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function commandAvailable(command) {
  const result = spawnSync(command, ['-version'], { stdio: 'ignore' });
  return !result.error && result.status === 0;
}

function findSource(sources, name) {
  if (!name) return null;
  return sources.find((source) => source.name === name) ?? null;
}

function sessionLabel(platform) {
  if (platform === 'win32') return 'Windows session';
  if (platform === 'darwin') return 'macOS session (beta)';
  return process.env.XDG_SESSION_TYPE ? `${process.env.XDG_SESSION_TYPE.toUpperCase()} session` : 'Unknown session';
}

function sessionSeverity(platform) {
  if (platform === 'win32' || platform === 'darwin') return 'ok';
  const type = String(process.env.XDG_SESSION_TYPE ?? '').toLowerCase();
  return type === 'wayland' ? 'critical' : type === 'x11' || process.env.DISPLAY ? 'ok' : 'warn';
}

function sessionDetail(platform) {
  if (platform === 'win32') return 'Desktop capture via FFmpeg gdigrab';
  if (platform === 'darwin') return 'Screen capture via FFmpeg AVFoundation (primary display)';
  const type = String(process.env.XDG_SESSION_TYPE ?? '').toLowerCase();
  if (type === 'wayland') return 'Wayland is outside the current reliability scope; use X11 for client recordings';
  if (type === 'x11' || process.env.DISPLAY) return `DISPLAY ${process.env.DISPLAY || 'available'}`;
  return 'X11 DISPLAY was not detected';
}

function summarizeSeverity(checks) {
  if (checks.some((check) => check.severity === 'critical')) return 'critical';
  if (checks.some((check) => check.severity === 'warn')) return 'warn';
  return 'ok';
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'unknown';
  const gib = bytes / 1024 / 1024 / 1024;
  return `${gib.toFixed(gib >= 10 ? 0 : 1)} GiB`;
}
