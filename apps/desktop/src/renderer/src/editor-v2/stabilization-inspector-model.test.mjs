import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findStabilizationTarget,
  stabilizationStatusLabel,
} from './stabilization-inspector-model.mjs';

const project = {
  document: {
    assets: [
      { id: 'screen', type: 'recording', filePath: '/tmp/screen.mp4' },
      { id: 'camera', type: 'video', filePath: '/tmp/camera.mp4', metadata: { isCamera: true } },
      { id: 'imported', type: 'video', filePath: '/tmp/imported.mp4' },
    ],
    timeline: {
      sources: [
        { id: 'source:screen', assetId: 'screen' },
        { id: 'source:camera', assetId: 'camera' },
        { id: 'source:imported', assetId: 'imported' },
      ],
    },
  },
};

test('stabilization targets camera and imported video but excludes screen recordings', () => {
  assert.equal(findStabilizationTarget(project, { mediaId: 'source:screen', assetId: 'screen' }), null);
  assert.deepEqual(
    findStabilizationTarget(project, { mediaId: 'source:camera', assetId: 'camera' }),
    { sourceId: 'source:camera', assetId: 'camera', isCamera: true },
  );
  assert.deepEqual(
    findStabilizationTarget(project, { mediaId: 'source:imported', assetId: 'imported' }),
    { sourceId: 'source:imported', assetId: 'imported', isCamera: false },
  );
});

test('stabilization progress uses direct recovery-oriented labels', () => {
  assert.equal(stabilizationStatusLabel({ phase: 'analyzing', progress: 0.42 }), 'Analyzing movement 42%');
  assert.equal(stabilizationStatusLabel({ phase: 'encoding', progress: 0.7 }), 'Building exact preview 70%');
  assert.equal(stabilizationStatusLabel({ phase: 'ready', progress: 1 }), 'Exact preview ready');
  assert.equal(stabilizationStatusLabel({ phase: 'failed', error: 'FFmpeg unavailable' }), 'Could not stabilize: FFmpeg unavailable');
});
