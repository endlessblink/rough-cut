import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAsset, createClip, createProject, createTrack } from '../../../../packages/project-model/dist/index.js';
import { createFreecutHost, describeStyledProgram, fromFreecutProject, toFreecutProject } from './freecut-host.mjs';
import { saveProjectFile } from './project-files.mjs';

test('FreeCut host exposes Rough Cut projects, tracks, clips, and media URLs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-freecut-host-'));
  const mediaPath = join(root, 'recording.mp4');
  await writeFile(mediaPath, 'fixture');
  const projectPath = join(root, 'demo.roughcut');
  const asset = createAsset('recording', mediaPath, {
    duration: 90,
    metadata: { width: 1920, height: 1080, fps: 30 },
  });
  const track = createTrack('video', { name: 'Screen Recording', index: 0 });
  const clip = createClip(asset.id, track.id, {
    timelineIn: 0,
    timelineOut: 90,
    sourceIn: 0,
    sourceOut: 90,
  });
  const document = createProject({
    id: 'rough-cut-demo',
    name: 'Demo project',
    assets: [asset],
    composition: { duration: 90, tracks: [{ ...track, clips: [clip] }], transitions: [] },
  });
  await saveProjectFile(projectPath, document);

  const host = createFreecutHost({ recordingsDir: root, allowedRoots: [root] });
  const snapshot = await host.getSnapshot();
  assert.equal(snapshot.projects.length, 1);
  assert.equal(snapshot.projects[0].id, document.id);
  assert.equal(snapshot.projects[0].timeline.items[0].mediaId, asset.id);
  assert.match(snapshot.projects[0].media[0].roughCutUrl, /__rough_cut__\/media/);
  assert.deepEqual(await host.resolveMedia(document.id, asset.id), {
    path: mediaPath,
    size: 7,
    mimeType: 'video/mp4',
  });
});

// ---------------------------------------------------------------------------
// The styled render's cache key decides when a full-length export is paid for
// again. Keying it on `modifiedAt` meant a rename or a transcript edit — neither
// of which changes a pixel — invalidated the whole recording's render.
// ---------------------------------------------------------------------------

const styledKeyFixture = {
  id: 'p1',
  modifiedAt: '2026-01-01T00:00:00.000Z',
  assets: [{ id: 'screen', type: 'recording', filePath: '/tmp/s.mkv' }],
  composition: { duration: 300, tracks: [] },
  settings: { frameRate: 30 },
};

test('a save that does not change the picture keeps the same styled render', () => {
  const before = describeStyledProgram(styledKeyFixture, '/tmp/p.roughcut');
  const renamed = { ...styledKeyFixture, name: 'New name', modifiedAt: '2026-06-06T00:00:00.000Z' };
  const after = describeStyledProgram(renamed, '/tmp/p.roughcut');
  assert.equal(before.outputPath, after.outputPath);
});

test('a composition edit produces a different styled render', () => {
  const before = describeStyledProgram(styledKeyFixture, '/tmp/p.roughcut');
  const edited = { ...styledKeyFixture, composition: { duration: 200, tracks: [] } };
  assert.notEqual(before.outputPath, describeStyledProgram(edited, '/tmp/p.roughcut').outputPath);
});

test('a settings edit produces a different styled render', () => {
  const before = describeStyledProgram(styledKeyFixture, '/tmp/p.roughcut');
  const edited = { ...styledKeyFixture, settings: { frameRate: 60 } };
  assert.notEqual(before.outputPath, describeStyledProgram(edited, '/tmp/p.roughcut').outputPath);
});

// ---------------------------------------------------------------------------
// Styled program renders must be single-flight.
//
// `resolveMedia` runs on every HTTP Range request a <video> element makes. Before
// these guards, each request that missed the cache started its own full ffmpeg
// render: 9 processes in 3 seconds, 76GB RAM and 31GB swap, twice in one day.
// ---------------------------------------------------------------------------

async function styledProgramFixture({ onExport } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-styled-'));
  const mediaPath = join(root, 'recording.mp4');
  await writeFile(mediaPath, 'fixture');
  const projectPath = join(root, 'demo.roughcut');
  const asset = createAsset('recording', mediaPath, {
    duration: 90,
    metadata: { width: 1920, height: 1080, fps: 30 },
  });
  const track = createTrack('video', { name: 'Screen Recording', index: 0 });
  const clip = createClip(asset.id, track.id, {
    timelineIn: 0, timelineOut: 90, sourceIn: 0, sourceOut: 90,
  });
  const document = createProject({
    id: 'rough-cut-styled',
    name: 'Styled project',
    assets: [asset],
    composition: { duration: 90, tracks: [{ ...track, clips: [clip] }], transitions: [] },
  });
  await saveProjectFile(projectPath, document);

  const calls = [];
  const host = createFreecutHost({
    recordingsDir: root,
    allowedRoots: [root],
    async exportStyledProgram({ outputPath, signal }) {
      calls.push(outputPath);
      if (onExport) await onExport({ outputPath, signal });
      else await writeFile(outputPath, 'rendered program');
    },
  });
  host.registerProjectPath(projectPath);
  return { root, host, document, asset, calls, programAssetId: `${asset.id}__program` };
}

test('concurrent media requests for one clip trigger exactly one styled render', async () => {
  const { host, document, calls, programAssetId } = await styledProgramFixture({
    // Hold the render open so all nine requests are genuinely in flight at once,
    // which is what the real Range-request burst does.
    async onExport({ outputPath }) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await writeFile(outputPath, 'rendered program');
    },
  });

  const results = await Promise.all(
    Array.from({ length: 9 }, () => host.resolveMedia(document.id, programAssetId)),
  );

  assert.equal(calls.length, 1, `expected 1 render, got ${calls.length}`);
  for (const result of results) assert.ok(result?.path, 'every caller should receive the rendered media');
  assert.equal(new Set(results.map((r) => r.path)).size, 1);
});

test('a completed styled render is reused instead of re-rendered', async () => {
  const { host, document, calls, programAssetId } = await styledProgramFixture();
  await host.resolveMedia(document.id, programAssetId);
  await host.resolveMedia(document.id, programAssetId);
  await host.resolveMedia(document.id, programAssetId);
  assert.equal(calls.length, 1);
});

test('styled renders publish atomically and leave no partial behind', async () => {
  const { root, host, document, calls, programAssetId } = await styledProgramFixture();
  const result = await host.resolveMedia(document.id, programAssetId);

  // The render wrote to a partial path, not straight to the published name.
  assert.notEqual(calls[0], result.path);
  assert.match(calls[0], /\.partial-\d+\.mp4$/);

  const cacheDir = join(root, '.roughcut-freecut-cache');
  const leftovers = (await readdir(cacheDir)).filter((name) => name.includes('.partial') || name.endsWith('.lock'));
  assert.deepEqual(leftovers, [], `partial/lock files left behind: ${leftovers.join(', ')}`);
  assert.ok((await stat(result.path)).size > 0);
});

test('a failed styled render publishes nothing and falls back to raw media', async () => {
  const { root, host, document, programAssetId } = await styledProgramFixture({
    async onExport() { throw new Error('ffmpeg died'); },
  });

  assert.equal(await host.resolveMedia(document.id, programAssetId), null);

  // Critically: no half-written file that a later request would read as a cache hit.
  const cacheDir = join(root, '.roughcut-freecut-cache');
  const entries = await readdir(cacheDir).catch(() => []);
  assert.deepEqual(entries, [], `failed render left files behind: ${entries.join(', ')}`);
});

test('a lock held by a live process blocks a second render rather than duplicating it', async () => {
  const { root, host, document, calls, programAssetId } = await styledProgramFixture();
  const cacheDir = join(root, '.roughcut-freecut-cache');
  await mkdir(cacheDir, { recursive: true });

  // Simulate the other app instance that was running during the real incident.
  const [entry] = await readdir(root).then((names) => names.filter((n) => n.endsWith('.roughcut')));
  assert.ok(entry);
  const lockTarget = await host.resolveMedia(document.id, programAssetId);
  assert.ok(lockTarget?.path);
  const renders = calls.length;

  await writeFile(`${lockTarget.path}.lock`, JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
  await writeFile(lockTarget.path, ''); // truncate so the fast path misses

  // Bound the wait so the test does not sit for the production timeout.
  process.env.ROUGH_CUT_STYLED_WAIT_MS = '300';
  const result = await host.resolveMedia(document.id, programAssetId);
  delete process.env.ROUGH_CUT_STYLED_WAIT_MS;

  assert.equal(result, null, 'a contended render should report unavailable, not render again');
  assert.equal(calls.length, renders, 'no second render may start while the lock is held');
});

test('FreeCut host saves timeline edits back without dropping Rough Cut fields', () => {
  const original = {
    id: 'project',
    name: 'Original',
    assets: [{ id: 'asset', filePath: '/tmp/video.mp4', duration: 100 }],
    composition: {
      duration: 100,
      tracks: [{ id: 'track', type: 'video', name: 'Video', clips: [], customField: true }],
      transitions: [],
    },
    settings: { resolution: { width: 1920, height: 1080 }, frameRate: 30 },
    customProjectField: 'preserved',
  };
  const edited = toFreecutProject(original, '/tmp/project.roughcut');
  edited.timeline.items = [{
    id: 'clip', trackId: 'track', from: 10, durationInFrames: 20,
    label: 'edited', mediaId: 'asset', type: 'video', sourceStart: 2, sourceEnd: 22,
  }];
  const saved = fromFreecutProject(edited, original);
  assert.equal(saved.customProjectField, 'preserved');
  assert.equal(saved.composition.tracks[0].customField, true);
  assert.equal(saved.composition.tracks[0].clips[0].timelineIn, 10);
  assert.equal(saved.composition.tracks[0].clips[0].sourceOut, 22);
});

test('FreeCut uses shared source assets and preserves compositor timeline metadata', () => {
  const transitions = [{
    id: 'transition-1', type: 'crossfade', clipAId: 'clip-a', clipBId: 'clip-b',
    duration: 12, params: { curve: 'smooth' }, easing: 'ease-in-out',
  }];
  const effects = [{
    id: 'effect-1', effectType: 'blur', enabled: true, params: { radius: 4 }, keyframes: [],
  }];
  const keyframes = [{
    property: 'opacity', keyframes: [{ frame: 0, value: 1, easing: 'linear' }],
  }];
  const original = {
    id: 'project',
    name: 'Shared project',
    assets: [{ id: 'asset', filePath: '/tmp/video.mp4', duration: 100 }],
    composition: {
      duration: 100,
      tracks: [{
        id: 'track', type: 'video', name: 'Video', index: 0, clips: [{
          id: 'clip-a', assetId: 'asset', trackId: 'track', timelineIn: 0, timelineOut: 100,
          sourceIn: 0, sourceOut: 100, effects, keyframes,
        }],
      }],
      transitions,
    },
    settings: { resolution: { width: 1920, height: 1080 }, frameRate: 30 },
  };
  const freecut = toFreecutProject(original, '/tmp/project.roughcut', {
    mediaId: 'asset__program',
    sourceAssetId: 'asset',
  });

  assert.equal(freecut.timeline.items[0].mediaId, 'asset');
  assert.match(freecut.timeline.items[0].src, /__rough_cut__\/media\/project\/asset__program/);
  assert.equal(freecut.media.some((item) => item.id.endsWith('__program')), false);
  assert.deepEqual(freecut.timeline.transitions, transitions);
  assert.deepEqual(freecut.timeline.items[0].effects, effects);
  assert.deepEqual(freecut.timeline.items[0].keyframes, keyframes);

  const saved = fromFreecutProject(freecut, original);
  assert.deepEqual(saved.composition.transitions, transitions);
  assert.deepEqual(saved.composition.tracks[0].clips[0].effects, effects);
  assert.deepEqual(saved.composition.tracks[0].clips[0].keyframes, keyframes);
});
