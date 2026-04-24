import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import {
  getTrayIconDir,
  resetTrayIconCounter,
  writeTrayIconFile,
} from './tray-icon-file.mjs';

// 1x1 red PNG, base64-encoded. Deterministic, tiny.
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function cleanupTrayIconDir() {
  const dir = getTrayIconDir();
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

test.beforeEach(() => {
  cleanupTrayIconDir();
  resetTrayIconCounter();
});

test.after(() => {
  cleanupTrayIconDir();
});

// Regression guard for commit daa7cca (Linux tray singleton + KDE icon cache
// workaround). KStatusNotifierItem caches the bitmap by pathname — re-writing
// the same path doesn't force a repaint. Every setImage() must see a fresh,
// never-seen-before path.
test('writeTrayIconFile returns a distinct path on each call (KDE cache workaround)', () => {
  const p1 = writeTrayIconFile(TINY_PNG_DATA_URL, 'red');
  const p2 = writeTrayIconFile(TINY_PNG_DATA_URL, 'red');
  const p3 = writeTrayIconFile(TINY_PNG_DATA_URL, 'red');

  assert.notEqual(p1, p2);
  assert.notEqual(p2, p3);
  assert.notEqual(p1, p3);

  // And all three must actually exist on disk — Electron's Tray reads the
  // file synchronously at setImage time.
  for (const p of [p1, p2, p3]) {
    assert.ok(existsSync(p), `expected ${p} to exist`);
  }
});

test('path contains the tag and PID so it is traceable', () => {
  const p = writeTrayIconFile(TINY_PNG_DATA_URL, 'empty');
  assert.match(p, /tray-empty-\d+-\d+\.png$/);
  assert.ok(p.includes(String(process.pid)));
});

test('tag segregates filenames so red/empty transitions do not collide', () => {
  const red = writeTrayIconFile(TINY_PNG_DATA_URL, 'red');
  const empty = writeTrayIconFile(TINY_PNG_DATA_URL, 'empty');

  assert.notEqual(red, empty);
  assert.ok(red.includes('tray-red-'));
  assert.ok(empty.includes('tray-empty-'));
});

test('decoded file contents match the data-URL payload', () => {
  const p = writeTrayIconFile(TINY_PNG_DATA_URL, 'red');
  const bytes = readFileSync(p);
  const expected = Buffer.from(TINY_PNG_DATA_URL.split(',')[1], 'base64');
  assert.deepEqual(bytes, expected);
});
