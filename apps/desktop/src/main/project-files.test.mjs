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
  saveProjectForRecording,
} from './project-files.mjs';

const recording = {
  state: 'saved',
  startedAt: '2026-04-28T12:00:00.000Z',
  stoppedAt: '2026-04-28T12:00:10.000Z',
  outputPath: '/tmp/rough-cut-test.mp4',
  width: 1920,
  height: 1080,
  fps: 30,
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
  assert.deepEqual(project.assets[0].metadata.cursorEvents, recording.cursorEvents);
  assert.equal(project.composition.duration, 300);
  assert.equal(project.composition.tracks.length, 1);
  assert.equal(project.composition.tracks[0].clips.length, 1);
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
  assert.equal(getPrimaryRecording(opened.document)?.cursorEvents.length, 1);

  await rm(root, { recursive: true, force: true });
});
