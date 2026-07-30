import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inspectVisualDiscontinuity,
  resolveReferencedVisualSource,
} from './visual-discontinuity-service.mjs';

test('only resolves media paths that the validated project references', () => {
  assert.equal(
    resolveReferencedVisualSource({
      projectPath: '/projects/demo/project.roughcut',
      sourcePath: 'recording.mp4',
      assets: [{ filePath: 'recording.mp4' }],
    }),
    '/projects/demo/recording.mp4',
  );
  assert.throws(
    () =>
      resolveReferencedVisualSource({
        projectPath: '/projects/demo/project.roughcut',
        sourcePath: '/private/unrelated.mp4',
        assets: [{ filePath: 'recording.mp4' }],
      }),
    /not referenced by the project/,
  );
});

test('scores sampled recording frames and warns on a large visual jump', async () => {
  const calls = [];
  const result = await inspectVisualDiscontinuity({
    sourcePath: '/tmp/recording.mp4',
    beforeFrame: 29,
    afterFrame: 75,
    fps: 30,
    readFrames: async (options) => {
      calls.push(options);
      return {
        frames: [
          new Uint8Array(
            options.startFrame === 29 ? [0, 0, 0, 0] : [255, 255, 255, 255],
          ),
        ],
      };
    },
  });

  assert.equal(result.score, 1);
  assert.equal(result.warning, true);
  assert.deepEqual(
    calls.map(({ startFrame, frameCount, analysisWidth }) => ({
      startFrame,
      frameCount,
      analysisWidth,
    })),
    [
      { startFrame: 29, frameCount: 1, analysisWidth: 160 },
      { startFrame: 75, frameCount: 1, analysisWidth: 160 },
    ],
  );
});

test('keeps a similar join below the warning threshold', async () => {
  const result = await inspectVisualDiscontinuity({
    sourcePath: '/tmp/recording.mp4',
    beforeFrame: 10,
    afterFrame: 20,
    readFrames: async ({ startFrame }) => ({
      frames: [new Uint8Array(startFrame === 10 ? [100, 100] : [110, 110])],
    }),
  });

  assert.equal(result.warning, false);
  assert(result.score < 0.05);
});
