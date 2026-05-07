import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createProjectForRecording,
  getPrimaryRecording,
  openProjectFile,
  saveProjectFile,
  saveProjectForRecording,
} from './project-files.mjs';
import {
  createZoomMarker,
  createDefaultRecordingPresentation,
} from '../../../../packages/project-model/dist/index.js';

const recording = {
  state: 'saved',
  startedAt: '2026-04-28T12:00:00.000Z',
  stoppedAt: '2026-04-28T12:00:10.000Z',
  outputPath: '/tmp/rough-cut-test.mp4',
  width: 1920,
  height: 1080,
  fps: 30,
  audio: { micSource: 'alsa_input.usb-Samson_Technologies_Samson_Q2U_Microphone-00.analog-stereo' },
  cursorTelemetryPath: '/tmp/rough-cut-test.cursor.json',
  cursorEvents: [{ frame: 3, timeMs: 100, x: 12, y: 34, type: 'move', button: 0 }],
};

test('creates a valid project document for a screen recording', () => {
  const project = createProjectForRecording({
    recording,
    now: new Date('2026-04-28T12:00:11.000Z'),
  });

  assert.equal(project.name, 'rough-cut-test');
  assert.equal(project.assets.length, 1);
  assert.equal(project.assets[0].type, 'recording');
  assert.equal(project.assets[0].filePath, recording.outputPath);
  assert.deepEqual(project.assets[0].metadata.audio, recording.audio);
  assert.equal(project.assets[0].metadata.display, null);
  assert.equal(project.assets[0].metadata.capture, null);
  assert.deepEqual(project.assets[0].metadata.cursorEvents, recording.cursorEvents);
  assert.equal(project.composition.duration, 300);
  assert.equal(project.composition.tracks.length, 1);
  assert.equal(project.composition.tracks[0].clips.length, 1);
});

test('persists capture region metadata for bounded recordings', () => {
  const capture = { mode: 'region', x: 10, y: 20, width: 640, height: 360, absoluteX: 110, absoluteY: 220 };
  const project = createProjectForRecording({
    recording: {
      ...recording,
      display: ':0+110,220',
      width: 640,
      height: 360,
      capture,
    },
    now: new Date('2026-04-28T12:00:11.000Z'),
  });

  assert.equal(project.assets[0].metadata.display, ':0+110,220');
  assert.deepEqual(project.assets[0].metadata.capture, capture);
  assert.equal(project.assets[0].metadata.width, 640);
  assert.equal(project.assets[0].metadata.height, 360);
});

test('creates linked camera asset and track when webcam recording is present', () => {
  const project = createProjectForRecording({
    recording: {
      ...recording,
      camera: {
        rawPath: '/tmp/rough-cut-test-camera.mkv',
        outputPath: '/tmp/rough-cut-test-camera.mp4',
        devicePath: '/dev/video2',
        width: 1280,
        height: 720,
        fps: 30,
        sourceInFrames: 30,
        prerollMs: 1000,
      },
    },
    now: new Date('2026-04-28T12:00:11.000Z'),
  });

  assert.equal(project.assets.length, 2);
  assert.equal(project.assets[0].cameraAssetId, project.assets[1].id);
  assert.equal(project.assets[1].metadata.isCamera, true);
  assert.equal(project.assets[1].duration, project.composition.duration + 30);
  assert.equal(project.assets[1].metadata.sourceInFrames, 30);
  assert.equal(project.composition.tracks.length, 2);
  assert.equal(project.composition.tracks[1].clips[0].assetId, project.assets[1].id);
  assert.equal(project.composition.tracks[1].clips[0].sourceIn, 30);
  assert.equal(project.composition.tracks[1].clips[0].sourceOut, project.composition.duration + 30);
  assert.equal(getPrimaryRecording(project)?.camera?.filePath, '/tmp/rough-cut-test-camera.mp4');
  assert.equal(getPrimaryRecording(project)?.camera?.sourceInFrames, 30);
});

test('persists camera warning metadata for screen-only fallback review', () => {
  const project = createProjectForRecording({
    recording: {
      ...recording,
      cameraError: 'Device or resource busy',
    },
    now: new Date('2026-04-28T12:00:11.000Z'),
  });

  assert.equal(project.assets[0].metadata.cameraError, 'Device or resource busy');
});

test('saves and reopens a roughcut project file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-project-'));
  const outputPath = join(root, 'capture.mp4');
  const saved = await saveProjectForRecording({ ...recording, outputPath });

  assert.equal(saved.path, join(root, 'capture.roughcut'));
  assert.equal(existsSync(saved.path), true);

  const opened = await openProjectFile(saved.path);
  assert.equal(opened.document.name, 'capture');
  assert.equal(getPrimaryRecording(opened.document)?.filePath, outputPath);
  assert.deepEqual(getPrimaryRecording(opened.document)?.audio, recording.audio);
  assert.equal(getPrimaryRecording(opened.document)?.cursorEvents.length, 1);

  await rm(root, { recursive: true, force: true });
});

test('getPrimaryRecording exposes zoomMarkers from the asset presentation', () => {
  const project = createProjectForRecording({
    recording,
    now: new Date('2026-04-28T12:00:11.000Z'),
  });
  const marker = createZoomMarker(30, 90, { strength: 1, focalPoint: { x: 0.5, y: 0.5 } });
  const presentation = createDefaultRecordingPresentation();
  const withMarker = {
    ...project,
    assets: project.assets.map((asset, idx) =>
      idx === 0
        ? {
            ...asset,
            presentation: {
              ...presentation,
              zoom: { ...presentation.zoom, markers: [marker] },
            },
          }
        : asset,
    ),
  };
  const primary = getPrimaryRecording(withMarker);
  assert.equal(Array.isArray(primary.zoomMarkers), true);
  assert.equal(primary.zoomMarkers.length, 1);
  assert.deepEqual(primary.zoomMarkers[0], marker);
});

test('getPrimaryRecording defaults zoomMarkers to an empty array when asset has no presentation', () => {
  const project = createProjectForRecording({
    recording,
    now: new Date('2026-04-28T12:00:11.000Z'),
  });
  const primary = getPrimaryRecording(project);
  assert.equal(Array.isArray(primary.zoomMarkers), true);
  assert.equal(primary.zoomMarkers.length, 0);
});

test('getPrimaryRecording exposes persisted head and tail trims from the primary clip', () => {
  const project = createProjectForRecording({
    recording,
    now: new Date('2026-04-28T12:00:11.000Z'),
  });
  const clip = project.composition.tracks[0].clips[0];
  const trimmed = {
    ...project,
    composition: {
      ...project.composition,
      duration: 210,
      tracks: [{
        ...project.composition.tracks[0],
        clips: [{ ...clip, timelineIn: 0, timelineOut: 210, sourceIn: 30, sourceOut: 240 }],
      }],
    },
  };

  const primary = getPrimaryRecording(trimmed);
  assert.equal(primary.sourceIn, 30);
  assert.equal(primary.sourceOut, 240);
  assert.equal(primary.trimmedDuration, 210);
});

test('round-trips a manual zoom marker through save and reopen', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-zoom-'));
  const outputPath = join(root, 'capture.mp4');
  const baseProject = createProjectForRecording({
    recording: { ...recording, outputPath },
    now: new Date('2026-04-28T12:00:11.000Z'),
  });

  const marker = createZoomMarker(30, 90, {
    strength: 0.6,
    focalPoint: { x: 0.25, y: 0.75 },
  });
  const presentation = createDefaultRecordingPresentation();
  const project = {
    ...baseProject,
    assets: baseProject.assets.map((asset, idx) =>
      idx === 0
        ? {
            ...asset,
            presentation: {
              ...presentation,
              zoom: { ...presentation.zoom, markers: [marker] },
            },
          }
        : asset,
    ),
  };

  const projectPath = join(root, 'capture.roughcut');
  await saveProjectFile(projectPath, project);
  const opened = await openProjectFile(projectPath);

  const loaded = opened.document.assets[0]?.presentation?.zoom?.markers?.[0];
  assert.deepEqual(loaded, marker);

  await rm(root, { recursive: true, force: true });
});
