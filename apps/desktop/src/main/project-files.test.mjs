import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createBlankProject,
  createProjectForImport,
  createProjectForRecording,
  discardInterruptedSave,
  duplicateProjectFile,
  getPrimaryRecording,
  openProjectFile,
  pickImportProjectPath,
  PROJECT_BACKUP_SUFFIX,
  PROJECT_TEMP_SUFFIX,
  ProjectPathError,
  renameProjectFile,
  saveBlankProject,
  saveProjectFile,
  saveProjectForImport,
  saveProjectForRecording,
  validateProjectPath,
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
  assert.equal(project.assets[0].pathMode, 'relative');
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
  assert.equal(project.assets[1].pathMode, 'relative');
  assert.equal(project.assets[1].duration, project.composition.duration + 30);
  assert.equal(project.assets[1].metadata.sourceInFrames, 30);
  assert.equal(project.composition.tracks.length, 2);
  assert.equal(project.composition.tracks[1].clips[0].assetId, project.assets[1].id);
  assert.equal(project.composition.tracks[1].clips[0].sourceIn, 30);
  assert.equal(project.composition.tracks[1].clips[0].sourceOut, project.composition.duration + 30);
  assert.equal(getPrimaryRecording(project)?.camera?.filePath, '/tmp/rough-cut-test-camera.mp4');
  assert.equal(getPrimaryRecording(project)?.camera?.sourceInFrames, 30);
});

test('uses probed synced overlap for linked camera project duration', () => {
  const project = createProjectForRecording({
    recording: {
      ...recording,
      sync: {
        screenFrames: 70,
        cameraFrames: 132,
        cameraSourceInFrames: 75,
        syncedDurationFrames: 57,
        syncWarning: 'Camera overlap is shorter than screen capture.',
      },
      camera: {
        rawPath: '/tmp/rough-cut-test-camera.mkv',
        outputPath: '/tmp/rough-cut-test-camera.mp4',
        devicePath: '/dev/video2',
        width: 1280,
        height: 720,
        fps: 30,
        sourceInFrames: 75,
        prerollMs: 2500,
      },
    },
    now: new Date('2026-04-28T12:00:11.000Z'),
  });

  assert.equal(project.composition.duration, 57);
  assert.equal(project.assets[0].duration, 57);
  assert.equal(project.assets[0].metadata.sync.syncedDurationFrames, 57);
  assert.equal(project.assets[1].duration, 132);
  assert.equal(project.composition.tracks[0].clips[0].sourceOut, 57);
  assert.equal(project.composition.tracks[1].clips[0].sourceIn, 75);
  assert.equal(project.composition.tracks[1].clips[0].sourceOut, 132);
});

test('uses timestamp-derived sync offset over legacy camera source offset', () => {
  const project = createProjectForRecording({
    recording: {
      ...recording,
      streamTiming: {
        screen: { index: 0, startTimeSeconds: 0.1, durationSeconds: 6.7 },
        camera: { index: 1, startTimeSeconds: 0.2, durationSeconds: 6.7 },
      },
      sync: {
        screenFrames: 201,
        cameraFrames: 201,
        cameraSourceInFrames: 3,
        syncedDurationFrames: 198,
        syncWarning: null,
      },
      camera: {
        rawPath: '/tmp/rough-cut-test.mkv',
        outputPath: '/tmp/rough-cut-test-camera.mp4',
        devicePath: '/dev/video2',
        width: 1280,
        height: 720,
        fps: 30,
        sourceInFrames: 0,
        prerollMs: 0,
        streamTiming: { index: 1, startTimeSeconds: 0.2, durationSeconds: 6.7 },
      },
    },
    now: new Date('2026-04-28T12:00:11.000Z'),
  });

  assert.equal(project.composition.duration, 198);
  assert.equal(project.assets[1].metadata.sourceInFrames, 3);
  assert.equal(project.composition.tracks[1].clips[0].sourceIn, 3);
  assert.equal(project.assets[0].metadata.streamTiming.camera.index, 1);
  assert.equal(project.assets[1].metadata.streamTiming.index, 1);
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

test('saveProjectFile stores same-folder recording paths relative to the roughcut file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-relative-save-'));
  const outputPath = join(root, 'capture.mp4');
  const projectPath = join(root, 'capture.roughcut');
  const project = createProjectForRecording({
    recording: { ...recording, outputPath },
    now: new Date('2026-04-28T12:00:11.000Z'),
  });

  const saved = await saveProjectFile(projectPath, project);
  const raw = JSON.parse(await readFile(projectPath, 'utf8'));

  assert.equal(raw.assets[0].filePath, 'capture.mp4');
  assert.equal(raw.assets[0].pathMode, 'relative');
  assert.equal(raw.assets[0].metadata.absoluteFilePath, outputPath);
  assert.equal(getPrimaryRecording(saved.document)?.filePath, outputPath);

  await rm(root, { recursive: true, force: true });
});

test('openProjectFile resolves relative asset paths from a moved roughcut directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-relative-open-'));
  const outputPath = join(root, 'capture.mp4');
  const projectPath = join(root, 'capture.roughcut');
  await writeFile(outputPath, 'media', 'utf8');
  const project = createProjectForRecording({
    recording: { ...recording, outputPath },
    now: new Date('2026-04-28T12:00:11.000Z'),
  });
  await saveProjectFile(projectPath, project);

  const movedRoot = await mkdtemp(join(tmpdir(), 'rough-cut-relative-moved-'));
  const movedProjectPath = join(movedRoot, 'capture.roughcut');
  const movedOutputPath = join(movedRoot, 'capture.mp4');
  await writeFile(movedProjectPath, await readFile(projectPath, 'utf8'), 'utf8');
  await writeFile(movedOutputPath, 'media', 'utf8');

  const opened = await openProjectFile(movedProjectPath);

  assert.equal(getPrimaryRecording(opened.document)?.filePath, movedOutputPath);

  await rm(root, { recursive: true, force: true });
  await rm(movedRoot, { recursive: true, force: true });
});

test('openProjectFile falls back to absolute asset path when relative target is missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-relative-fallback-'));
  const fallbackRoot = await mkdtemp(join(tmpdir(), 'rough-cut-relative-fallback-src-'));
  const fallbackPath = join(fallbackRoot, 'capture.mp4');
  const projectPath = join(root, 'capture.roughcut');
  const project = createProjectForRecording({
    recording: { ...recording, outputPath: fallbackPath },
    now: new Date('2026-04-28T12:00:11.000Z'),
  });
  const portableProject = {
    ...project,
    assets: project.assets.map((asset) => ({
      ...asset,
      filePath: 'capture.mp4',
      pathMode: 'relative',
      metadata: { ...asset.metadata, absoluteFilePath: fallbackPath },
    })),
  };
  await writeFile(projectPath, `${JSON.stringify(portableProject, null, 2)}\n`, 'utf8');
  await unlink(join(root, 'capture.mp4')).catch((err) => {
    if (err?.code !== 'ENOENT') throw err;
  });

  const opened = await openProjectFile(projectPath);

  assert.equal(getPrimaryRecording(opened.document)?.filePath, fallbackPath);

  await rm(root, { recursive: true, force: true });
  await rm(fallbackRoot, { recursive: true, force: true });
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

test('getPrimaryRecording exposes persisted cut ranges and visible duration', () => {
  const project = createProjectForRecording({
    recording,
    now: new Date('2026-04-28T12:00:11.000Z'),
  });
  const asset = project.assets[0];
  const presentation = createDefaultRecordingPresentation();
  const withCuts = {
    ...project,
    assets: [{
      ...asset,
      presentation: {
        ...presentation,
        cutRanges: [{ id: 'cut-1', startFrame: 30, endFrame: 60 }],
      },
    }],
  };

  const primary = getPrimaryRecording(withCuts);
  assert.deepEqual(primary.cutRanges, [{ id: 'cut-1', startFrame: 30, endFrame: 60 }]);
  assert.equal(primary.trimmedDuration, primary.duration - 30);
});

test('validateProjectPath accepts a .roughcut file inside an allowed root', () => {
  const root = join(tmpdir(), 'rough-cut-validate-allowed');
  const candidate = join(root, 'project.roughcut');
  const result = validateProjectPath(candidate, { allowedRoots: [root] });
  assert.equal(result, candidate);
});

test('validateProjectPath normalizes redundant separators inside an allowed root', () => {
  const root = join(tmpdir(), 'rough-cut-validate-norm');
  const candidate = join(root, '.', 'sub', '..', 'project.roughcut');
  const result = validateProjectPath(candidate, { allowedRoots: [root] });
  assert.equal(result, join(root, 'project.roughcut'));
});

test('validateProjectPath rejects ../.. traversal escaping the allowed root', () => {
  const root = join(tmpdir(), 'rough-cut-validate-traverse');
  const candidate = join(root, '..', '..', 'etc', 'passwd.roughcut');
  assert.throws(
    () => validateProjectPath(candidate, { allowedRoots: [root] }),
    (err) => err instanceof ProjectPathError && err.reason === 'outside-root',
  );
});

test('validateProjectPath rejects an absolute path outside the allowed root', () => {
  const root = join(tmpdir(), 'rough-cut-validate-abs');
  assert.throws(
    () => validateProjectPath('/etc/passwd.roughcut', { allowedRoots: [root] }),
    (err) => err instanceof ProjectPathError && err.reason === 'outside-root',
  );
});

test('validateProjectPath rejects paths missing the .roughcut extension', () => {
  const root = join(tmpdir(), 'rough-cut-validate-ext');
  const candidate = join(root, 'project.txt');
  assert.throws(
    () => validateProjectPath(candidate, { allowedRoots: [root] }),
    (err) => err instanceof ProjectPathError && err.reason === 'bad-extension',
  );
});

test('validateProjectPath rejects null-byte injection', () => {
  const root = join(tmpdir(), 'rough-cut-validate-nul');
  const candidate = `${join(root, 'project')}\0.roughcut`;
  assert.throws(
    () => validateProjectPath(candidate, { allowedRoots: [root] }),
    (err) => err instanceof ProjectPathError && err.reason === 'null-byte',
  );
});

test('validateProjectPath rejects empty or non-string input', () => {
  assert.throws(
    () => validateProjectPath('', { allowedRoots: [tmpdir()] }),
    (err) => err instanceof ProjectPathError && err.reason === 'empty',
  );
  assert.throws(
    () => validateProjectPath(undefined, { allowedRoots: [tmpdir()] }),
    (err) => err instanceof ProjectPathError && err.reason === 'empty',
  );
});

test('validateProjectPath without allowedRoots still enforces extension and null bytes', () => {
  assert.throws(
    () => validateProjectPath('/tmp/project.txt'),
    (err) => err instanceof ProjectPathError && err.reason === 'bad-extension',
  );
  const ok = validateProjectPath('/tmp/anywhere.roughcut');
  assert.equal(ok, '/tmp/anywhere.roughcut');
});

test('validateProjectPath rejects a sibling directory whose name shares the root prefix', () => {
  const root = join(tmpdir(), 'rough-cut-validate-prefix');
  const sibling = `${root}-evil`;
  const candidate = join(sibling, 'project.roughcut');
  assert.throws(
    () => validateProjectPath(candidate, { allowedRoots: [root] }),
    (err) => err instanceof ProjectPathError && err.reason === 'outside-root',
  );
});

test('saveProjectFile leaves no leftover .tmp on success', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-atomic-clean-'));
  const projectPath = join(root, 'capture.roughcut');
  const project = createProjectForRecording({
    recording: { ...recording, outputPath: join(root, 'capture.mp4') },
    now: new Date('2026-04-28T12:00:11.000Z'),
  });
  await saveProjectFile(projectPath, project);
  assert.equal(existsSync(`${projectPath}${PROJECT_TEMP_SUFFIX}`), false);
  assert.equal(existsSync(projectPath), true);
  await rm(root, { recursive: true, force: true });
});

test('saveProjectFile creates a .bak snapshot of the previous good file on rewrite', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-atomic-bak-'));
  const projectPath = join(root, 'capture.roughcut');
  const project = createProjectForRecording({
    recording: { ...recording, outputPath: join(root, 'capture.mp4') },
    now: new Date('2026-04-28T12:00:11.000Z'),
  });
  await saveProjectFile(projectPath, project);
  const firstContents = await readFile(projectPath, 'utf8');

  // Mutate something cheaply observable and save again; .bak must reflect the
  // previous good file, not the new one.
  await saveProjectFile(projectPath, { ...project, name: 'capture-renamed' });
  const backupPath = `${projectPath}${PROJECT_BACKUP_SUFFIX}`;
  assert.equal(existsSync(backupPath), true);
  const backupContents = await readFile(backupPath, 'utf8');
  assert.equal(backupContents, firstContents);

  await rm(root, { recursive: true, force: true });
});

test('openProjectFile leaves the original intact and reports a stray .tmp from a killed write', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-atomic-tmp-'));
  const projectPath = join(root, 'capture.roughcut');
  const project = createProjectForRecording({
    recording: { ...recording, outputPath: join(root, 'capture.mp4') },
    now: new Date('2026-04-28T12:00:11.000Z'),
  });
  await saveProjectFile(projectPath, project);
  const originalContents = await readFile(projectPath, 'utf8');

  // Simulate a save that died after opening the temp file but before rename.
  const tmpPath = `${projectPath}${PROJECT_TEMP_SUFFIX}`;
  await writeFile(tmpPath, '{ "this is": "garbage", incomplete', 'utf8');

  const opened = await openProjectFile(projectPath);
  assert.equal(opened.document.name, project.name);
  assert.equal(opened.interruptedSave?.tmpPath, tmpPath);
  assert.ok(opened.interruptedSave?.size > 0);

  // Original file untouched on disk.
  const stillThere = await readFile(projectPath, 'utf8');
  assert.equal(stillThere, originalContents);

  await rm(root, { recursive: true, force: true });
});

test('openProjectFile recovers from a corrupt main file by falling back to .bak', async () => {
  // Regression for save-race corruption: a previous concurrent save left
  // interleaved bytes in the project file, the next open hit
  // "Unexpected non-whitespace character at position N". saveProjectFile
  // always snapshots the prior good file into .bak before atomic rename,
  // so .bak is the most recent clean generation.
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-open-bak-recover-'));
  const projectPath = join(root, 'capture.roughcut');
  const project = createProjectForRecording({
    recording: { ...recording, outputPath: join(root, 'capture.mp4') },
    now: new Date('2026-04-28T12:00:11.000Z'),
  });
  // First save creates the main file; second save snapshots the first into .bak.
  await saveProjectFile(projectPath, project);
  await saveProjectFile(projectPath, { ...project, name: 'after-edit' });
  // Simulate corruption: append junk after the closing `}` to mimic the
  // observed concurrent-write tail bytes from production failures.
  const goodMain = await readFile(projectPath, 'utf8');
  await writeFile(projectPath, `${goodMain}garbage tail bytes from a stale longer write\n}\n`, 'utf8');

  const opened = await openProjectFile(projectPath);

  assert.equal(opened.recoveredFromBackup, true);
  assert.equal(opened.document.name, project.name); // .bak was the FIRST save's content
  assert.ok(opened.backup, 'open should still report .bak metadata for diagnostics');

  await rm(root, { recursive: true, force: true });
});

test('openProjectFile rethrows the parse error when no .bak exists', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-open-no-bak-'));
  const projectPath = join(root, 'capture.roughcut');
  await writeFile(projectPath, '{ invalid json', 'utf8');
  await assert.rejects(() => openProjectFile(projectPath), /JSON|Unexpected/);
  await rm(root, { recursive: true, force: true });
});

test('saveProjectFile cleans up its unique .tmp so concurrent saves cannot collide', async () => {
  // Defense in depth: each save gets a uniquely-named tmp so two parallel
  // saves cannot both open the same inode and interleave bytes. After a
  // successful save the unique tmp is renamed away, so no leftover with
  // either the legacy fixed suffix or any unique suffix should remain.
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-unique-tmp-'));
  const projectPath = join(root, 'capture.roughcut');
  const project = createProjectForRecording({
    recording: { ...recording, outputPath: join(root, 'capture.mp4') },
    now: new Date('2026-04-28T12:00:11.000Z'),
  });
  await saveProjectFile(projectPath, project);
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(root);
  const strayTmps = files.filter((name) => name.includes(PROJECT_TEMP_SUFFIX));
  assert.deepEqual(strayTmps, [], `no stray tmp files should remain, got: ${strayTmps.join(', ')}`);
  await rm(root, { recursive: true, force: true });
});

test('discardInterruptedSave removes a stray .tmp without touching the project file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-atomic-discard-'));
  const projectPath = join(root, 'capture.roughcut');
  const project = createProjectForRecording({
    recording: { ...recording, outputPath: join(root, 'capture.mp4') },
    now: new Date('2026-04-28T12:00:11.000Z'),
  });
  await saveProjectFile(projectPath, project);
  const tmpPath = `${projectPath}${PROJECT_TEMP_SUFFIX}`;
  await writeFile(tmpPath, 'garbage', 'utf8');
  await discardInterruptedSave(projectPath);
  assert.equal(existsSync(tmpPath), false);
  assert.equal(existsSync(projectPath), true);
  // discardInterruptedSave is idempotent: a second call with no .tmp must not throw.
  await discardInterruptedSave(projectPath);
  await rm(root, { recursive: true, force: true });
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

test('renameProjectFile renames the .roughcut, the .bak, and updates the JSON name', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-rename-'));
  try {
    const fromPath = join(root, 'old.roughcut');
    const oldBak = `${fromPath}${PROJECT_BACKUP_SUFFIX}`;
    const project = createProjectForRecording({ recording });
    await saveProjectFile(fromPath, project);
    // Force a second save to produce a .bak (saveProjectFile snapshots prior generation).
    await saveProjectFile(fromPath, project);
    assert.equal(existsSync(oldBak), true, '.bak exists before rename');

    const result = await renameProjectFile({ fromPath, toName: 'shiny new name' });
    const newPath = join(root, 'shiny new name.roughcut');
    assert.equal(result.path, newPath);
    assert.equal(existsSync(newPath), true);
    assert.equal(existsSync(fromPath), false);
    assert.equal(existsSync(`${newPath}${PROJECT_BACKUP_SUFFIX}`), true, '.bak moved alongside');
    assert.equal(existsSync(oldBak), false, 'old .bak gone');

    const reopened = await openProjectFile(newPath);
    assert.equal(reopened.document.name, 'shiny new name');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('renameProjectFile rejects invalid names', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-rename-bad-'));
  try {
    const fromPath = join(root, 'src.roughcut');
    await saveProjectFile(fromPath, createProjectForRecording({ recording }));
    await assert.rejects(() => renameProjectFile({ fromPath, toName: '' }), /required/);
    await assert.rejects(() => renameProjectFile({ fromPath, toName: 'a/b' }), /slashes/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('renameProjectFile refuses to overwrite an existing project with the same target name', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-rename-collide-'));
  try {
    const fromPath = join(root, 'source.roughcut');
    const otherPath = join(root, 'taken.roughcut');
    await saveProjectFile(fromPath, createProjectForRecording({ recording }));
    await saveProjectFile(otherPath, createProjectForRecording({ recording }));
    await assert.rejects(
      () => renameProjectFile({ fromPath, toName: 'taken' }),
      (err) => err?.code === 'PROJECT_NAME_TAKEN',
    );
    assert.equal(existsSync(fromPath), true, 'source untouched after collision');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('renameProjectFile preserves relative asset paths so media links still resolve', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-rename-relative-'));
  try {
    const mediaPath = join(root, 'rough-cut-test.mp4');
    await writeFile(mediaPath, 'fake-mp4');
    const fromPath = join(root, 'orig.roughcut');
    const project = createProjectForRecording({
      recording: { ...recording, outputPath: mediaPath },
    });
    await saveProjectFile(fromPath, project);

    const result = await renameProjectFile({ fromPath, toName: 'renamed' });
    const reopened = await openProjectFile(result.path);
    const asset = reopened.document.assets[0];
    // The asset's filePath should still resolve to the same media file on disk
    // because the dirname did not change and pathMode='relative' is preserved.
    assert.equal(existsSync(asset.filePath), true, 'media file is still reachable from the renamed project');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('duplicateProjectFile copies the .roughcut + every canonical sibling and updates name', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-dup-'));
  try {
    const fromPath = join(root, 'src.roughcut');
    // Drop canonical siblings on disk too so we can confirm they're all copied.
    await saveProjectFile(fromPath, createProjectForRecording({ recording: { ...recording, outputPath: join(root, 'src.mp4') } }));
    await writeFile(join(root, 'src.mp4'), 'fake-mp4');
    await writeFile(join(root, 'src.thumb.jpg'), 'fake-thumb');
    await writeFile(join(root, 'src.cursor.json'), '[]');

    const result = await duplicateProjectFile({ fromPath });
    const expectedPath = join(root, 'src (copy).roughcut');
    assert.equal(result.path, expectedPath);
    assert.equal(existsSync(expectedPath), true);
    assert.equal(existsSync(join(root, 'src (copy).mp4')), true, 'mp4 sibling copied');
    assert.equal(existsSync(join(root, 'src (copy).thumb.jpg')), true, 'thumbnail sibling copied');
    assert.equal(existsSync(join(root, 'src (copy).cursor.json')), true, 'cursor sibling copied');
    // Source untouched
    assert.equal(existsSync(fromPath), true);
    assert.equal(existsSync(join(root, 'src.mp4')), true);
    const opened = await openProjectFile(expectedPath);
    assert.equal(opened.document.name, 'src (copy)');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('duplicateProjectFile auto-suffixes when "(copy)" already exists', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-dup-collide-'));
  try {
    const fromPath = join(root, 'foo.roughcut');
    await saveProjectFile(fromPath, createProjectForRecording({ recording }));
    // Pre-create the first-tier copy so the auto-suffix has to escalate.
    await writeFile(join(root, 'foo (copy).roughcut'), '{}');

    const result = await duplicateProjectFile({ fromPath });
    assert.equal(result.path, join(root, 'foo (copy 2).roughcut'));
    assert.equal(existsSync(result.path), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('duplicateProjectFile preserves relative asset paths so the copy still resolves media', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-dup-relative-'));
  try {
    const mediaPath = join(root, 'orig.mp4');
    await writeFile(mediaPath, 'fake-mp4');
    const fromPath = join(root, 'orig.roughcut');
    await saveProjectFile(fromPath, createProjectForRecording({ recording: { ...recording, outputPath: mediaPath } }));

    const result = await duplicateProjectFile({ fromPath });
    const reopened = await openProjectFile(result.path);
    const recordingAsset = reopened.document.assets.find((a) => a.type === 'recording');
    // The copy's recording-asset filePath resolves to either the new media
    // copy or back to the original; either way it must exist on disk.
    assert.equal(existsSync(recordingAsset.filePath), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// --- P-AI-C/TASK-168: Import flow ---

test('createProjectForImport builds a validated video project from a probe', () => {
  const project = createProjectForImport({
    importedFilePath: '/tmp/imports/cool clip.MP4',
    mimeType: 'video/mp4',
    probe: { width: 1920, height: 1080, fps: 30, durationSeconds: 12.5, durationFrames: 375 },
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(project.name, 'cool clip');
  assert.equal(project.assets.length, 1);
  const asset = project.assets[0];
  assert.equal(asset.type, 'video');
  assert.equal(asset.filePath, '/tmp/imports/cool clip.MP4');
  assert.equal(asset.pathMode, 'absolute');
  assert.equal(asset.duration, 375);
  assert.equal(asset.metadata.width, 1920);
  assert.equal(asset.metadata.height, 1080);
  assert.equal(asset.metadata.fps, 30);
  assert.equal(asset.metadata.mimeType, 'video/mp4');
  assert.equal(asset.metadata.importKind, 'video');
  assert.equal(project.settings.resolution.width, 1920);
  assert.equal(project.settings.frameRate, 30);
  assert.equal(project.composition.duration, 375);
  assert.equal(project.composition.tracks.length, 1);
  assert.equal(project.composition.tracks[0].clips[0].assetId, asset.id);
});

test('createProjectForImport falls back to defaults when fps is non-standard', () => {
  const project = createProjectForImport({
    importedFilePath: '/tmp/odd.mov',
    mimeType: 'video/quicktime',
    probe: { width: 1280, height: 720, fps: 29.97, durationSeconds: 3, durationFrames: 90 },
  });
  // Schema enforces fps ∈ {24, 30, 60}; 29.97 maps to the nearest (30).
  assert.equal(project.settings.frameRate, 30);
});

test('createProjectForImport keeps asset.metadata.fps in lockstep with settings.frameRate (no-stutter invariant)', () => {
  // The renderer playback loop reads project.recording.fps (sourced from
  // asset.metadata.fps) to convert video.currentTime → frame number. If that
  // value disagrees with settings.frameRate, the canvas redraw cadence and
  // the HTML5 video's native cadence drift apart and the user sees a
  // periodic stutter. Pin them equal here so a future refactor can't
  // silently regress that.
  const cases = [
    { fps: 29.97, expected: 30 },
    { fps: 60.0006, expected: 60 },
    { fps: 23.976, expected: 24 },
    { fps: 30, expected: 30 },
  ];
  for (const { fps, expected } of cases) {
    const project = createProjectForImport({
      importedFilePath: '/tmp/clip.mp4',
      mimeType: 'video/mp4',
      probe: { width: 1920, height: 1080, fps, durationSeconds: 2 },
    });
    assert.equal(project.settings.frameRate, expected, `settings.frameRate for ${fps}`);
    assert.equal(project.assets[0].metadata.fps, expected, `asset.metadata.fps for ${fps}`);
    assert.equal(project.assets[0].metadata.sourceFps, fps, `metadata.sourceFps preserved for ${fps}`);
  }
});

test('createProjectForImport handles audio with audio track and null video metadata', () => {
  const project = createProjectForImport({
    importedFilePath: '/tmp/voice.mp3',
    mimeType: 'audio/mpeg',
    probe: { durationSeconds: 8 },
  });
  assert.equal(project.assets[0].type, 'audio');
  assert.equal(project.assets[0].metadata.width, null);
  assert.equal(project.assets[0].metadata.height, null);
  assert.equal(project.assets[0].metadata.importKind, 'audio');
  assert.equal(project.composition.tracks[0].type, 'audio');
  assert.equal(project.composition.tracks[0].clips[0].sourceOut, 240); // 8s * 30fps
});

test('createProjectForImport handles images with the default 5s duration', () => {
  const project = createProjectForImport({
    importedFilePath: '/tmp/poster.png',
    mimeType: 'image/png',
    probe: { width: 800, height: 600, durationSeconds: null },
  });
  assert.equal(project.assets[0].type, 'image');
  assert.equal(project.assets[0].metadata.importKind, 'image');
  // 5 seconds at 30 fps default.
  assert.equal(project.composition.duration, 150);
});

// P-AI-C/TASK-177 — audio passthrough for video imports with embedded audio.
test('createProjectForImport emits a sibling audio asset + audio track when video probe reports hasAudio', () => {
  const project = createProjectForImport({
    importedFilePath: '/tmp/imports/with-sound.mp4',
    mimeType: 'video/mp4',
    probe: {
      width: 1920, height: 1080, fps: 30, durationSeconds: 4, durationFrames: 120,
      hasAudio: true, audioDurationSeconds: 4.02, audioSampleRate: 48000,
    },
  });

  // Two assets — video + audio — both pointing at the same source file.
  assert.equal(project.assets.length, 2);
  const [videoAsset, audioAsset] = project.assets;
  assert.equal(videoAsset.type, 'video');
  assert.equal(audioAsset.type, 'audio');
  assert.equal(videoAsset.filePath, '/tmp/imports/with-sound.mp4');
  assert.equal(audioAsset.filePath, '/tmp/imports/with-sound.mp4');
  assert.equal(audioAsset.metadata.importKind, 'video');
  assert.equal(audioAsset.metadata.sourceAssetId, videoAsset.id);
  assert.equal(audioAsset.metadata.audioSampleRate, 48000);

  // Two tracks — video + audio — each carrying its asset's clip.
  assert.equal(project.composition.tracks.length, 2);
  const trackTypes = project.composition.tracks.map((t) => t.type);
  assert.deepEqual(trackTypes, ['video', 'audio']);
  assert.equal(project.composition.tracks[1].clips[0].assetId, audioAsset.id);
});

test('createProjectForImport stays single-asset when video probe reports hasAudio:false (silent video import unchanged)', () => {
  const project = createProjectForImport({
    importedFilePath: '/tmp/silent.mp4',
    mimeType: 'video/mp4',
    probe: {
      width: 1280, height: 720, fps: 30, durationSeconds: 2, durationFrames: 60,
      hasAudio: false,
    },
  });
  assert.equal(project.assets.length, 1);
  assert.equal(project.assets[0].type, 'video');
  assert.equal(project.composition.tracks.length, 1);
});

test('createProjectForImport rejects an empty importedFilePath', () => {
  assert.throws(
    () => createProjectForImport({ importedFilePath: '', mimeType: 'video/mp4', probe: {} }),
    /importedFilePath/,
  );
});

test('pickImportProjectPath suffixes on collision and writes the .roughcut next to the source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-import-pick-'));
  try {
    const importedFilePath = join(root, 'src', 'clip.mp4');
    await writeFile(importedFilePath, Buffer.alloc(0)).catch(async () => {
      const { mkdir } = await import('node:fs/promises');
      await mkdir(join(root, 'src'), { recursive: true });
      await writeFile(importedFilePath, Buffer.alloc(0));
    });
    const recordingsDir = join(root, 'recordings');

    const first = await pickImportProjectPath({ importedFilePath, recordingsDir });
    assert.match(first, /clip\.roughcut$/);
    await writeFile(first, '{}');

    const second = await pickImportProjectPath({ importedFilePath, recordingsDir });
    assert.match(second, /clip \(2\)\.roughcut$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('saveProjectForImport writes the .roughcut and references the imported file in place', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-import-save-'));
  try {
    const importedFilePath = join(root, 'capture.mp4');
    await writeFile(importedFilePath, Buffer.alloc(0));
    const recordingsDir = join(root, 'recordings');

    const saved = await saveProjectForImport({
      importedFilePath,
      mimeType: 'video/mp4',
      probe: { width: 1920, height: 1080, fps: 30, durationSeconds: 2, durationFrames: 60 },
      recordingsDir,
    });

    assert.match(saved.path, /capture\.roughcut$/);
    assert.equal(existsSync(saved.path), true);
    // Imported file must not have been copied or moved.
    assert.equal(existsSync(importedFilePath), true);
    const reopened = await openProjectFile(saved.path);
    const asset = reopened.document.assets[0];
    assert.equal(asset.filePath, importedFilePath);
    assert.equal(asset.pathMode, 'absolute');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// --- P-AI-C/TASK-169: Blank project ---

test("createBlankProject produces a validated v13 document with empty assets/tracks", () => {
  const project = createBlankProject({ name: "Fresh start" });
  assert.equal(project.name, "Fresh start");
  assert.equal(project.assets.length, 0);
  assert.equal(project.composition.duration, 0);
  assert.equal(project.composition.tracks.length, 0);
  assert.equal(project.composition.transitions.length, 0);
  // v13 fields stay unset on a fresh project.
  assert.equal(project.transcript, undefined);
  assert.equal(project.captionTracks, undefined);
  assert.equal(project.tracks, undefined);
});

test("createBlankProject applies an aspectRatio override when provided (for TASK-170 templates)", () => {
  const project = createBlankProject({ name: "Vlog", aspectRatio: "9:16" });
  assert.equal(project.settings.aspectRatio, "9:16");
});

test("createBlankProject defaults aspectRatio to auto when not provided", () => {
  const project = createBlankProject({ name: "Untitled" });
  assert.equal(project.settings.aspectRatio, "auto");
});

test("saveBlankProject writes a unique .roughcut and round-trips through openProjectFile", async () => {
  const root = await mkdtemp(join(tmpdir(), "rough-cut-blank-"));
  try {
    const recordingsDir = join(root, "recordings");
    const first = await saveBlankProject({ recordingsDir, name: "Untitled" });
    assert.match(first.path, /Untitled\.roughcut$/);
    assert.equal(existsSync(first.path), true);

    const second = await saveBlankProject({ recordingsDir, name: "Untitled" });
    assert.match(second.path, /Untitled \(2\)\.roughcut$/);

    const reopened = await openProjectFile(first.path);
    assert.equal(reopened.document.assets.length, 0);
    assert.equal(reopened.document.composition.tracks.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
