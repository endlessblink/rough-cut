import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAsset, createDefaultRecordingPresentation, createProject } from '@rough-cut/project-model';

const here = dirname(fileURLToPath(import.meta.url));

import {
  addCensorRegionAt,
  listCensorRegions,
  normalizeCensorRect,
  removeCensorRegion,
  DEFAULT_CENSOR_RECT,
  setCensorRegionMode,
  setCensorRegionSoftness,
  updateCensorRegionRange,
  updateCensorRegionRect,
  setCensorRegionKeyframes,
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

test('nudging a censor that follows moving content shifts its whole path', () => {
  // Without this the drag looks broken: the keyframes still decide where the censor
  // is, so writing only the region rect would move nothing on screen.
  const withRegion = addCensorRegionAt(projectDocument(300), {
    id: 'c1',
    rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    startFrame: 0,
    endFrame: 120,
  });
  const tracked = setCensorRegionKeyframes(withRegion, 'c1', [
    { frame: 0, rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
    { frame: 120, rect: { x: 0.5, y: 0.1, w: 0.2, h: 0.2 } },
  ]);

  // Drag at frame 60, where the censor currently sits at x=0.3, over to x=0.35.
  const nudged = updateCensorRegionRect(tracked, 'c1', { x: 0.35, y: 0.2, w: 0.2, h: 0.2 }, { frame: 60 });
  const keyframes = listCensorRegions(nudged)[0].keyframes;

  assert.equal(keyframes.length, 2);
  // Every keyframe moved by the same delta, so the tracked path is preserved.
  assert.ok(Math.abs(keyframes[0].rect.x - 0.15) < 1e-9, `first keyframe x: ${keyframes[0].rect.x}`);
  assert.ok(Math.abs(keyframes[1].rect.x - 0.55) < 1e-9, `last keyframe x: ${keyframes[1].rect.x}`);
  assert.ok(Math.abs(keyframes[0].rect.y - 0.2) < 1e-9, `first keyframe y: ${keyframes[0].rect.y}`);
});

test('resizing a censor that follows moving content resizes every keyframe', () => {
  const withRegion = addCensorRegionAt(projectDocument(300), {
    id: 'c1',
    rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    startFrame: 0,
    endFrame: 120,
  });
  const tracked = setCensorRegionKeyframes(withRegion, 'c1', [
    { frame: 0, rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
    { frame: 120, rect: { x: 0.5, y: 0.1, w: 0.2, h: 0.2 } },
  ]);

  // Grow the box at frame 0. A tracked censor that only got bigger on one frame
  // would shrink back to the old size everywhere else and uncover the target.
  const grown = updateCensorRegionRect(tracked, 'c1', { x: 0.1, y: 0.1, w: 0.3, h: 0.25 }, { frame: 0 });
  const keyframes = listCensorRegions(grown)[0].keyframes;

  assert.ok(keyframes.every((keyframe) => Math.abs(keyframe.rect.w - 0.3) < 1e-9), 'every keyframe takes the new width');
  assert.ok(keyframes.every((keyframe) => Math.abs(keyframe.rect.h - 0.25) < 1e-9), 'every keyframe takes the new height');
});

test('a shifted censor path stays inside the frame', () => {
  const withRegion = addCensorRegionAt(projectDocument(300), {
    id: 'c1',
    rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    startFrame: 0,
    endFrame: 120,
  });
  const tracked = setCensorRegionKeyframes(withRegion, 'c1', [
    { frame: 0, rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
    { frame: 120, rect: { x: 0.75, y: 0.1, w: 0.2, h: 0.2 } },
  ]);

  const shoved = updateCensorRegionRect(tracked, 'c1', { x: 0.5, y: 0.1, w: 0.2, h: 0.2 }, { frame: 0 });
  for (const keyframe of listCensorRegions(shoved)[0].keyframes) {
    assert.ok(keyframe.rect.x >= 0 && keyframe.rect.x + keyframe.rect.w <= 1 + 1e-9, `x out of frame: ${keyframe.rect.x}`);
    assert.ok(keyframe.rect.y >= 0 && keyframe.rect.y + keyframe.rect.h <= 1 + 1e-9, `y out of frame: ${keyframe.rect.y}`);
  }
});

test('clearing the keyframes turns a tracked censor back into a still one', () => {
  const withRegion = addCensorRegionAt(projectDocument(300), {
    id: 'c1',
    rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    startFrame: 0,
    endFrame: 120,
  });
  const tracked = setCensorRegionKeyframes(withRegion, 'c1', [
    { frame: 0, rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
    { frame: 120, rect: { x: 0.5, y: 0.1, w: 0.2, h: 0.2 } },
  ]);
  const cleared = setCensorRegionKeyframes(tracked, 'c1', []);
  const region = listCensorRegions(cleared)[0];

  assert.equal(region.keyframes, undefined);
  // It parks where it was when tracking was dropped, not back at its original spot.
  assert.deepEqual(region.rect, { x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
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

test('two censors created at the same frame get different ids', () => {
  // Timeline-first creation uses one fixed default box, so an id derived from the
  // frame plus the rect would collide and the second censor would overwrite the first.
  let document = addCensorRegionAt(projectDocument(300), {
    rect: DEFAULT_CENSOR_RECT,
    startFrame: 60,
  });
  document = addCensorRegionAt(document, {
    rect: DEFAULT_CENSOR_RECT,
    startFrame: 60,
  });
  const regions = listCensorRegions(document);
  assert.equal(regions.length, 2);
  assert.notEqual(regions[0].id, regions[1].id);
});

test('the default timeline box is visible but not full-frame', () => {
  // Full-frame reads as alarming; invisible leaves an unpositioned censor lying
  // around. A centred box that obviously wants dragging is the middle ground.
  assert.ok(DEFAULT_CENSOR_RECT.w > 0.1 && DEFAULT_CENSOR_RECT.w < 0.6);
  assert.ok(DEFAULT_CENSOR_RECT.h > 0.1 && DEFAULT_CENSOR_RECT.h < 0.6);
  const centreX = DEFAULT_CENSOR_RECT.x + DEFAULT_CENSOR_RECT.w / 2;
  const centreY = DEFAULT_CENSOR_RECT.y + DEFAULT_CENSOR_RECT.h / 2;
  assert.ok(Math.abs(centreX - 0.5) < 0.02, 'expected horizontally centred');
  assert.ok(Math.abs(centreY - 0.5) < 0.02, 'expected vertically centred');
});

test('a censor created from a dragged lane span uses that span, not playhead-to-end', () => {
  const document = addCensorRegionAt(projectDocument(300), {
    rect: DEFAULT_CENSOR_RECT,
    startFrame: 45,
    endFrame: 150,
  });
  const [region] = listCensorRegions(document);
  assert.equal(region.startFrame, 45);
  assert.equal(region.endFrame, 150);
});

test('a softness edit survives schema validation and round-trips', async () => {
  const { validateProject } = await import('@rough-cut/project-model');
  let document = addCensorRegionAt(projectDocument(300), {
    id: 'c1',
    rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    startFrame: 30,
    endFrame: 120,
  });
  document = setCensorRegionSoftness(document, 'c1', 0.75);
  assert.equal(listCensorRegions(document)[0].softness, 0.75);
  const validated = validateProject(document);
  assert.equal(validated.assets[0].presentation.censorRegions[0].softness, 0.75);
});

test('raising softness clears a legacy soften:false so the new value takes effect', () => {
  let document = addCensorRegionAt(projectDocument(300), {
    id: 'c1',
    rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    startFrame: 0,
    soften: false,
  });
  assert.equal(listCensorRegions(document)[0].soften, false);
  document = setCensorRegionSoftness(document, 'c1', 0.6);
  const region = listCensorRegions(document)[0];
  // Otherwise the old flag would keep forcing softness to 0 and the slider would
  // appear to do nothing.
  assert.equal(region.soften, true);
  assert.equal(region.softness, 0.6);
});

test('setting the same softness twice is a no-op so undo stays clean', () => {
  let document = addCensorRegionAt(projectDocument(300), {
    id: 'c1', rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, startFrame: 0,
  });
  document = setCensorRegionSoftness(document, 'c1', 0.4);
  assert.equal(setCensorRegionSoftness(document, 'c1', 0.4), document);
  assert.equal(setCensorRegionSoftness(document, 'missing', 0.4), document);
});

test('tracking a censor writes to the newest project, never the one it started from', () => {
  // Following a censor takes tens of seconds. If the write used the document
  // captured when it started, every edit made while it ran would be silently
  // undone — including deleting a censor, which then came back from the dead.
  // Reported from real use on 2026-07-29.
  const source = readFileSync(join(here, 'main.tsx'), 'utf8');
  const trackCensor = source.slice(
    source.indexOf('async function trackCensor('),
    source.indexOf('async function clearCensorTrack('),
  );
  assert.ok(trackCensor.length > 0, 'expected to find the follow-content handler');

  // Everything after the await must read through the ref.
  const afterAwait = trackCensor.slice(trackCensor.indexOf('await window.roughCut.trackCensorRegion'));
  assert.doesNotMatch(
    afterAwait,
    /\bproject\.document\b/,
    'the follow-content handler reads the stale captured document after awaiting',
  );
  assert.match(afterAwait, /latestProjectRef\.current/);
});

test('deleting a censor that is being followed cannot be undone by the tracking finishing', () => {
  // The document-level half of the same guarantee: applying keyframes to a censor
  // that is no longer there must change nothing, so a late-arriving track cannot
  // resurrect it.
  const withRegion = addCensorRegionAt(projectDocument(300), {
    id: 'c1',
    rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    startFrame: 0,
    endFrame: 120,
  });
  const deleted = removeCensorRegion(withRegion, 'c1');
  const lateTrack = setCensorRegionKeyframes(deleted, 'c1', [
    { frame: 0, rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
    { frame: 120, rect: { x: 0.5, y: 0.1, w: 0.2, h: 0.2 } },
  ]);

  assert.equal(lateTrack, deleted, 'a late track must leave the document untouched');
  assert.equal(listCensorRegions(lateTrack).length, 0);
});
