import test from 'node:test';
import assert from 'node:assert/strict';
import { formatProjectName } from './project-name.mjs';

test('timestamp recording names read as a local date and time', () => {
  process.env.TZ = 'UTC';
  assert.equal(formatProjectName('rough-cut-2026-07-19T18-07-16-622Z', 'en-GB'), 'Sun 19 Jul · 18:07');
});

test('names the user chose are shown unchanged', () => {
  assert.equal(formatProjectName('herdr_1', 'en-GB'), 'herdr_1');
  assert.equal(formatProjectName('Recording Apr 26 2026 - 13:28', 'en-GB'), 'Recording Apr 26 2026 - 13:28');
});
