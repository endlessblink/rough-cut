import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAsset,
  createClip,
  createProject,
  createTrack,
  computeTimelineDuration,
} from '@rough-cut/project-model';
import { finalizeCleanupDraftProject } from './cleanup-finalize.mjs';

function projectWithDraft() {
  const recording = createAsset('recording', '/tmp/screen.mp4', {
    duration: 120,
    metadata: {
      smartCleanupDraft: {
        version: 1,
        analysisSignature: 'fixture',
        decisions: [],
      },
    },
  });
  const track = createTrack('video', { name: 'Screen', index: 0 });
  const clip = createClip(recording.id, track.id, {
    timelineIn: 0,
    timelineOut: 120,
    sourceIn: 0,
    sourceOut: 120,
  });
  return {
    path: '/tmp/project.roughcut',
    document: createProject({
      assets: [recording],
      composition: {
        duration: 120,
        tracks: [{ ...track, clips: [clip] }],
        transitions: [],
      },
    }),
  };
}

test('finalizes all draft removals into one canonical project result and clears the snapshot', () => {
  const project = projectWithDraft();
  const finalized = finalizeCleanupDraftProject(project, {
    removals: [
      { suggestionId: 'a', startFrame: 10, endFrame: 20 },
      { suggestionId: 'b', startFrame: 60, endFrame: 75 },
    ],
    compressions: [],
  });

  assert.notEqual(finalized, project);
  assert.equal(computeTimelineDuration(finalized.document.timeline), 95);
  assert.equal(finalized.document.composition.duration, 95);
  assert.equal(
    finalized.document.assets[0].metadata.smartCleanupDraft,
    undefined,
  );
  assert.deepEqual(
    finalized.document.timeline.tracks[0].clips.map((clip) => [
      clip.timelineIn,
      clip.timelineOut,
      clip.sourceIn,
      clip.sourceOut,
    ]),
    [
      [0, 10, 0, 10],
      [10, 50, 20, 60],
      [50, 95, 75, 120],
    ],
  );
});

test('refuses to silently discard an unsupported wait compression', () => {
  assert.throws(
    () =>
      finalizeCleanupDraftProject(projectWithDraft(), {
        removals: [{ suggestionId: 'a', startFrame: 10, endFrame: 20 }],
        compressions: [
          {
            suggestionId: 'wait',
            startFrame: 40,
            endFrame: 80,
            targetDurationFrames: 20,
          },
        ],
      }),
    /cannot be finalized/,
  );
});
