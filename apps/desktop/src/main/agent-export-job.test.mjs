import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRangeCutArgs, normalizeAgentExportJob, prepareAgentExportDocument, runAgentExportJob } from './agent-export-job.mjs';

const document = {
  captions: { enabled: true, position: 'bottom' },
  assets: [
    { id: 'rec', type: 'recording', presentation: { camera: { visible: true, shape: 'circle' } } },
    { id: 'cam', type: 'video' },
  ],
};

test('captions off and camera off change only an in-memory copy', () => {
  const next = prepareAgentExportDocument(document, { captions: false, camera: false });
  assert.equal(next.captions.enabled, false);
  assert.equal(next.captions.position, 'bottom');
  assert.equal(next.assets[0].presentation.camera.visible, false);
  assert.equal(next.assets[0].presentation.camera.shape, 'circle');
  assert.equal(document.captions.enabled, true, 'the original is untouched');
  assert.equal(document.assets[0].presentation.camera.visible, true);
});

test('defaults keep the project as laid out', () => {
  assert.deepEqual(prepareAgentExportDocument(document, {}), document);
});

test('jobs are checked before anything runs', () => {
  assert.throws(() => normalizeAgentExportJob({ projectPath: '/p/a.mp4', outPath: '/p/o.mp4' }), /roughcut/);
  assert.throws(() => normalizeAgentExportJob({ projectPath: '/p/a.roughcut', outPath: '/p/o.mov' }), /mp4/);
  assert.throws(() => normalizeAgentExportJob({ projectPath: '/p/a.roughcut', outPath: '/p/o.mp4', startSec: 5, endSec: 4 }), /after/);
  assert.deepEqual(normalizeAgentExportJob({ projectPath: '/p/a.roughcut', outPath: '/p/o.mp4', captions: false, startSec: 22, endSec: 26 }), {
    projectPath: '/p/a.roughcut', outPath: '/p/o.mp4', captions: false, camera: true, startSec: 22, endSec: 26,
  });
});

test('a range is cut from the finished export, frame-accurately', () => {
  const args = buildRangeCutArgs('/t/full.mp4', '/t/out.mp4', { startSec: 22, endSec: 26 });
  assert.deepEqual(args.slice(0, 9), ['-y', '-v', 'error', '-ss', '22', '-i', '/t/full.mp4', '-t', '4']);
  assert.ok(args.includes('libx264'), 're-encoded, not stream-copied, so it starts on the exact frame');
});

test('the job exports styled, then cuts the range and removes the full file', async () => {
  const calls = [];
  const result = await runAgentExportJob({ projectPath: '/p/a.roughcut', outPath: '/p/o.mp4', captions: false, startSec: 1, endSec: 3 }, {
    openProjectFile: async () => ({ document }),
    exportProjectToMp4: async (options) => { calls.push(['export', options.outputPath, options.mode, options.project.captions.enabled]); return { outputPath: options.outputPath }; },
    runCappedFfmpeg: async (args) => { calls.push(['cut', args.at(-1)]); return { code: 0 }; },
    rm: async (path) => { calls.push(['rm', path]); },
  });
  assert.deepEqual(calls, [['export', '/p/o.full-export.mp4', 'styled', false], ['cut', '/p/o.mp4'], ['rm', '/p/o.full-export.mp4']]);
  assert.equal(result.outPath, '/p/o.mp4');
});
