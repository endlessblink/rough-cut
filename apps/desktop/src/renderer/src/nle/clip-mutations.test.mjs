import test from 'node:test';
import assert from 'node:assert/strict';
import { createAsset, createProject } from '@rough-cut/project-model';
import { addGeneratedAssetToTrack, canSplitClipById, moveClipById, removeClipById, reorderTrackById, rightClipIdAfterSplit, splitClipById, trimClipById, updateTrackById } from './clip-mutations.mjs';

const asset = createAsset('video', '/tmp/a1.mp4', { id: 'a1', duration: 600 });
const cameraAsset = createAsset('video', '/tmp/cam.mp4', { id: 'cam1', duration: 600 });

const baseClip = {
  id: 'c1',
  source: { kind: 'project-asset', id: asset.id },
  timelineIn: 0,
  timelineOut: 300,
  sourceIn: 0,
  sourceOut: 300,
};

function track(overrides = {}) {
  return {
    id: 't1',
    kind: 'video',
    index: 0,
    label: 'Video',
    enabled: true,
    locked: false,
    muted: false,
    clips: [baseClip],
    ...overrides,
  };
}

function makeProject(tracks = [track()], assets = [asset]) {
  const document = createProject({
    assets,
    composition: { duration: 600, tracks: [], transitions: [] },
    tracks,
  });
  return { path: '/tmp/p.roughcut', document };
}

test('removeClipById removes clips from canonical timeline only', () => {
  const project = makeProject([track({ clips: [baseClip, { ...baseClip, id: 'c2', timelineIn: 300, timelineOut: 600, sourceIn: 0, sourceOut: 300 }] })]);
  const next = removeClipById(project, 'c1');

  assert.notEqual(next, project);
  assert.deepEqual(next.document.timeline.tracks[0].clips.map((clip) => clip.id), ['c2']);
  assert.deepEqual(next.document.tracks[0].clips.map((clip) => clip.id), ['c1', 'c2'], 'legacy mirror is not rewritten');
});

test('removeClipById returns the SAME project reference when clip is not found', () => {
  const project = makeProject();
  assert.equal(removeClipById(project, 'nonexistent'), project);
});

test('splitClipById uses the command service and preserves half-open continuity', () => {
  const project = makeProject();
  const next = splitClipById(project, 'c1', 100);
  const clips = next.document.timeline.tracks[0].clips;

  assert.equal(clips.length, 2);
  assert.deepEqual(clips.map((clip) => [clip.timelineIn, clip.timelineOut, clip.sourceIn, clip.sourceOut]), [
    [0, 100, 0, 100],
    [100, 300, 100, 300],
  ]);
  assert.notEqual(clips[0].id, 'c1');
  assert.notEqual(clips[1].id, 'c1');
  assert.equal(rightClipIdAfterSplit(next, 'c1', 100), clips[1].id);
});

test('splitClipById splits linked clips at the same timeline frame', () => {
  const project = makeProject([
    track({ id: 'screen-track', clips: [{ ...baseClip, id: 'screen', source: { kind: 'project-asset', id: asset.id }, timelineIn: 0, timelineOut: 200, sourceIn: 20, sourceOut: 220 }] }),
    track({ id: 'camera-track', index: 1, clips: [{ ...baseClip, id: 'camera', source: { kind: 'project-asset', id: cameraAsset.id }, timelineIn: 0, timelineOut: 200, sourceIn: 40, sourceOut: 240 }] }),
  ], [asset, cameraAsset]);
  const document = {
    ...project.document,
    timeline: {
      ...project.document.timeline,
      linkedGroups: [{ id: 'linked-1', kind: 'manual-sync', sourceIds: [`source:${asset.id}`, `source:${cameraAsset.id}`], primarySourceId: `source:${asset.id}`, syncPolicy: 'frame-locked' }],
      tracks: project.document.timeline.tracks.map((timelineTrack) => ({
        ...timelineTrack,
        clips: timelineTrack.clips.map((clip) => ({ ...clip, linkGroupId: 'linked-1' })),
      })),
    },
  };

  const next = splitClipById({ ...project, document }, 'screen', 80);
  assert.deepEqual(next.document.timeline.tracks.map((item) => item.clips.length), [2, 2]);
  assert.deepEqual(next.document.timeline.tracks[1].clips.map((clip) => [clip.timelineIn, clip.timelineOut]), [[0, 80], [80, 200]]);
});

test('splitClipById is a no-op at clip edges, outside, or unknown clip ids', () => {
  const project = makeProject();
  assert.equal(splitClipById(project, 'c1', 0), project);
  assert.equal(splitClipById(project, 'c1', 300), project);
  assert.equal(splitClipById(project, 'c1', 1000), project);
  assert.equal(splitClipById(project, 'nope', 50), project);
});

test('canSplitClipById reports whether splitClipById would mutate', () => {
  const project = makeProject();
  assert.equal(canSplitClipById(project, 'c1', 100), true);
  assert.equal(canSplitClipById(project, 'c1', 0), false);
  assert.equal(canSplitClipById(project, 'missing', 100), false);
});

test('trimClipById trims edges through canonical command service', () => {
  const project = makeProject();
  const left = trimClipById(project, 'c1', 'left', 80).document.timeline.tracks[0].clips[0];
  const right = trimClipById(project, 'c1', 'right', 180).document.timeline.tracks[0].clips[0];

  assert.deepEqual([left.timelineIn, left.timelineOut, left.sourceIn, left.sourceOut], [80, 300, 80, 300]);
  assert.deepEqual([right.timelineIn, right.timelineOut, right.sourceIn, right.sourceOut], [0, 180, 0, 180]);
});

test('trimClipById returns no-op for command-service rejected trims', () => {
  const project = makeProject([track({ clips: [
    { ...baseClip, id: 'c0', timelineIn: 0, timelineOut: 80, sourceIn: 0, sourceOut: 80 },
    { ...baseClip, id: 'c1', timelineIn: 100, timelineOut: 300, sourceIn: 100, sourceOut: 300 },
  ] })]);

  assert.equal(trimClipById(project, 'c1', 'left', 20), project);
  assert.equal(trimClipById(project, 'missing', 'right', 100), project);
  assert.equal(trimClipById(project, 'c1', 'middle', 100), project);
});

test('trimClipById ignores stale mirrors and mutates the canonical timeline', () => {
  const project = makeProject();
  const staleMirror = { ...project.document.tracks[0], clips: [{ ...project.document.tracks[0].clips[0], timelineIn: 50, sourceIn: 50 }] };
  const next = trimClipById({ ...project, document: { ...project.document, tracks: [staleMirror] } }, 'c1', 'left', 80);

  assert.equal(next.document.timeline.tracks[0].clips[0].timelineIn, 80);
  assert.equal(next.document.tracks[0].clips[0].timelineIn, 50, 'legacy mirror remains stale and ignored');
});

test('moveClipById moves clips across same-kind canonical tracks', () => {
  const project = makeProject([
    track({ id: 'v1', clips: [baseClip] }),
    track({ id: 'v2', index: 1, clips: [] }),
  ]);
  const next = moveClipById(project, 'c1', 120, 'v2');

  assert.equal(next.document.timeline.tracks[0].clips.length, 0);
  assert.deepEqual(next.document.timeline.tracks[1].clips.map((clip) => [clip.id, clip.trackId, clip.timelineIn, clip.timelineOut, clip.sourceIn, clip.sourceOut]), [
    ['c1', 'v2', 120, 420, 0, 300],
  ]);
});

test('moveClipById returns same project for collisions, cross-kind, and locked tracks', () => {
  const project = makeProject([
    track({ id: 'v1', clips: [baseClip, { ...baseClip, id: 'c2', timelineIn: 320, timelineOut: 500, sourceIn: 0, sourceOut: 180 }] }),
    track({ id: 'locked', index: 1, locked: true, clips: [] }),
    track({ id: 'a1', kind: 'audio', index: 2, clips: [] }),
  ]);

  assert.equal(moveClipById(project, 'c1', 250, 'v1'), project);
  assert.equal(moveClipById(project, 'c1', 50, 'a1'), project);
  assert.equal(moveClipById(project, 'c1', 50, 'locked'), project);
});

test('updateTrackById and reorderTrackById mutate track state through commands', () => {
  const project = makeProject([
    track({ id: 'v1', clips: [baseClip] }),
    track({ id: 'v2', index: 1, clips: [] }),
  ]);
  const locked = updateTrackById(project, 'v1', { locked: true, height: 84 });
  const reordered = reorderTrackById(locked, 'v1', 'up');

  assert.equal(locked.document.timeline.tracks[0].locked, true);
  assert.equal(locked.document.timeline.tracks[0].height, 84);
  assert.equal(reordered.document.timeline.tracks.find((item) => item.id === 'v1').index, 1);
});

test('addGeneratedAssetToTrack creates an AI asset clip reference on a compatible video track', () => {
  const project = makeProject([track({ id: 'v1', clips: [] })]);
  const next = addGeneratedAssetToTrack(project, {
    id: 'ai-image-1',
    kind: 'image',
    providerId: 'codex-cli',
    sourcePrompt: 'Title card',
    filePath: '/tmp/title.png',
    durationFrames: 90,
  }, 'v1', 120);

  assert.notEqual(next, project);
  assert.deepEqual(next.document.timeline.sources.find((source) => source.aiAssetId === 'ai-image-1'), {
    id: 'source:ai-image-1',
    kind: 'generated-asset',
    mediaType: 'video',
    aiAssetId: 'ai-image-1',
    label: 'Title card',
    duration: 90,
  });
  assert.deepEqual(next.document.timeline.tracks[0].clips[0], {
    id: next.document.timeline.tracks[0].clips[0].id,
    mediaId: 'source:ai-image-1',
    trackId: 'v1',
    timelineIn: 120,
    timelineOut: 210,
    sourceIn: 0,
    sourceOut: 90,
    source: { kind: 'ai-asset', id: 'ai-image-1' },
  });
});

test('addGeneratedAssetToTrack rejects incompatible, locked, and overlapping drops', () => {
  const project = makeProject([
    track({ id: 'v1', clips: [baseClip] }),
    track({ id: 'a1', kind: 'audio', index: 1, clips: [] }),
    track({ id: 'locked', index: 2, locked: true, clips: [] }),
  ]);

  assert.equal(addGeneratedAssetToTrack(project, { id: 'ai-audio-1', kind: 'audio', providerId: 'openai', sourcePrompt: 'VO' }, 'v1', 320), project);
  assert.equal(addGeneratedAssetToTrack(project, { id: 'ai-image-1', kind: 'image', providerId: 'openai', sourcePrompt: 'Card' }, 'locked', 320), project);
  assert.equal(addGeneratedAssetToTrack(project, { id: 'ai-image-1', kind: 'image', providerId: 'openai', sourcePrompt: 'Card' }, 'v1', 100), project);
});

// --- Ghost-channel track creation (Editor v2 slice 2) ----------------------

const generatedVideoAsset = {
  id: 'gen-video-1',
  kind: 'video',
  providerId: 'test',
  sourcePrompt: 'b-roll',
  createdAt: '2026-06-10T00:00:00.000Z',
  tags: [],
  sessionId: 's1',
  filePath: '/tmp/gen.mp4',
  durationFrames: 90,
};
const generatedAudioAsset = { ...generatedVideoAsset, id: 'gen-audio-1', kind: 'audio', filePath: '/tmp/gen.wav' };

test('addGeneratedAssetToNewTrack creates a video track above existing tracks', async () => {
  const { addGeneratedAssetToNewTrack } = await import('./clip-mutations.mjs');
  const project = makeProject();
  const next = addGeneratedAssetToNewTrack(project, generatedVideoAsset, 'video', 30);

  assert.notEqual(next, project);
  const tracks = next.document.timeline.tracks;
  const created = tracks.find((item) => item.label === 'Video 2');
  assert.ok(created, 'new video track exists');
  assert.equal(created.kind, 'video');
  assert.ok(created.index > Math.max(...tracks.filter((item) => item.id !== created.id).map((item) => item.index)), 'new video track sits on top');
  assert.equal(created.clips.length, 1);
  assert.equal(created.clips[0].timelineIn, 30);
});

test('addGeneratedAssetToNewTrack puts audio at the bottom and shifts others up', async () => {
  const { addGeneratedAssetToNewTrack } = await import('./clip-mutations.mjs');
  const project = makeProject();
  const originalIndex = project.document.timeline?.tracks?.[0]?.index ?? 0;
  const next = addGeneratedAssetToNewTrack(project, generatedAudioAsset, 'audio', 0);

  assert.notEqual(next, project);
  const tracks = next.document.timeline.tracks;
  const created = tracks.find((item) => item.kind === 'audio');
  assert.ok(created, 'new audio track exists');
  assert.equal(created.index, 0, 'audio track lands at the bottom');
  const survivor = tracks.find((item) => item.id !== created.id);
  assert.equal(survivor.index, originalIndex + 1, 'existing tracks shift up, order preserved');
  assert.equal(created.clips.length, 1);
});

test('addGeneratedAssetToNewTrack rejects kind mismatches without creating a track', async () => {
  const { addGeneratedAssetToNewTrack } = await import('./clip-mutations.mjs');
  const project = makeProject();
  assert.equal(addGeneratedAssetToNewTrack(project, generatedAudioAsset, 'video', 0), project);
  assert.equal(addGeneratedAssetToNewTrack(project, generatedVideoAsset, 'audio', 0), project);
  assert.equal(addGeneratedAssetToNewTrack(project, generatedVideoAsset, 'captions', 0), project);
});
