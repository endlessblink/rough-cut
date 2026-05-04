import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  createAsset,
  createClip,
  createProject,
  createTrack,
  validateProject,
} from '../../../../packages/project-model/dist/index.js';
import { migrate } from '../../../../packages/project-model/dist/migrations.js';

export function createProjectForRecording({ recording, now = new Date() }) {
  const fps = recording.fps || 30;
  const durationFrames = Math.max(
    1,
    Math.round(((Date.parse(recording.stoppedAt) - Date.parse(recording.startedAt)) / 1000) * fps),
  );
  const name = basename(recording.outputPath).replace(/\.mp4$/i, '');
  const asset = createAsset('recording', recording.outputPath, {
    duration: durationFrames,
    metadata: {
      rawPath: recording.rawPath,
      width: recording.width,
      height: recording.height,
      fps,
      startedAt: recording.startedAt,
      stoppedAt: recording.stoppedAt,
      cursorTelemetryPath: recording.cursorTelemetryPath,
      cursorEvents: Array.isArray(recording.cursorEvents) ? recording.cursorEvents : [],
      audio: recording.audio ?? null,
    },
  });
  const track = createTrack('video', { name: 'Screen Recording', index: 0 });
  const clip = createClip(asset.id, track.id, {
    name,
    timelineIn: 0,
    timelineOut: durationFrames,
    sourceIn: 0,
    sourceOut: durationFrames,
  });

  return validateProject(
    createProject({
      name,
      createdAt: now.toISOString(),
      modifiedAt: now.toISOString(),
      settings: {
        resolution: { width: ensureEven(recording.width), height: ensureEven(recording.height) },
        frameRate: fps,
        backgroundColor: '#000000',
        sampleRate: 48000,
        destinationPresetId: null,
      },
      assets: [asset],
      composition: {
        duration: durationFrames,
        tracks: [{ ...track, clips: [clip] }],
        transitions: [],
      },
      exportSettings: {
        format: 'mp4',
        codec: 'h264',
        bitrate: 15_000_000,
        resolution: { width: ensureEven(recording.width), height: ensureEven(recording.height) },
        frameRate: fps,
        keepClickSounds: true,
      },
    }),
  );
}

export async function saveProjectFile(projectPath, project) {
  const document = validateProject({ ...project, modifiedAt: new Date().toISOString() });
  await mkdir(dirname(projectPath), { recursive: true });
  await writeFile(projectPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  return { path: projectPath, document };
}

export async function openProjectFile(projectPath) {
  const raw = await readFile(projectPath, 'utf8');
  return { path: projectPath, document: migrate(JSON.parse(raw)) };
}

export async function saveProjectForRecording(recording) {
  const project = createProjectForRecording({ recording });
  const projectPath = join(dirname(recording.outputPath), `${basename(recording.outputPath, '.mp4')}.roughcut`);
  return saveProjectFile(projectPath, project);
}

export function getPrimaryRecording(project) {
  const asset = project.assets.find((item) => item.type === 'recording' || item.type === 'video');
  if (!asset) return null;
  return {
    assetId: asset.id,
    filePath: asset.filePath,
    duration: asset.duration,
    width: typeof asset.metadata.width === 'number' ? asset.metadata.width : project.settings.resolution.width,
    height: typeof asset.metadata.height === 'number' ? asset.metadata.height : project.settings.resolution.height,
    fps: typeof asset.metadata.fps === 'number' ? asset.metadata.fps : project.settings.frameRate,
    cursorEvents: Array.isArray(asset.metadata.cursorEvents) ? asset.metadata.cursorEvents : [],
    cursorTelemetryPath: typeof asset.metadata.cursorTelemetryPath === 'string' ? asset.metadata.cursorTelemetryPath : null,
    audio: asset.metadata.audio && typeof asset.metadata.audio === 'object' ? asset.metadata.audio : null,
    zoomMarkers: Array.isArray(asset.presentation?.zoom?.markers) ? asset.presentation.zoom.markers : [],
  };
}

function ensureEven(value) {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}
