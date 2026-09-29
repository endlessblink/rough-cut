import assert from 'node:assert/strict';
import { test } from 'node:test';

import { canonicalizeProjectDocument, createAsset, createProject, validateProject } from '@rough-cut/project-model';

import {
  addGraphic,
  buildGraphicDocument,
  graphicsAtFrame,
  listGraphics,
  moveGraphic,
  removeGraphic,
  replaceGraphicContent,
  updateGraphicFields,
  validateGraphicSpec,
} from './motion-graphics.mjs';

const LOWER_THIRD = {
  title: 'Lower third',
  durationSec: 4,
  html: '<style>.bar{position:absolute;left:80px;bottom:120px;color:var(--rc-textColor);animation:in .6s both}@keyframes in{from{opacity:0}}</style><div class="bar" data-rc-field="name"></div>',
  fields: [
    { key: 'name', label: 'Name', type: 'text', value: 'Noam' },
    { key: 'textColor', label: 'Text colour', type: 'color', value: '#ffffff' },
  ],
};

function project() {
  return canonicalizeProjectDocument(createProject({ assets: [createAsset('recording', '/tmp/screen.mp4', { duration: 300 })] }));
}

test('a well-formed graphic validates and keeps its fields', () => {
  const result = validateGraphicSpec(LOWER_THIRD);
  assert.equal(result.ok, true);
  assert.equal(result.graphic.fields.length, 2);
  assert.equal(result.graphic.durationSec, 4);
});

test('graphics that could reach outside the page are rejected', () => {
  for (const html of [
    '<img src="https://example.com/a.png">',
    '<script>fetch("/x")</script>',
    '<iframe></iframe>',
    '<style>@import "x.css";</style>',
    '<script>localStorage.x=1</script>',
    '<script>window.parent.postMessage(1,"*")</script>',
  ]) {
    const result = validateGraphicSpec({ ...LOWER_THIRD, html });
    assert.equal(result.ok, false, html);
  }
});

test('ordinary words that look like APIs are not rejected', () => {
  const result = validateGraphicSpec({ ...LOWER_THIRD, html: '<div>How we fetch data faster</div>' });
  assert.equal(result.ok, true);
});

test('bad fields, durations and empty HTML are reported', () => {
  assert.equal(validateGraphicSpec({ ...LOWER_THIRD, html: '' }).ok, false);
  assert.equal(validateGraphicSpec({ ...LOWER_THIRD, durationSec: 0 }).ok, false);
  assert.equal(validateGraphicSpec({ ...LOWER_THIRD, fields: [{ key: 'Bad Key', type: 'text', value: 'x' }] }).ok, false);
  assert.equal(validateGraphicSpec({ ...LOWER_THIRD, fields: [LOWER_THIRD.fields[0], LOWER_THIRD.fields[0]] }).ok, false);
});

test('the page is sized to the canvas, blocks the network and carries the seek runtime', () => {
  const page = buildGraphicDocument({ html: LOWER_THIRD.html, fields: LOWER_THIRD.fields, width: 1080, height: 1920 });
  assert.match(page, /Content-Security-Policy/);
  assert.match(page, /default-src 'none'/);
  assert.match(page, /width:1080px;height:1920px/);
  assert.match(page, /background:transparent/);
  assert.match(page, /getAnimations\(\)/);
  assert.match(page, /"key":"name"/);
});

test('field values cannot break out of the injected script', () => {
  const page = buildGraphicDocument({ html: '<div></div>', fields: [{ key: 'name', label: 'Name', type: 'text', value: '</script><script>alert(1)</script>' }] });
  assert.doesNotMatch(page, /<\/script><script>alert/);
});

test('a graphic added to a real project survives validation and canonicalization', () => {
  const next = addGraphic(project(), { id: 'g1', title: 'Lower third', html: LOWER_THIRD.html, fields: LOWER_THIRD.fields, startFrame: 30, endFrame: 150, timelineFrames: 300 });
  const reparsed = validateProject(canonicalizeProjectDocument(JSON.parse(JSON.stringify(next))));
  const graphics = listGraphics(reparsed);
  assert.equal(graphics.length, 1);
  assert.equal(graphics[0].startFrame, 30);
  assert.equal(graphics[0].endFrame, 150);
  assert.equal(graphics[0].fields[0].value, 'Noam');
});

test('graphics are found by frame, in layer order', () => {
  let doc = addGraphic(project(), { id: 'a', html: '<div>a</div>', startFrame: 0, endFrame: 100 });
  doc = addGraphic(doc, { id: 'b', html: '<div>b</div>', startFrame: 50, endFrame: 200 });
  assert.deepEqual(graphicsAtFrame(doc, 60).map((graphic) => graphic.id), ['a', 'b']);
  assert.deepEqual(graphicsAtFrame(doc, 100).map((graphic) => graphic.id), ['b']);
  assert.deepEqual(graphicsAtFrame(doc, 200), []);
});

test('move, field edits, content swaps and removal are pure and report no-ops by identity', () => {
  const doc = addGraphic(project(), { id: 'g', html: LOWER_THIRD.html, fields: LOWER_THIRD.fields, startFrame: 30, endFrame: 150, timelineFrames: 300 });
  const moved = moveGraphic(doc, 'g', { startFrame: 60, endFrame: 400, timelineFrames: 300 });
  assert.deepEqual([listGraphics(moved)[0].startFrame, listGraphics(moved)[0].endFrame], [60, 300]);
  assert.equal(moveGraphic(moved, 'g', { startFrame: 60, endFrame: 300, timelineFrames: 300 }), moved);

  const renamed = updateGraphicFields(doc, 'g', { name: 'נועם' });
  assert.equal(listGraphics(renamed)[0].fields[0].value, 'נועם');
  assert.equal(updateGraphicFields(renamed, 'g', { name: 'נועם' }), renamed);
  assert.equal(listGraphics(doc)[0].fields[0].value, 'Noam', 'the original document is untouched');

  const swapped = replaceGraphicContent(doc, 'g', { title: 'Slide in', html: '<div>new</div>', fields: [], request: 'slide in' });
  assert.equal(listGraphics(swapped)[0].html, '<div>new</div>');
  assert.equal(listGraphics(swapped)[0].startFrame, 30);

  assert.equal(listGraphics(removeGraphic(doc, 'g')).length, 0);
  assert.equal(removeGraphic(doc, 'missing'), doc);
});

test('a graphic never collapses to zero length or runs past the timeline', () => {
  const doc = addGraphic(project(), { id: 'g', html: '<div></div>', startFrame: 298, endFrame: 290, timelineFrames: 300 });
  const [graphic] = listGraphics(doc);
  assert.ok(graphic.endFrame > graphic.startFrame);
  assert.ok(graphic.endFrame <= 300);
});

test('dragging a graphic keeps its length, trimming keeps a minimum, both stay on the timeline', async () => {
  const { dragGraphicRange } = await import('./motion-graphics.mjs');
  const range = { startFrame: 30, endFrame: 90 };
  assert.deepEqual(dragGraphicRange(range, { mode: 'move', delta: 500, totalFrames: 300 }), { startFrame: 240, endFrame: 300 });
  assert.deepEqual(dragGraphicRange(range, { mode: 'move', delta: -500, totalFrames: 300 }), { startFrame: 0, endFrame: 60 });
  assert.deepEqual(dragGraphicRange(range, { mode: 'start', delta: 100, totalFrames: 300 }), { startFrame: 84, endFrame: 90 });
  assert.deepEqual(dragGraphicRange(range, { mode: 'end', delta: -100, totalFrames: 300 }), { startFrame: 30, endFrame: 36 });
  assert.deepEqual(dragGraphicRange(range, { mode: 'end', delta: 1000, totalFrames: 300 }), { startFrame: 30, endFrame: 300 });
});

test('only a start time in the request places the graphic; a length does not', async () => {
  const { requestMentionsTime } = await import('./motion-graphics.mjs');
  for (const text of ['lower third at 0:05', 'title at 12s', 'from 5 seconds', 'כותרת ב-0:05']) assert.equal(requestMentionsTime(text), true, text);
  for (const text of ['Lower third for 4 seconds', 'כותרת ל-5 שניות', 'name card for Noam', '3 steps of setup']) assert.equal(requestMentionsTime(text), false, text);
});

test('a still graphic freezes after its entrance and the page knows it', async () => {
  const { graphicHoldSec, setGraphicAnimate } = await import('./motion-graphics.mjs');
  assert.equal(graphicHoldSec(4), 1.2);
  assert.equal(graphicHoldSec(1), 0.5);
  const page = buildGraphicDocument({ html: '<div></div>', animate: false, holdSec: 0.8 });
  assert.match(page, /"animate":false/);
  assert.match(page, /"holdSec":0.8/);
  const doc = addGraphic(project(), { id: 'g', html: '<div></div>', startFrame: 0, endFrame: 60 });
  assert.equal(listGraphics(doc)[0].animate, true);
  const still = setGraphicAnimate(doc, 'g', false);
  assert.equal(listGraphics(still)[0].animate, false);
  assert.equal(setGraphicAnimate(still, 'g', false), still);
});

test('the page turns Hebrew text right-to-left by itself', () => {
  const page = buildGraphicDocument({ html: '<div data-rc-field="name"></div>', fields: [{ key: 'name', label: 'Name', type: 'text', value: 'נועם' }] });
  assert.match(page, /setAttribute\('dir', 'rtl'\)/);
  assert.match(page, /u0590/);
});
