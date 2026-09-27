import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildRegionSelectorHtml, parseRegionSelectorTitle, regionFromOverlayRect, REGION_RESULT_PREFIX } from './region-selector.mjs';

const right = { id: 2, label: 'DP-2', scaleFactor: 1, bounds: { x: 1920, y: 0, width: 1920, height: 1080 } };

test('a region drawn on the right screen records at that screen\'s position', () => {
  assert.deepEqual(regionFromOverlayRect({ x: 120, y: 110, width: 400, height: 250 }, right), {
    mode: 'region', x: 120, y: 110, width: 400, height: 250, absoluteX: 2040, absoluteY: 110, displayId: '2', displayLabel: 'DP-2',
  });
});

test('a region is clamped inside its screen and tiny drags are rejected', () => {
  assert.equal(regionFromOverlayRect({ x: 1800, y: 1000, width: 400, height: 200 }, right).width, 120);
  assert.equal(regionFromOverlayRect({ x: 10, y: 10, width: 1, height: 50 }, right), null);
});

test('the overlay reports apply and cancel through its title', () => {
  assert.deepEqual(parseRegionSelectorTitle(`${REGION_RESULT_PREFIX}{"rect":{"x":1,"y":2,"width":3,"height":4}}`), { rect: { x: 1, y: 2, width: 3, height: 4 } });
  assert.deepEqual(parseRegionSelectorTitle(`${REGION_RESULT_PREFIX}{"cancelled":true}`), { cancelled: true });
  assert.equal(parseRegionSelectorTitle('Select region'), null);
  const html = buildRegionSelectorHtml({});
  for (const id of ['selection', 'apply', 'cancel']) assert.match(html, new RegExp(`id="${id}"`));
});

test('the region picker request is answered by the main process', async () => {
  // 2026-09-27: the renderer had called this channel since May, but no handler
  // was registered, so choosing Region always failed.
  const source = await readFile(new URL('./index.mjs', import.meta.url), 'utf8');
  assert.match(source, /ipcMain\.handle\(IPC_CHANNELS\.RECORDING_SELECT_CAPTURE_REGION,/);
  assert.match(source, /previewSourceId: sources\.find\(\(source\) => String\(source\.display_id\) === display\.id\)/);
});
