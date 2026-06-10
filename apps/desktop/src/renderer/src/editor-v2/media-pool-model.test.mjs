import test from 'node:test';
import assert from 'node:assert/strict';
import { assetBin, binsForAssets, filterAssets, shortProjectName } from './media-pool-model.mjs';

test('assetBin classifies by asset type with video fallback', () => {
  assert.equal(assetBin({ type: 'audio' }), 'audio');
  assert.equal(assetBin({ type: 'image' }), 'stills');
  assert.equal(assetBin({ type: 'still' }), 'stills');
  assert.equal(assetBin({ type: 'recording' }), 'video');
  assert.equal(assetBin({}), 'video');
});

test('binsForAssets only offers bins that exist, always with All + Generated', () => {
  assert.deepEqual(
    binsForAssets([]).map((bin) => bin.id),
    ['all', 'generated'],
  );
  assert.deepEqual(
    binsForAssets([{ type: 'recording' }, { type: 'audio' }]).map((bin) => bin.id),
    ['all', 'video', 'audio', 'generated'],
  );
});

test('filterAssets filters by bin and searches the rendered label', () => {
  const assets = [
    { type: 'recording', name: 'screen take' },
    { type: 'audio', name: 'mic take' },
    { type: 'image', name: 'intro card' },
  ];
  assert.equal(filterAssets(assets, 'all', '').length, 3);
  assert.deepEqual(filterAssets(assets, 'audio', '').map(({ index }) => index), [1]);
  assert.deepEqual(filterAssets(assets, 'all', 'intro').map(({ index }) => index), [2]);
  assert.equal(filterAssets(assets, 'video', 'mic').length, 0);
  // Index survives filtering so assetLabel numbering stays stable.
  assert.deepEqual(filterAssets(assets, 'stills', '').map(({ index }) => index), [2]);
});

test('shortProjectName humanizes auto-generated recording names only', () => {
  assert.equal(shortProjectName('rough-cut-2026-06-02T15-49-33-067Z'), 'Take 6/2 15:49');
  assert.equal(shortProjectName('My demo edit'), 'My demo edit');
  assert.equal(shortProjectName(''), '');
});
