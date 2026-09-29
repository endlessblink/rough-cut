import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createGraphicsStyleStore, defaultGraphicsStylePath, normalizeGraphicsStyle } from './graphics-style-store.mjs';

test('the style lives under appData, not the per-build userData', () => {
  assert.equal(defaultGraphicsStylePath('/home/u/.config'), '/home/u/.config/rough-cut-mvp/graphics-style.json');
});

test('bad colours and font names fall back to the defaults', () => {
  const style = normalizeGraphicsStyle({ primaryColor: 'red; }', fontFamily: 'x</style>', accentColor: '#ABCDEF' });
  assert.equal(style.primaryColor, '#1f6feb');
  assert.equal(style.fontFamily, 'Heebo');
  assert.equal(style.accentColor, '#ABCDEF');
});

test('a saved style is read back, and a missing file gives the defaults', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'graphics-style-'));
  const store = createGraphicsStyleStore({ filePath: join(dir, 'nested', 'style.json') });
  assert.equal((await store.get()).fontFamily, 'Heebo');
  await store.set({ primaryColor: '#101010', notes: 'Rounded corners' });
  const read = await store.get();
  assert.equal(read.primaryColor, '#101010');
  assert.equal(read.notes, 'Rounded corners');
});

test('style and creativity are remembered, and partial saves never wipe other fields', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'graphics-look-'));
  const store = createGraphicsStyleStore({ filePath: join(dir, 'style.json') });
  assert.equal((await store.get()).styleId, 'studio');
  assert.equal((await store.get()).creativity, 3);
  await store.set({ notes: 'No caps' });
  await store.set({ styleId: 'noir' });
  await store.set({ creativity: 5 });
  const read = await store.get();
  assert.deepEqual([read.styleId, read.creativity, read.notes], ['noir', 5, 'No caps']);
  await store.set({ styleId: 'made-up', creativity: 12 });
  const clamped = await store.get();
  assert.deepEqual([clamped.styleId, clamped.creativity], ['studio', 5]);
});
