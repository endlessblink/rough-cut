import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ProjectDocumentSchema, createAsset, createDefaultRecordingPresentation, createProject } from '@rough-cut/project-model';

import {
  addFramingRangeAt,
  listFramingRanges,
  removeFramingRange,
  updateFramingRangeFocalPoint,
  updateFramingRangeRange,
} from './framing-ranges.mjs';

function projectDocument(duration = 300) {
  const recording = createAsset('recording', '/tmp/take.mkv', {
    duration,
    presentation: createDefaultRecordingPresentation(),
  });
  return createProject({ assets: [recording] });
}

test('addFramingRangeAt adds a clamped range with a unique id', () => {
  let doc = addFramingRangeAt(projectDocument(), { startFrame: 30, endFrame: 90, focalPoint: { x: 1.4, y: 0.25 } });
  doc = addFramingRangeAt(doc, { startFrame: 30, endFrame: 400 });
  const ranges = listFramingRanges(doc);
  assert.equal(ranges.length, 2);
  assert.deepEqual(ranges[0], { id: 'framing-30', startFrame: 30, endFrame: 90, focalPoint: { x: 1, y: 0.25 } });
  assert.equal(ranges[1].id, 'framing-30-2');
  assert.equal(ranges[1].endFrame, 300);
});

test('framing ranges survive the project schema', () => {
  const doc = addFramingRangeAt(projectDocument(), { startFrame: 10, endFrame: 40, focalPoint: { x: 0.7, y: 0.3 } });
  const parsed = ProjectDocumentSchema.parse(doc);
  const recording = parsed.assets.find((asset) => asset.type === 'recording');
  assert.equal(recording.presentation.framingRanges.length, 1);
});

test('update and remove return the same document for no-ops', () => {
  const doc = addFramingRangeAt(projectDocument(), { startFrame: 10, endFrame: 40 });
  assert.equal(updateFramingRangeRange(doc, 'framing-10', 10, 40), doc);
  assert.equal(updateFramingRangeFocalPoint(doc, 'framing-10', { x: 0.5, y: 0.5 }), doc);
  assert.equal(removeFramingRange(doc, 'missing'), doc);

  const moved = updateFramingRangeRange(doc, 'framing-10', 50, 52);
  assert.deepEqual(
    [listFramingRanges(moved)[0].startFrame, listFramingRanges(moved)[0].endFrame],
    [50, 56],
  );
  const aimed = updateFramingRangeFocalPoint(doc, 'framing-10', { x: 0.123456, y: -2 });
  assert.deepEqual(listFramingRanges(aimed)[0].focalPoint, { x: 0.1235, y: 0 });
  assert.equal(listFramingRanges(removeFramingRange(doc, 'framing-10')).length, 0);
});
