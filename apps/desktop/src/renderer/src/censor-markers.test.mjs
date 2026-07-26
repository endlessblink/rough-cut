import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAsset, createDefaultRecordingPresentation, createProject } from '@rough-cut/project-model';

import {
  addCensorRegionAt,
  listCensorRegions,
  normalizeCensorRect,
  removeCensorRegion,
  setCensorRegionMode,
  updateCensorRegionRange,
  updateCensorRegionRect,
} from './censor-markers.mjs';

function projectDocument(duration = 300) {
  const recording = createAsset('recording', '/tmp/take.mkv', {
    duration,
    presentation: createDefaultRecordingPresentation(),
  });
  return createProject({ assets: [recording] });
}

test('normalizeCensorRect flips a right-to-left drag into the same region', () => {
  const dragged = normalizeCensorRect({ x: 0.6, y: 0.7, w: -0.2, h: -0.3 });
  assert.deepEqual(dragged, { x: 0.4, y: 0.4, w: 0.2, h: 0.3 });
});

test('normalizeCensorRect clamps a drag that runs past the frame edge', () => {
  const rect = normalizeCensorRect({ x: 0.9, y: 0.9, w: 0.4, h: 0.4 });
  assert.deepEqual(rect, { x: 0.9, y: 0.9, w: 0.1, h: 0.1 });
});

test('normalizeCensorRect rejects a stray click that drew nothing', () => {
  assert.equal(normalizeCensorRect({ x: 0.5, y: 0.5, w: 0, h: 0 }), null);
  assert.equal(normalizeCensorRect({ x: 0.5, y: 0.5, w: 0.001, h: 0.4 }), null);
  assert.equal(normalizeCensorRect(null), null);
});

test('a new censor runs to the end of the recording', () => {
  // Under-censoring is the dangerous failure: better to cover too much and let
  // the user pull the end in than to stop early and ship the secret.
  const next = addCensorRegionAt(projectDocument(300), {
    rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    startFrame: 90,
  });
  const regions = listCensorRegions(next);
  assert.equal(regions.length, 1);
  assert.equal(regions[0].startFrame, 90);
  assert.equal(regions[0].endFrame, 300);
});

test('a new censor defaults to pixelate with softening on', () => {
  const next = addCensorRegionAt(projectDocument(), {
    rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    startFrame: 0,
  });
  assert.match(listCensorRegions(next)[0].mode, /pixelate/);
  assert.equal(listCensorRegions(next)[0].soften, true);
});

test('adding a censor with no usable rect leaves the document untouched', () => {
  const document = projectDocument();
  assert.equal(addCensorRegionAt(document, { rect: { x: 0.5, y: 0.5, w: 0, h: 0 } }), document);
  assert.equal(addCensorRegionAt(document, {}), document);
});

test('adding a censor to a project with no recording leaves it untouched', () => {
  const empty = createProject();
  assert.equal(addCensorRegionAt(empty, { rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }), empty);
});

test('a censor added near the very end still spans a usable range', () => {
  const next = addCensorRegionAt(projectDocument(100), {
    rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    startFrame: 99,
  });
  const [region] = listCensorRegions(next);
  assert.ok(region.endFrame - region.startFrame >= 6, 'expected a minimum span');
  assert.ok(region.endFrame <= 100);
});

test('retiming clamps to the recording and keeps a minimum span', () => {
  const withRegion = addCensorRegionAt(projectDocument(300), {
    id: 'c1',
    rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    startFrame: 30,
    endFrame: 120,
  });

  const widened = updateCensorRegionRange(withRegion, 'c1', -50, 9999);
  assert.deepEqual(
    { start: listCensorRegions(widened)[0].startFrame, end: listCensorRegions(widened)[0].endFrame },
    { start: 0, end: 300 },
  );

  const collapsed = updateCensorRegionRange(withRegion, 'c1', 200, 100);
  assert.ok(
    listCensorRegions(collapsed)[0].endFrame - listCensorRegions(collapsed)[0].startFrame >= 6,
  );
});

test('retiming to the same range returns the same document so undo stays clean', () => {
  const withRegion = addCensorRegionAt(projectDocument(300), {
    id: 'c1',
    rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    startFrame: 30,
    endFrame: 120,
  });
  assert.equal(updateCensorRegionRange(withRegion, 'c1', 30, 120), withRegion);
  assert.equal(updateCensorRegionRange(withRegion, 'missing', 0, 60), withRegion);
});

test('dragging a censor rect down to nothing keeps the previous rect', () => {
  // Otherwise a fumbled resize silently uncovers whatever was hidden.
  const withRegion = addCensorRegionAt(projectDocument(), {
    id: 'c1',
    rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    startFrame: 0,
  });
  const unchanged = updateCensorRegionRect(withRegion, 'c1', { x: 0.5, y: 0.5, w: 0, h: 0 });
  assert.equal(unchanged, withRegion);
  assert.deepEqual(listCensorRegions(withRegion)[0].rect, { x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
});

test('moving a censor rect writes the new normalized rect', () => {
  const withRegion = addCensorRegionAt(projectDocument(), {
    id: 'c1',
    rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    startFrame: 0,
  });
  const moved = updateCensorRegionRect(withRegion, 'c1', { x: 0.4, y: 0.35, w: 0.25, h: 0.15 });
  assert.deepEqual(listCensorRegions(moved)[0].rect, { x: 0.4, y: 0.35, w: 0.25, h: 0.15 });
});

test('switching mode toggles between pixelate and solid without touching timing', () => {
  const withRegion = addCensorRegionAt(projectDocument(300), {
    id: 'c1',
    rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    startFrame: 30,
    endFrame: 120,
  });
  const solid = setCensorRegionMode(withRegion, 'c1', 'solid');
  assert.equal(listCensorRegions(solid)[0].mode, 'solid');
  assert.equal(listCensorRegions(solid)[0].startFrame, 30);
  assert.equal(listCensorRegions(solid)[0].endFrame, 120);
  assert.equal(setCensorRegionMode(solid, 'c1', 'solid'), solid);
});

test('removing a censor drops exactly one and no-ops on an unknown id', () => {
  let document = addCensorRegionAt(projectDocument(), {
    id: 'c1',
    rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    startFrame: 0,
  });
  document = addCensorRegionAt(document, {
    id: 'c2',
    rect: { x: 0.5, y: 0.5, w: 0.2, h: 0.2 },
    startFrame: 0,
  });
  assert.equal(listCensorRegions(removeCensorRegion(document, 'c1')).length, 1);
  assert.equal(listCensorRegions(removeCensorRegion(document, 'c1'))[0].id, 'c2');
  assert.equal(removeCensorRegion(document, 'nope'), document);
});

test('censor edits survive schema validation', async () => {
  const { validateProject } = await import('@rough-cut/project-model');
  const document = addCensorRegionAt(projectDocument(300), {
    id: 'c1',
    rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    startFrame: 30,
    endFrame: 120,
  });
  assert.doesNotThrow(() => validateProject(document));
});
