import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAsset, createClip, createProject, createTrack, PROJECT_ASPECT_RATIO_LABELS } from '../../../../packages/project-model/dist/index.js';
import { createFreecutHost, describeStyledProgram, findCompletedStyledCache, fromFreecutProject, toFreecutProject } from './freecut-host.mjs';
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
  // Every project now presents its composited program as the clip's media, so
  // the Editor plays the same picture Recording edit shows.
  assert.equal(snapshot.projects[0].timeline.items[0].mediaId, `${asset.id}__program`);
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
// The fingerprint above only invalidates if the lookup respects it. This scan
// used to fall back to "newest <projectId>-*-web.mp4 regardless of fingerprint",
// which defeated invalidation entirely: a real project was serving the Editor a
// render from a different edit state, days old, and would have forever.
// ---------------------------------------------------------------------------

test('a render from a different edit state is not served', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'freecut-cache-'));
  await writeFile(join(dir, 'proj-1-aaaaaaaaaaaaaaaa-web.mp4'), 'stale render');
  const wanted = join(dir, 'proj-1-bbbbbbbbbbbbbbbb-web.mp4');
  assert.equal(await findCompletedStyledCache(wanted, 'proj-1'), null);
});

test('the render matching the current edit state is served', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'freecut-cache-'));
  const wanted = join(dir, 'proj-1-bbbbbbbbbbbbbbbb-web.mp4');
  await writeFile(wanted, 'current render');
  assert.equal(await findCompletedStyledCache(wanted, 'proj-1'), wanted);
});

test('an empty render file is not treated as a cache hit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'freecut-cache-'));
  const wanted = join(dir, 'proj-1-bbbbbbbbbbbbbbbb-web.mp4');
  await writeFile(wanted, '');
  assert.equal(await findCompletedStyledCache(wanted, 'proj-1'), null);
});

// ---------------------------------------------------------------------------
// Serving media must never start a render. Not one render, not a single-flight
// render, none.
//
// `resolveMedia` runs on every HTTP Range request a <video> element makes.
// Rendering here once cost 9 ffmpeg processes in 3 seconds, 76GB RAM and 31GB
// swap; making it single-flight only reduced that to one full-length export per
// project, which still put ffmpeg on the machine merely because someone opened
// the Editor. The duration of the recording is beside the point — a preview must
// never wait on an encode at all. Rough Cut's compositor draws the picture live
// from the raw media, so the program request only owes the Editor decodable
// frames of the right length, and the raw recording already is that.
// ---------------------------------------------------------------------------

async function styledProgramFixture({ onExport, duration = 90 } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-styled-'));
  const mediaPath = join(root, 'recording.mp4');
  await writeFile(mediaPath, 'fixture');
  const projectPath = join(root, 'demo.roughcut');
  const asset = createAsset('recording', mediaPath, {
    duration,
    metadata: { width: 1920, height: 1080, fps: 30 },
  });
  const track = createTrack('video', { name: 'Screen Recording', index: 0 });
  const clip = createClip(asset.id, track.id, {
    timelineIn: 0, timelineOut: duration, sourceIn: 0, sourceOut: duration,
  });
  const document = createProject({
    id: 'rough-cut-styled',
    name: 'Styled project',
    assets: [asset],
    composition: { duration, tracks: [{ ...track, clips: [clip] }], transitions: [] },
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

test('a burst of media requests starts no render at all', async () => {
  const { host, document, calls, programAssetId } = await styledProgramFixture();

  const results = await Promise.all(
    Array.from({ length: 9 }, () => host.resolveMedia(document.id, programAssetId)),
  );

  assert.equal(calls.length, 0, `expected 0 renders, got ${calls.length}`);
  for (const result of results) assert.ok(result?.path, 'every caller should still receive playable media');
  assert.equal(new Set(results.map((r) => r.path)).size, 1);
});

test('the program resolves to the raw recording, instantly and without encoding', async () => {
  const { root, host, document, calls, programAssetId } = await styledProgramFixture();
  const result = await host.resolveMedia(document.id, programAssetId);

  assert.equal(result?.path, join(root, 'recording.mp4'));
  assert.equal(calls.length, 0);
});

test('serving the program writes nothing to disk', async () => {
  const { root, host, document, programAssetId } = await styledProgramFixture();
  await host.resolveMedia(document.id, programAssetId);
  await host.resolveMedia(document.id, programAssetId);

  // No cache directory, no partials, no locks: nothing was produced.
  const cacheDir = join(root, '.roughcut-freecut-cache');
  const entries = await readdir(cacheDir).catch(() => []);
  assert.deepEqual(entries, [], `serving media created files: ${entries.join(', ')}`);
});

test('the length of the recording changes nothing about what is served', async () => {
  // A ten-hour project must behave exactly like a ninety-frame one: no encode,
  // immediate answer. Duration is metadata here, so this is a fair stand-in.
  const { root, host, document, calls, programAssetId } = await styledProgramFixture({
    duration: 30 * 60 * 60 * 10,
  });
  const startedAt = Date.now();
  const result = await host.resolveMedia(document.id, programAssetId);
  assert.equal(result?.path, join(root, 'recording.mp4'));
  assert.equal(calls.length, 0);
  assert.ok(Date.now() - startedAt < 2000, 'resolving media must not wait on anything');
});

// ---------------------------------------------------------------------------
// Handing back the raw recording used to be wrong: the Editor drew its own
// picture from it, so the user saw unstyled footage with no camera PiP, zoom or
// cursor. That is no longer how the picture gets drawn — Rough Cut's compositor
// paints the Editor's viewer from the live project, so the raw file is only ever
// a decode surface behind it, and never showing the user a stale render is worth
// far more than the Editor's internal filmstrips being unstyled.
// ---------------------------------------------------------------------------

async function largeSourceFixture() {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-rawfallback-'));
  const mediaPath = join(root, 'recording.mp4');
  await writeFile(mediaPath, Buffer.alloc(2 * 1024 * 1024, 1));
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
    id: 'rough-cut-rawfallback',
    name: 'Raw fallback project',
    assets: [asset],
    composition: { duration: 90, tracks: [{ ...track, clips: [clip] }], transitions: [] },
  });
  await saveProjectFile(projectPath, document);

  const host = createFreecutHost({
    recordingsDir: root,
    allowedRoots: [root],
    // Produces no file: reproduces "the styled render is not ready yet"
    // without ever spawning ffmpeg.
    async exportStyledProgram() {},
  });
  host.registerProjectPath(projectPath);
  return { host, document, asset, mediaPath };
}

test('the program serves the raw recording rather than waiting on a render', async () => {
  const { host, document, asset, mediaPath } = await largeSourceFixture();
  const served = await host.resolveMedia(document.id, `${asset.id}__program`);
  assert.equal(served?.path, mediaPath, 'the Editor must never be made to wait on an encode');
});

test('a raw asset requested by its own id still resolves', async () => {
  const { host, document, asset, mediaPath } = await largeSourceFixture();
  const served = await host.resolveMedia(document.id, asset.id);
  assert.equal(served?.path, mediaPath);
});

// ---------------------------------------------------------------------------
// The styled program is the whole composited picture — it already contains the
// camera PiP, background, zoom and cursor (see the camera_scaled overlay in
// export-service). Seeding the camera as its own item on top of it draws the
// camera twice. Measured on a real project: 2 items, the screen one carrying
// the program src and the camera one falling through to its raw file.
//
// Note the shape: mediaId stays the editable source asset and `src` carries the
// composed preview. FreeCut's resolveMediaUrls explicitly preserves a
// /__rough_cut__/ src instead of re-resolving it, so this is the supported path
// and no synthetic media-library entry is needed.
// ---------------------------------------------------------------------------

test('the Editor is seeded with the program alone, not program plus raw camera', () => {
  const doc = {
    id: 'p1',
    settings: { frameRate: 30 },
    assets: [
      { id: 'screen', type: 'recording', filePath: '/tmp/s.mkv', duration: 300 },
      { id: 'camera', type: 'video', filePath: '/tmp/c.mkv', duration: 300 },
    ],
    composition: {
      duration: 300,
      tracks: [
        { id: 't1', type: 'video', clips: [{ id: 'c1', assetId: 'screen', timelineIn: 0, timelineOut: 300 }] },
        { id: 't2', type: 'video', clips: [{ id: 'c2', assetId: 'camera', timelineIn: 0, timelineOut: 300 }] },
      ],
      transitions: [],
    },
  };
  const styled = { mediaId: 'screen__program', outputPath: '/tmp/x.mp4', sourceAssetId: 'screen' };
  const fc = toFreecutProject(doc, '/tmp/p.roughcut', styled);

  assert.equal(fc.timeline.items.length, 1, 'the camera must not be drawn a second time');
  // mediaId, not just src: the preview resolves by id and ignores src.
  assert.equal(fc.timeline.items[0].mediaId, 'screen__program');
  assert.match(fc.timeline.items[0].src, /__rough_cut__\/media\/p1\/screen__program/);
  assert.ok(fc.media.some((m) => m.id === 'screen__program'), 'the program must be resolvable media');
});

test('the collapsed feed leaves no empty camera track beside it', () => {
  const doc = {
    id: 'p1',
    settings: { frameRate: 30 },
    assets: [
      { id: 'screen', type: 'recording', filePath: '/tmp/s.mkv', duration: 300 },
      { id: 'camera', type: 'video', filePath: '/tmp/c.mkv', duration: 300 },
    ],
    composition: {
      duration: 300,
      tracks: [
        { id: 't1', type: 'video', clips: [{ id: 'c1', assetId: 'screen', timelineIn: 0, timelineOut: 300 }] },
        { id: 't2', type: 'video', clips: [{ id: 'c2', assetId: 'camera', timelineIn: 0, timelineOut: 300 }] },
      ],
      transitions: [],
    },
  };
  const styled = { mediaId: 'screen__program', outputPath: '/tmp/x.mp4', sourceAssetId: 'screen' };
  const fc = toFreecutProject(doc, '/tmp/p.roughcut', styled);
  assert.equal(fc.timeline.tracks.length, 1, 'the emptied camera track must not be sent');
});

// The camera and audio are baked into the rendered program, so the collapsed
// timeline has no items for them. Mapping its tracks back to the composition
// would write empty clip lists and delete the camera from the user's project.
test('saving the collapsed feed does not delete the camera from the project', () => {
  const original = {
    id: 'p1',
    name: 'Original',
    settings: { frameRate: 30 },
    assets: [
      { id: 'screen', type: 'recording', filePath: '/tmp/s.mkv', duration: 300 },
      { id: 'camera', type: 'video', filePath: '/tmp/c.mkv', duration: 300 },
    ],
    composition: {
      duration: 300,
      tracks: [
        { id: 't1', type: 'video', clips: [{ id: 'c1', assetId: 'screen', timelineIn: 0, timelineOut: 300 }] },
        { id: 't2', type: 'video', clips: [{ id: 'c2', assetId: 'camera', timelineIn: 0, timelineOut: 300 }] },
      ],
      transitions: [],
    },
  };
  const styled = { mediaId: 'screen__program', outputPath: '/tmp/x.mp4', sourceAssetId: 'screen' };
  const collapsed = toFreecutProject(original, '/tmp/p.roughcut', styled);

  const saved = fromFreecutProject(collapsed, original);
  assert.equal(saved.composition.tracks.length, 2, 'both tracks must survive');
  assert.equal(saved.composition.tracks[1].clips.length, 1, 'the camera clip must survive');
  assert.equal(saved.composition.tracks[1].clips[0].assetId, 'camera');
});

test('without a styled program every clip is still seeded', () => {
  const doc = {
    id: 'p1',
    settings: { frameRate: 30 },
    assets: [
      { id: 'screen', type: 'recording', filePath: '/tmp/s.mkv', duration: 300 },
      { id: 'camera', type: 'video', filePath: '/tmp/c.mkv', duration: 300 },
    ],
    composition: {
      duration: 300,
      tracks: [
        { id: 't1', type: 'video', clips: [{ id: 'c1', assetId: 'screen', timelineIn: 0, timelineOut: 300 }] },
        { id: 't2', type: 'video', clips: [{ id: 'c2', assetId: 'camera', timelineIn: 0, timelineOut: 300 }] },
      ],
      transitions: [],
    },
  };
  assert.equal(toFreecutProject(doc, '/tmp/p.roughcut', null).timeline.items.length, 2);
});

// ---------------------------------------------------------------------------
// Rough Cut's element vocabulary is a closed set (cursor, click, camera-pip,
// zoom, annotation, stabilization) with no text, title or transition, so
// rebuilding the timeline from the composition silently deleted anything the
// Editor added. Measured on a real project: title text, element id and marker
// all gone; only an empty track survived.
//
// A side-car region is not enough. FreeCut's hydrateTimelineStoresFromProject
// rebuilds its stores from project.timeline.tracks/.items, so if we kept
// regenerating that from the composition the title would vanish on next open
// regardless. The stored FreeCut timeline has to be authoritative for
// tracks/items; the composition only seeds a project FreeCut never opened.
// ---------------------------------------------------------------------------

test('an element added in the Editor survives a save and reload', () => {
  const original = {
    id: 'p1',
    settings: { frameRate: 30 },
    assets: [],
    composition: { duration: 300, tracks: [], transitions: [] },
  };
  const edited = {
    id: 'p1',
    duration: 300,
    timeline: {
      tracks: [{ id: 'titles', name: 'Titles', kind: 'video', order: 0 }],
      items: [{
        id: 'title-1', trackId: 'titles', type: 'text',
        from: 0, durationInFrames: 60, label: 'MY NEW TITLE', text: 'Hello',
      }],
      markers: [{ id: 'm1', frame: 30, label: 'note' }],
      transitions: [],
    },
  };

  const saved = fromFreecutProject(edited, original);
  const flat = JSON.stringify(saved);
  assert.ok(flat.includes('MY NEW TITLE'), 'title text must survive the save');
  assert.ok(flat.includes('title-1'), 'element id must survive the save');
  assert.ok(flat.includes('"m1"'), 'marker must survive the save');

  const reopened = toFreecutProject(saved, '/tmp/p.roughcut', null);
  assert.ok(reopened.timeline.items.some((item) => item.id === 'title-1'), 'title must come back on reload');
  assert.equal(reopened.timeline.markers.length, 1);
});

// The in-memory round trip above proves the mapping. This proves the field
// actually survives being written to disk — the project schema strips keys it
// does not declare, so an undeclared passthrough would vanish on save with the
// mapping still looking correct in unit tests.
test('an element added in the Editor survives being written to disk', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-passthrough-'));
  const projectPath = join(root, 'demo.roughcut');
  const document = createProject({ id: 'passthrough-demo', name: 'Passthrough demo' });
  await saveProjectFile(projectPath, document);

  const host = createFreecutHost({ recordingsDir: root, allowedRoots: [root] });
  host.registerProjectPath(projectPath);

  const freecut = toFreecutProject(document, projectPath);
  freecut.timeline = {
    tracks: [{ id: 'titles', name: 'Titles', kind: 'video', order: 0 }],
    items: [{ id: 'title-1', trackId: 'titles', type: 'text', from: 0, durationInFrames: 60, label: 'MY NEW TITLE' }],
    markers: [{ id: 'm1', frame: 30, label: 'note' }],
    transitions: [],
  };
  await host.saveProject(freecut);

  const snapshot = await host.getSnapshot();
  const reopened = snapshot.projects.find((candidate) => candidate.id === document.id);
  assert.ok(reopened, 'the project must still be readable after the save');
  assert.ok(
    reopened.timeline.items.some((item) => item.label === 'MY NEW TITLE'),
    'the title must come back from disk, not just from memory',
  );
});

test('a project FreeCut has never opened is still seeded from the composition', () => {
  const doc = {
    id: 'p2',
    settings: { frameRate: 30 },
    assets: [{ id: 'screen', type: 'recording', filePath: '/tmp/s.mkv', duration: 300 }],
    composition: {
      duration: 300,
      tracks: [{ id: 't1', type: 'video', clips: [{ id: 'c1', assetId: 'screen', timelineIn: 0, timelineOut: 300 }] }],
      transitions: [],
    },
  };
  const fc = toFreecutProject(doc, '/tmp/p2.roughcut', null);
  assert.equal(fc.timeline.items.length, 1);
  assert.equal(fc.timeline.items[0].mediaId, 'screen');
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

  // The program must be BOTH the item's mediaId and a media-library entry: the
  // Editor's preview resolves strictly by mediaId and ignores src, so the old
  // shape (mediaId = raw asset, src = program) silently played the raw screen.
  assert.equal(freecut.timeline.items[0].mediaId, 'asset__program');
  assert.match(freecut.timeline.items[0].src, /__rough_cut__\/media\/project\/asset__program/);
  assert.equal(freecut.media.some((item) => item.id === 'asset__program'), true);
  assert.deepEqual(freecut.timeline.transitions, transitions);
  assert.deepEqual(freecut.timeline.items[0].effects, effects);
  assert.deepEqual(freecut.timeline.items[0].keyframes, keyframes);

  const saved = fromFreecutProject(freecut, original);
  assert.deepEqual(saved.composition.transitions, transitions);
  assert.deepEqual(saved.composition.tracks[0].clips[0].effects, effects);
  assert.deepEqual(saved.composition.tracks[0].clips[0].keyframes, keyframes);
});

// ---------------------------------------------------------------------------
// The frame belongs to the project, not to a view. Recording edit offers wide,
// vertical, square, classic, tall and portrait, and the compositor cuts the
// program to whichever is chosen — so the Editor, which is a second window onto
// that same program, must open on the same frame. Handing it the source
// recording's size instead left a vertical project on a 16:9 viewer with the
// picture letterboxed inside it.
// ---------------------------------------------------------------------------
test('the Editor canvas is the frame the project was cut to, not the source recording size', () => {
  const base = createProject({ id: 'aspect-demo', name: 'Aspect demo' });
  const from = (aspectRatio) => toFreecutProject(
    {
      ...base,
      settings: { ...base.settings, resolution: { width: 1920, height: 1080 }, aspectRatio },
    },
    '/tmp/aspect.roughcut',
  ).metadata;

  // Every frame Recording edit offers, not a sample: a ratio missing here is a
  // project that opens in the Editor on the wrong frame.
  const expected = {
    '16:9': { width: 1920, height: 1080 },
    '9:16': { width: 1080, height: 1920 },
    '1:1': { width: 1920, height: 1920 },
    '4:3': { width: 1920, height: 1440 },
    '3:4': { width: 1440, height: 1920 },
    '4:5': { width: 1536, height: 1920 },
    // 'auto' keeps the recording's own shape, so a 16:9 source opens wide.
    auto: { width: 1920, height: 1080 },
  };
  assert.deepEqual(Object.keys(expected).sort(), Object.keys(PROJECT_ASPECT_RATIO_LABELS).sort());
  for (const [ratio, size] of Object.entries(expected)) {
    const canvas = from(ratio);
    assert.deepEqual({ width: canvas.width, height: canvas.height }, size, `${ratio} opens on the wrong frame`);
  }
});

test('the program the Editor plays is described at the project frame, not the source frame', () => {
  const base = createProject({ id: 'program-aspect', name: 'Program aspect' });
  const asset = createAsset('recording', '/tmp/screen.mkv', {
    duration: 90,
    metadata: { width: 1920, height: 1080, fps: 30 },
  });
  const track = createTrack('video', { name: 'Screen Recording', index: 0 });
  const clip = createClip(asset.id, track.id, { timelineIn: 0, timelineOut: 90, sourceIn: 0, sourceOut: 90 });
  const document = {
    ...base,
    settings: { ...base.settings, resolution: { width: 1920, height: 1080 }, aspectRatio: '9:16' },
    assets: [asset],
    composition: { duration: 90, tracks: [{ ...track, clips: [clip] }], transitions: [] },
  };

  const freecut = toFreecutProject(document, '/tmp/program-aspect.roughcut', {
    mediaId: `${asset.id}__program`,
    sourceAssetId: asset.id,
  });
  const program = freecut.media.find((item) => item.id === `${asset.id}__program`);
  assert.ok(program, 'the composited program must be in the media library');
  assert.deepEqual({ width: program.width, height: program.height }, { width: 1080, height: 1920 });
  // The raw source asset keeps its own native size — it is not the composite.
  const source = freecut.media.find((item) => item.id === asset.id);
  assert.deepEqual({ width: source.width, height: source.height }, { width: 1920, height: 1080 });
});
