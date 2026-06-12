import test from 'node:test';
import assert from 'node:assert/strict';
import { createAsset, createProject } from '@rough-cut/project-model';
import { createTrimSession, updateTrimSession } from './trim-session.mjs';

const asset = createAsset('video', '/tmp/video.mp4', { id: 'a1', duration: 600 });

function makeProject(clips, duration = 500) {
  return {
    document: createProject({
      assets: [asset],
      composition: { duration, tracks: [], transitions: [] },
      tracks: [{
        id: 'v1',
        kind: 'video',
        index: 0,
        label: 'Video',
        enabled: true,
        locked: false,
        muted: false,
        clips,
      }],
    }),
  };
}

function clip(overrides = {}) {
  return {
    id: 'c1',
    source: { kind: 'project-asset', id: asset.id },
    timelineIn: 50,
    timelineOut: 250,
    sourceIn: 50,
    sourceOut: 250,
    ...overrides,
  };
}

const project = makeProject([clip()], 300);

test('createTrimSession captures original range and preview without mutating the project', () => {
  const session = createTrimSession(project, 'c1', 'left', 80, 300);
  assert.equal(session.clipId, 'c1');
  assert.equal(session.edge, 'left');
  assert.deepEqual(session.original, { timelineIn: 50, timelineOut: 250, sourceIn: 50, sourceOut: 250 });
  assert.deepEqual(session.bounds, { start: 0, end: 300 });
  assert.deepEqual(session.preview, { timelineIn: 80, timelineOut: 250, sourceIn: 80, sourceOut: 250 });
  assert.equal(project.document.timeline.tracks[0].clips[0].timelineIn, 50);
});

test('createTrimSession ignores stale top-level and composition mirrors', () => {
  const staleProject = {
    ...project,
    document: {
      ...project.document,
      tracks: [{ ...project.document.tracks[0], clips: [{ ...project.document.tracks[0].clips[0], timelineIn: 10, sourceIn: 10 }] }],
      composition: { ...project.document.composition, tracks: [{ type: 'video', clips: [{ id: 'c1', timelineIn: 10, timelineOut: 250, sourceIn: 10, sourceOut: 250 }] }] },
    },
  };
  const session = createTrimSession(staleProject, 'c1', 'left', 80, 300);
  assert.equal(session.original.timelineIn, 50);
  assert.equal(session.original.sourceIn, 50);
});

test('updateTrimSession clamps left edge against previous clips and ripples right edge through next clips', () => {
  const projectWithNeighbors = makeProject([
    clip({ id: 'c0', timelineIn: 0, timelineOut: 80, sourceIn: 0, sourceOut: 80 }),
    clip({ id: 'c1', timelineIn: 100, timelineOut: 250, sourceIn: 100, sourceOut: 250 }),
    clip({ id: 'c2', timelineIn: 300, timelineOut: 420, sourceIn: 0, sourceOut: 120 }),
  ]);

  const left = createTrimSession(projectWithNeighbors, 'c1', 'left', 20, 500);
  assert.equal(left.preview.timelineIn, 80);
  assert.equal(left.invalidReason, 'clamped');

  const right = createTrimSession(projectWithNeighbors, 'c1', 'right', 360, 500);
  assert.equal(right.preview.timelineOut, 360);
  assert.deepEqual(right.previews.c2, { timelineIn: 410, timelineOut: 530 });
  assert.equal(right.invalidReason, null);
});

test('updateTrimSession previews ripple shifts for downstream clips', () => {
  const projectWithDownstream = makeProject([
    clip({ id: 'c1', timelineIn: 50, timelineOut: 250, sourceIn: 50, sourceOut: 250 }),
    clip({ id: 'c2', timelineIn: 300, timelineOut: 420, sourceIn: 0, sourceOut: 120 }),
  ], 600);

  const session = createTrimSession(projectWithDownstream, 'c1', 'right', 220, 600);

  assert.deepEqual(session.preview, { timelineIn: 50, timelineOut: 220, sourceIn: 50, sourceOut: 220 });
  assert.deepEqual(session.previews.c2, { timelineIn: 270, timelineOut: 390 });
});

test('updateTrimSession lets ripple tail trims extend past the next clip by shifting it', () => {
  const projectWithDownstream = makeProject([
    clip({ id: 'c1', timelineIn: 50, timelineOut: 250, sourceIn: 50, sourceOut: 250 }),
    clip({ id: 'c2', timelineIn: 300, timelineOut: 420, sourceIn: 0, sourceOut: 120 }),
  ], 600);

  const session = createTrimSession(projectWithDownstream, 'c1', 'right', 330, 600);

  assert.equal(session.preview.timelineOut, 330);
  assert.deepEqual(session.previews.c2, { timelineIn: 380, timelineOut: 500 });
  assert.equal(session.invalidReason, null);
});

test('updateTrimSession clamps left edge to source bounds and minimum span', () => {
  const session = createTrimSession(project, 'c1', 'left', 80, 300);
  const beforeSource = updateTrimSession(session, -20);
  assert.equal(beforeSource.preview.timelineIn, 0);
  assert.equal(beforeSource.preview.sourceIn, 0);
  assert.equal(beforeSource.invalidReason, 'clamped');

  const pastRight = updateTrimSession(session, 300);
  assert.equal(pastRight.preview.timelineIn, 249);
  assert.equal(pastRight.preview.sourceIn, 249);
  assert.equal(pastRight.invalidReason, 'clamped');
});

test('updateTrimSession clamps right edge to duration and minimum span', () => {
  const session = createTrimSession(project, 'c1', 'right', 180, 300);
  assert.deepEqual(session.preview, { timelineIn: 50, timelineOut: 180, sourceIn: 50, sourceOut: 180 });

  const beforeLeft = updateTrimSession(session, 20);
  assert.equal(beforeLeft.preview.timelineOut, 51);
  assert.equal(beforeLeft.preview.sourceOut, 51);
  assert.equal(beforeLeft.invalidReason, 'clamped');

  const pastDuration = updateTrimSession(session, 500);
  assert.equal(pastDuration.preview.timelineOut, 300);
  assert.equal(pastDuration.preview.sourceOut, 300);
  assert.equal(pastDuration.invalidReason, 'clamped');
});
