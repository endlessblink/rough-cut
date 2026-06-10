import { readFile, rm, stat } from 'node:fs/promises';

// Reads the recovery marker that recording-session writes at the start of a
// capture and clears on graceful stop/cancel. If the app crashed or was
// SIGTERMed mid-recording (TASK-066 leaves the marker for exactly this), the
// marker plus the on-disk raw .mkv let us recover what was captured up to the
// crash.

export async function readRecoveryMarker(markerPath) {
  try {
    const raw = await readFile(markerPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
}

export async function getRecoveryState({ markerPath, fileExists = defaultFileExists }) {
  const marker = await readRecoveryMarker(markerPath);
  if (!marker || !marker.rawPath) {
    return { available: false, marker: null, rawAvailable: false };
  }
  const rawAvailable = await fileExists(marker.rawPath);
  return {
    available: rawAvailable,
    marker,
    rawAvailable,
    cameraRawAvailable: marker.cameraRawPath ? await fileExists(marker.cameraRawPath) : false,
  };
}

export async function recoverFromMarker({
  markerPath,
  remuxMkvToMp4,
  assertReadableMp4,
  saveProjectForRecording,
  formatProject,
  fileExists = defaultFileExists,
  now = () => new Date(),
  onLog = () => undefined,
}) {
  const state = await getRecoveryState({ markerPath, fileExists });
  if (!state.available) {
    throw new Error('No recoverable recording is available.');
  }
  const { marker } = state;

  onLog(`[recovery] remuxing recovered screen: ${marker.rawPath} -> ${marker.outputPath}`);
  const screenRemux = await remuxMkvToMp4({ rawPath: marker.rawPath, outputPath: marker.outputPath, onLog });
  await assertReadableMp4(marker.outputPath);

  let cameraRemux = null;
  let cameraError = null;
  if (state.cameraRawAvailable && marker.cameraOutputPath) {
    try {
      onLog(`[recovery] remuxing recovered camera: ${marker.cameraRawPath} -> ${marker.cameraOutputPath}`);
      cameraRemux = await remuxMkvToMp4({ rawPath: marker.cameraRawPath, outputPath: marker.cameraOutputPath, onLog });
      await assertReadableMp4(marker.cameraOutputPath);
    } catch (err) {
      cameraError = err instanceof Error ? err.message : String(err);
      cameraRemux = null;
      onLog(`[recovery] camera recovery failed: ${cameraError}`);
    }
  }

  const stoppedAt = now().toISOString();
  const recording = {
    state: 'saved',
    startedAt: marker.startedAt,
    stoppedAt,
    rawPath: marker.rawPath,
    outputPath: marker.outputPath,
    width: marker.width,
    height: marker.height,
    fps: marker.fps,
    display: marker.display ?? null,
    captureRegion: marker.captureRegion ?? null,
    cursorTelemetryPath: marker.cursorTelemetryPath ?? null,
    cursorEvents: [],
    audio: buildAudioMetadataFromMarker(marker),
    cameraRawPath: cameraRemux ? marker.cameraRawPath : null,
    cameraOutputPath: cameraRemux ? marker.cameraOutputPath : null,
    cameraDevicePath: cameraRemux ? marker.cameraDevicePath ?? null : null,
    camera: cameraRemux
      ? { rawPath: marker.cameraRawPath, outputPath: marker.cameraOutputPath, devicePath: marker.cameraDevicePath ?? null, width: 1280, height: 720, fps: marker.fps, sourceInFrames: 0, prerollMs: 0 }
      : null,
    cameraError,
  };

  const project = await saveProjectForRecording(recording);
  await rm(markerPath, { force: true });

  const formatted = typeof formatProject === 'function' ? formatProject(project) : project;
  const remuxWarnings = [];
  if (screenRemux?.warning) remuxWarnings.push({ source: 'screen', message: screenRemux.warning });
  if (cameraRemux?.warning) remuxWarnings.push({ source: 'camera', message: cameraRemux.warning });

  return {
    state: 'recovered',
    project: formatted,
    recording,
    remuxWarnings,
  };
}

function buildAudioMetadataFromMarker(marker) {
  const audio = {};
  if (marker.micSource) {
    audio.micSource = marker.micSource;
    audio.micGainPercent = normalizeAudioGainPercent(marker.micGainPercent);
  }
  if (marker.systemAudioSource) {
    audio.systemAudioSource = marker.systemAudioSource;
    audio.systemAudioGainPercent = normalizeAudioGainPercent(marker.systemAudioGainPercent);
  }
  return Object.keys(audio).length > 0 ? audio : null;
}

function normalizeAudioGainPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 100;
  return Math.max(0, Math.min(200, Math.round(number)));
}

export async function dismissRecovery({ markerPath, deleteFiles = false, fileExists = defaultFileExists }) {
  const marker = await readRecoveryMarker(markerPath);
  if (!marker) return { dismissed: false, removed: [] };
  const removed = [];
  if (deleteFiles) {
    const candidates = [
      marker.rawPath,
      marker.outputPath,
      marker.cursorTelemetryPath,
      marker.cameraRawPath,
      marker.cameraOutputPath,
    ].filter(Boolean);
    for (const path of candidates) {
      if (await fileExists(path)) {
        await rm(path, { force: true });
        removed.push(path);
      }
    }
  }
  await rm(markerPath, { force: true });
  return { dismissed: true, removed };
}

async function defaultFileExists(path) {
  try {
    await stat(path);
    return true;
  } catch (err) {
    if (err?.code === 'ENOENT') return false;
    throw err;
  }
}
