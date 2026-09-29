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
