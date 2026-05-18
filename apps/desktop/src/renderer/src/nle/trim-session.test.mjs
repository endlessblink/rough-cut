import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrimSession, updateTrimSession } from './trim-session.mjs';

const project = {
  document: {
    composition: { duration: 300, tracks: [] },
    timeline: {
      tracks: [{
        id: 'v1',
        kind: 'video',
        clips: [{ id: 'c1', source: { kind: 'project-asset', id: 'a1' }, timelineIn: 50, timelineOut: 250, sourceIn: 50, sourceOut: 250 }],
      }],
    },
  },
};

test('createTrimSession captures original range and preview without mutating the project', () => {
  const session = createTrimSession(project, 'c1', 'left', 80, 300);
  assert.equal(session.clipId, 'c1');
  assert.equal(session.edge, 'left');
  assert.deepEqual(session.original, { timelineIn: 50, timelineOut: 250, sourceIn: 50, sourceOut: 250 });
  assert.deepEqual(session.bounds, { start: 0, end: 300 });
  assert.deepEqual(session.preview, { timelineIn: 80, timelineOut: 250, sourceIn: 80, sourceOut: 250 });
  assert.equal(project.document.timeline.tracks[0].clips[0].timelineIn, 50);
});

test('updateTrimSession clamps preview against neighboring clips', () => {
  const projectWithNeighbors = {
    document: {
      composition: { duration: 500, tracks: [] },
      timeline: {
        tracks: [{
          id: 'v1',
          kind: 'video',
          clips: [
            { id: 'c0', source: { kind: 'project-asset', id: 'a1' }, timelineIn: 0, timelineOut: 80, sourceIn: 0, sourceOut: 80 },
            { id: 'c1', source: { kind: 'project-asset', id: 'a1' }, timelineIn: 100, timelineOut: 250, sourceIn: 100, sourceOut: 250 },
            { id: 'c2', source: { kind: 'project-asset', id: 'a1' }, timelineIn: 300, timelineOut: 420, sourceIn: 0, sourceOut: 120 },
          ],
        }],
      },
    },
  };

  const left = createTrimSession(projectWithNeighbors, 'c1', 'left', 20, 500);
  assert.equal(left.preview.timelineIn, 80);
  assert.equal(left.invalidReason, 'clamped');

  const right = createTrimSession(projectWithNeighbors, 'c1', 'right', 360, 500);
  assert.equal(right.preview.timelineOut, 300);
  assert.equal(right.invalidReason, 'clamped');
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
