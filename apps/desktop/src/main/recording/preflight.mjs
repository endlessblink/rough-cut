import { statfs } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { isXinputAvailable } from './xinput-button-listener.mjs';
import { isXdotoolAvailable } from './xdotool-cursor.mjs';

const MIN_FREE_BYTES_30_MIN = 8 * 1024 * 1024 * 1024;
const MIN_FREE_BYTES_60_MIN = 16 * 1024 * 1024 * 1024;

export async function getRecordingPreflightStatus({ recordingsDir, displayInfo, micSources = [], systemAudioSources = [], cameraSources = [], options = {} } = {}) {
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
  const xdotoolAvailable = isXdotoolAvailable();
  const xinputAvailable = isXinputAvailable();

  const checks = [
    createCheck('session', sessionLabel(), sessionSeverity(), sessionDetail()),
    createCheck('capture', options.captureMode === 'region' ? 'Region capture' : 'Full display', captureWidth > 0 && captureHeight > 0 ? 'ok' : 'warn', `${captureWidth || 'unknown'} x ${captureHeight || 'unknown'} at 30 FPS`),
    createCheck('destination', 'Save destination', disk.severity, disk.detail),
    createCheck('ffmpeg', 'FFmpeg', ffmpegAvailable ? 'ok' : 'critical', ffmpegAvailable ? 'Available' : 'Missing; recording/export cannot start safely'),
    createCheck('ffprobe', 'FFprobe', ffprobeAvailable ? 'ok' : 'critical', ffprobeAvailable ? 'Available' : 'Missing; saved media cannot be verified'),
    createCheck('xdotool', 'Cursor position', xdotoolAvailable ? 'ok' : 'warn', xdotoolAvailable ? 'xdotool available' : 'xdotool missing; cursor tracking may be unreliable'),
    createCheck('xinput', 'Click telemetry', xinputAvailable ? 'ok' : 'warn', xinputAvailable ? 'xinput available' : 'xinput missing; click telemetry may be skipped'),
    optionalSourceCheck('mic', 'Microphone', options.recordMic, selectedMic, micSources.length),
    optionalSourceCheck('system-audio', 'System audio', options.recordSystemAudio, selectedSystemAudio, systemAudioSources.length),
    optionalSourceCheck('camera', 'Camera', options.recordCamera, selectedCamera, cameraSources.length),
  ];

  return {
    status: summarizeSeverity(checks),
    checkedAt: new Date().toISOString(),
    recordingsDir,
    display,
    capture: { mode: options.captureMode === 'region' ? 'region' : 'display', width: captureWidth, height: captureHeight, fps: 30 },
    disk,
    checks,
  };
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

function sessionLabel() {
  return process.env.XDG_SESSION_TYPE ? `${process.env.XDG_SESSION_TYPE.toUpperCase()} session` : 'Unknown session';
}

function sessionSeverity() {
  const type = String(process.env.XDG_SESSION_TYPE ?? '').toLowerCase();
  return type === 'wayland' ? 'critical' : type === 'x11' || process.env.DISPLAY ? 'ok' : 'warn';
}

function sessionDetail() {
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
