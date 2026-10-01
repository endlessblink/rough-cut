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
  DEFAULT_GRAPHIC_LAYOUT,
  graphicLayerStateAt,
  normalizeGraphicLayout,
  setGraphicLayout,
  resizeGraphicLayout,
  graphicLaneRows,
  reorderGraphic,
  setGraphicTiming,
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

test('every graphic enters and leaves: the layer starts hidden, is fully in after the entrance, and is gone at the end', () => {
  const layout = normalizeGraphicLayout({});
  assert.equal(layout.entrance, 'rise');
  const start = graphicLayerStateAt(layout, 0, 4, 1920, 1080);
  const mid = graphicLayerStateAt(layout, 2, 4, 1920, 1080);
  const end = graphicLayerStateAt(layout, 4, 4, 1920, 1080);
  assert.equal(start.opacity, 0);
  assert.ok(start.ty > 0, 'rises from below');
  assert.deepEqual(mid, { opacity: 1, tx: 0, ty: 0, scale: 1 });
  assert.equal(end.opacity, 0);
  // A graphic shorter than entrance+exit still gets both, squeezed.
  const short = normalizeGraphicLayout({ entranceSec: 2 });
  assert.equal(graphicLayerStateAt(short, 0, 1, 1920, 1080).opacity, 0);
  assert.ok(graphicLayerStateAt(short, 0.55, 1, 1920, 1080).opacity > 0.9);
  // "None" really means no motion.
  assert.equal(graphicLayerStateAt(normalizeGraphicLayout({ entrance: 'none' }), 0, 4, 1920, 1080).opacity, 1);
});

test('the user size/position/opacity apply on top of the entrance', () => {
  const layout = normalizeGraphicLayout({ scale: 1.5, x: 0.1, y: -0.2, opacity: 0.5, entrance: 'pop' });
  assert.deepEqual(graphicLayerStateAt(layout, 2, 4, 1000, 500), { opacity: 0.5, tx: 100, ty: -100, scale: 1.5 });
  assert.ok(graphicLayerStateAt(layout, 0.05, 4, 1000, 500).scale < 1.5, 'pop grows in');
  assert.equal(normalizeGraphicLayout({ scale: 99, opacity: -1, entrance: 'spin' }).scale, 3);
  assert.equal(normalizeGraphicLayout({ opacity: -1 }).opacity, 0.1);
  assert.equal(normalizeGraphicLayout({ entrance: 'spin' }).entrance, DEFAULT_GRAPHIC_LAYOUT.entrance);
});

test('setGraphicLayout saves the layout, is a no-op when nothing changes, and the page carries it', () => {
  const doc = addGraphic(project(), { id: 'g1', title: 'T', html: LOWER_THIRD.html, startFrame: 0, endFrame: 60, timelineFrames: 300 });
  const moved = setGraphicLayout(doc, 'g1', { x: 0.25, scale: 2 });
  assert.equal(listGraphics(moved)[0].layout.x, 0.25);
  assert.equal(listGraphics(moved)[0].layout.scale, 2);
  assert.equal(listGraphics(doc)[0].layout.x, 0, 'older graphics read the default layout');
  assert.equal(setGraphicLayout(moved, 'g1', { x: 0.25 }), moved);
  const page = buildGraphicDocument({ html: LOWER_THIRD.html, layout: listGraphics(moved)[0].layout });
  assert.match(page, /"layout":\{"scale":2,"x":0\.25/);
  assert.match(page, /var rcGraphicLayerStateAt=function graphicLayerStateAt/);
});

test('resizing from a handle pins the opposite side and grows the graphic', () => {
  const W = 1920;
  const H = 1080;
  // Where an unscaled content point lands on the canvas for a layout.
  const place = (layout, px, py) => [W / 2 + layout.x * W + layout.scale * (px - W / 2), H / 2 + layout.y * H + layout.scale * (py - H / 2)];
  const layout = normalizeGraphicLayout({ scale: 1, x: 0.1, y: -0.05 });
  // Content box as drawn: unscaled content 200..800 × 600..900.
  const [x0, y0] = place(layout, 200, 600);
  const [x1, y1] = place(layout, 800, 900);
  const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  const grown = resizeGraphicLayout({ layout, box, handle: 'se', dx: 300, dy: 150, width: W, height: H });
  assert.ok(Math.abs(grown.scale - 1.5) < 0.01);
  const [ax, ay] = place(grown, 200, 600);
  assert.ok(Math.abs(ax - x0) < 2 && Math.abs(ay - y0) < 2, 'top-left corner stays put');
  const east = resizeGraphicLayout({ layout, box, handle: 'w', dx: -600, dy: 999, width: W, height: H });
  assert.ok(Math.abs(east.scale - 2) < 0.01, 'an edge scales by its own axis only');
  const [rx] = place(east, 800, 750);
  assert.ok(Math.abs(rx - x1) < 2, 'dragging the left edge pins the right edge');
  assert.equal(resizeGraphicLayout({ layout, box, handle: 'se', dx: -5000, dy: -5000, width: W, height: H }).scale, 0.25);
});

test('scrolling strips are a runtime loop: the page carries the marquee engine and its bidi-safe styles', () => {
  const page = buildGraphicDocument({ html: '<div data-rc-marquee data-rc-speed="150">סקיל? <b>/</b></div>' });
  assert.match(page, /\.rc-mq-unit\{[^}]*unicode-bidi:isolate/);
  assert.match(page, /function layoutMarquees/);
  assert.match(page, /\(time \* speed\) % width/, 'offset wraps by one unit, so the loop never runs out');
});

test('SVG namespace identifiers are not treated as external URLs, real URLs still are', () => {
  const ok = validateGraphicSpec({ title: 't', durationSec: 3, fields: [], html: '<svg xmlns="http://www.w3.org/2000/svg"></svg><script>document.createElementNS("http://www.w3.org/2000/svg","path")</script>' });
  assert.equal(ok.ok, true);
  const bad = validateGraphicSpec({ title: 't', durationSec: 3, fields: [], html: '<img src="https://example.com/a.png">' });
  assert.equal(bad.ok, false);
  const sneaky = validateGraphicSpec({ title: 't', durationSec: 3, fields: [], html: '<img src="http://www.w3.org/2000/svg.evil.com/x">' });
  assert.equal(sneaky.ok, false, 'only the exact namespace is allowed');
});

test('overlapping graphics stack in rows and can be reordered', () => {
  const rows = graphicLaneRows([
    { id: 'a', startFrame: 0, endFrame: 100 },
    { id: 'b', startFrame: 50, endFrame: 150 },
    { id: 'c', startFrame: 120, endFrame: 200 },
    { id: 'd', startFrame: 60, endFrame: 90 },
  ]);
  assert.deepEqual(rows, { rows: 3, assignment: { a: 0, b: 1, c: 0, d: 2 } });
  let doc = addGraphic(project(), { id: 'g1', html: LOWER_THIRD.html, startFrame: 0, endFrame: 60, timelineFrames: 300 });
  doc = addGraphic(doc, { id: 'g2', html: LOWER_THIRD.html, startFrame: 0, endFrame: 60, timelineFrames: 300 });
  assert.deepEqual(listGraphics(reorderGraphic(doc, 'g2', 'back')).map((g) => g.id), ['g2', 'g1']);
  assert.equal(reorderGraphic(doc, 'g2', 'front'), doc, 'already in front: no change');
});

test('graphics stay sharp at any size: the page is drawn at the shown size and sized by zoom, not a scaled picture', () => {
  const page = buildGraphicDocument({ html: '<div>x</div>' });
  assert.match(page, /body\.style\.zoom = zoom/);
  assert.match(page, /rc-viewport/);
  assert.match(page, /id="rc-root"/, 'direction and size live on a wrapper, so a right-to-left page is never pushed out of view');
  assert.match(page, /html\{direction:ltr!important\}/);
});

test('length changes: hold keeps designed timing, stretch scales time; both carried into the page', () => {
  let doc = addGraphic(project(), { id: 'g1', html: LOWER_THIRD.html, designedSec: 4, startFrame: 0, endFrame: 240, timelineFrames: 300 });
  assert.equal(listGraphics(doc)[0].designedSec, 4);
  assert.equal(listGraphics(doc)[0].timing, 'hold');
  doc = setGraphicTiming(doc, 'g1', 'stretch');
  assert.equal(listGraphics(doc)[0].timing, 'stretch');
  assert.equal(setGraphicTiming(doc, 'g1', 'stretch'), doc);
  const page = buildGraphicDocument({ html: '<div>x</div>', durationSec: 8, timing: 'stretch', designedSec: 4 });
  assert.match(page, /"timing":"stretch","designedSec":4/);
  assert.match(page, /state\.t \* stretchFactor\(\)/);
});
