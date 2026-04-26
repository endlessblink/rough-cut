import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CursorRecorder,
  __resetCursorRecorderForTests,
  __setCursorRecorderTestHooks,
} from './cursor-recorder.mjs';

test('start seeds a frame-zero cursor event even without movement', async () => {
  const workdir = await mkdtemp(join(tmpdir(), 'rough-cut-cursor-recorder-'));
  const outputPath = join(workdir, 'cursor.ndjson');

  try {
    __resetCursorRecorderForTests();
    __setCursorRecorderTestHooks({ startHook: () => {} });

    const recorder = new CursorRecorder();
    recorder.start(30, outputPath, {
      offsetX: 1920,
      offsetY: 120,
      initialX: 2040,
      initialY: 200,
    });

    const result = recorder.stop();

    assert.ok(result);
    assert.equal(result.eventCount, 1);
    assert.equal(existsSync(outputPath), true);

    const lines = readFileSync(outputPath, 'utf-8').trim().split('\n');
    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0]), {
      frame: 0,
      x: 120,
      y: 80,
      type: 'move',
      button: 0,
    });
  } finally {
    __resetCursorRecorderForTests();
    await rm(workdir, { recursive: true, force: true });
  }
});
