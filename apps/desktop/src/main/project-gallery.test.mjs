import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { buildSummary, deleteProjectFiles, deriveResolutionLabel, ensureProjectThumbnail, listProjectSummaries, listRecordingProjectPaths, readProjectSummary } from './project-gallery.mjs';
import { createProjectForRecording, openProjectFile, saveProjectFile } from './project-files.mjs';

function makeRecording({ withCamera = false, fps = 30, durationSeconds = 10 } = {}) {
  const stoppedMs = Date.parse('2026-04-28T12:00:00.000Z') + durationSeconds * 1000;
  return {
    state: 'saved',
    startedAt: '2026-04-28T12:00:00.000Z',
    stoppedAt: new Date(stoppedMs).toISOString(),
    outputPath: '/tmp/gallery-fixture.mp4',
    width: 1920,
    height: 1080,
    fps,
    cursorTelemetryPath: '/tmp/gallery-fixture.cursor.json',
    cursorEvents: [],
    camera: withCamera
      ? { outputPath: '/tmp/gallery-fixture.camera.mp4', rawPath: '/tmp/gallery-fixture.camera.mkv', width: 1280, height: 720, fps, sourceInFrames: 0 }
      : null,
  };
}

test('buildSummary derives duration in ms, camera flag, and identity fields', () => {
  const project = createProjectForRecording({ recording: makeRecording({ withCamera: true, fps: 30, durationSeconds: 7 }) });
  const summary = buildSummary({ projectPath: '/some/dir/file.roughcut', document: project, modifiedAt: '2026-05-01T00:00:00.000Z' });
  assert.equal(summary.path, '/some/dir/file.roughcut');
  assert.equal(summary.hasCamera, true);
  assert.equal(summary.frameRate, 30);
  // 7 seconds * 30 fps = 210 frames -> 7000 ms
  assert.equal(summary.durationFrames, 210);
  assert.equal(summary.durationMs, 7000);
  assert.equal(summary.recordingUrl?.startsWith('media://'), true);
  assert.equal(summary.thumbnailUrl, null);
});

test('buildSummary surfaces resolution fields', () => {
  const project = createProjectForRecording({ recording: makeRecording() });
  const summary = buildSummary({ projectPath: '/x.roughcut', document: project, modifiedAt: '' });
  assert.equal(summary.width, 1920);
  assert.equal(summary.height, 1080);
  assert.equal(summary.resolutionLabel, '1080p');
});

test('deriveResolutionLabel buckets short-side into 720p/1080p/1440p/4K', () => {
  assert.equal(deriveResolutionLabel(1280, 720), '720p');
  assert.equal(deriveResolutionLabel(1920, 1080), '1080p');
  assert.equal(deriveResolutionLabel(1080, 1920), '1080p'); // vertical
  assert.equal(deriveResolutionLabel(2560, 1440), '1440p');
  assert.equal(deriveResolutionLabel(3840, 2160), '4K');
  assert.equal(deriveResolutionLabel(640, 480), '480p');
  assert.equal(deriveResolutionLabel(null, 1080), null);
  assert.equal(deriveResolutionLabel(1920, 0), null);
});

test('buildSummary reports hasCamera=false for screen-only projects', () => {
  const project = createProjectForRecording({ recording: makeRecording({ withCamera: false }) });
  const summary = buildSummary({ projectPath: '/x.roughcut', document: project, modifiedAt: '2026-05-01T00:00:00.000Z' });
  assert.equal(summary.hasCamera, false);
});

test('buildSummary uses Asset.thumbnailPath when present', () => {
  const project = createProjectForRecording({ recording: makeRecording() });
  project.assets[0] = { ...project.assets[0], thumbnailPath: '/tmp/thumb.jpg' };
  const summary = buildSummary({ projectPath: '/x.roughcut', document: project, modifiedAt: '' });
  assert.match(summary.thumbnailUrl ?? '', /^media:\/\//);
});

test('listRecordingProjectPaths returns [] for missing dir', async () => {
  const result = await listRecordingProjectPaths('/nope/does/not/exist/abcdef');
  assert.deepEqual(result, []);
});

test('listProjectSummaries scans, sorts newest-first, skips corrupt files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gallery-scan-'));
  try {
    // Older project
    const oldDoc = createProjectForRecording({
      recording: { ...makeRecording({ fps: 30, durationSeconds: 5 }), outputPath: join(dir, 'old.mp4') },
      now: new Date('2026-04-01T00:00:00.000Z'),
    });
    await saveProjectFile(join(dir, 'old.roughcut'), oldDoc);

    // Newer project
    const newDoc = createProjectForRecording({
      recording: { ...makeRecording({ fps: 60, durationSeconds: 2 }), outputPath: join(dir, 'new.mp4') },
      now: new Date('2026-05-01T00:00:00.000Z'),
    });
    await saveProjectFile(join(dir, 'new.roughcut'), newDoc);

    // Corrupt file — should be skipped, not throw
    await writeFile(join(dir, 'broken.roughcut'), '{not json');

    const errors = [];
    const summaries = await listProjectSummaries({ dir, onError: (path, err) => errors.push({ path, err }) });
    assert.equal(summaries.length, 2);
    assert.equal(summaries[0].name, 'new');
    assert.equal(summaries[1].name, 'old');
    assert.equal(errors.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readProjectSummary returns null for a missing file', async () => {
  const result = await readProjectSummary('/nope/missing.roughcut');
  assert.equal(result, null);
});

test('ensureProjectThumbnail generates a thumbnail, persists, and is idempotent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gallery-thumb-'));
  try {
    // Stand up a fake video file the asset path can point to. We never
    // actually decode it — extract is mocked — but fileExists must pass.
    const fakeVideoPath = join(dir, 'fake.mp4');
    await writeFile(fakeVideoPath, 'not really mp4');
    const projectPath = join(dir, 'fixture.roughcut');
    const project = createProjectForRecording({
      recording: { ...makeRecording({ fps: 30, durationSeconds: 4 }), outputPath: fakeVideoPath },
    });
    await saveProjectFile(projectPath, project);

    const calls = [];
    const fakeExtract = async ({ videoPath, outputPath, atSeconds }) => {
      calls.push({ videoPath, outputPath, atSeconds });
      await writeFile(outputPath, 'jpeg-bytes');
    };

    const opened = await openProjectFile(projectPath);
    const updated = await ensureProjectThumbnail({ projectPath, document: opened.document, extract: fakeExtract });
    assert.ok(updated, 'returns the updated document');
    const recordingAsset = updated.assets.find((a) => a.type === 'recording');
    assert.match(recordingAsset?.thumbnailPath ?? '', /\.thumb\.jpg$/);
    assert.equal(calls.length, 1);
    // Midpoint of 4s clip is 2s
    assert.equal(calls[0].atSeconds, 2);

    // Idempotent: thumbnail already on disk + recorded in JSON → no extraction
    const reopened = await openProjectFile(projectPath);
    const second = await ensureProjectThumbnail({ projectPath, document: reopened.document, extract: fakeExtract });
    assert.equal(second, null);
    assert.equal(calls.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('ensureProjectThumbnail returns null when ffmpeg fails (no throw)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gallery-thumb-fail-'));
  try {
    const fakeVideoPath = join(dir, 'fake.mp4');
    await writeFile(fakeVideoPath, 'not really mp4');
    const projectPath = join(dir, 'fixture.roughcut');
    const project = createProjectForRecording({
      recording: { ...makeRecording(), outputPath: fakeVideoPath },
    });
    await saveProjectFile(projectPath, project);

    const errors = [];
    const failingExtract = async () => { throw new Error('ffmpeg blew up'); };
    const opened = await openProjectFile(projectPath);
    const result = await ensureProjectThumbnail({
      projectPath,
      document: opened.document,
      extract: failingExtract,
      onError: (p, e) => errors.push({ p, msg: e.message }),
    });
    assert.equal(result, null);
    assert.equal(errors.length, 1);
    assert.match(errors[0].msg, /ffmpeg blew up/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('deleteProjectFiles removes the .roughcut and every canonical sibling', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gallery-delete-'));
  try {
    const projectPath = join(dir, 'fixture.roughcut');
    await writeFile(projectPath, '{}');
    // Drop the canonical siblings on disk and confirm they're all removed.
    // .bak / .tmp are APPENDED to the full project path; media siblings
    // REPLACE the .roughcut extension with their own.
    const siblings = [
      `${projectPath}.bak`,
      `${projectPath}.tmp`,
      join(dir, 'fixture.thumb.jpg'),
      join(dir, 'fixture.mp4'),
      join(dir, 'fixture.mkv'),
      join(dir, 'fixture.cursor.json'),
      join(dir, 'fixture.events.log'),
    ];
    await Promise.all(siblings.map((path) => writeFile(path, 'x')));

    const result = await deleteProjectFiles(projectPath);
    assert.equal(result.removed.includes(projectPath), true);
    assert.equal(existsSync(projectPath), false, 'main project file removed');
    for (const sibling of siblings) {
      assert.equal(existsSync(sibling), false, `sibling removed: ${sibling}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('deleteProjectFiles does not throw when siblings are missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gallery-delete-sparse-'));
  try {
    const projectPath = join(dir, 'sparse.roughcut');
    await writeFile(projectPath, '{}');
    const result = await deleteProjectFiles(projectPath);
    assert.equal(result.removed.includes(projectPath), true);
    assert.equal(existsSync(projectPath), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('deleteProjectFiles tolerates a missing .roughcut (idempotent retry)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gallery-delete-noop-'));
  try {
    const projectPath = join(dir, 'gone.roughcut');
    // No file on disk to begin with — second run after a successful delete
    // should not throw.
    const result = await deleteProjectFiles(projectPath);
    assert.deepEqual(result, { removed: [projectPath] });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('ensureProjectThumbnail skips when source video is missing', async () => {
  const project = createProjectForRecording({ recording: { ...makeRecording(), outputPath: '/nope/missing.mp4' } });
  const result = await ensureProjectThumbnail({ projectPath: '/tmp/x.roughcut', document: project, extract: async () => { throw new Error('should not be called'); } });
  assert.equal(result, null);
});
