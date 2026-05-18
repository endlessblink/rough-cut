import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

test('NLE timeline exposes selected-clip trim handles wired to trim mutation', () => {
  const source = readFileSync(join(here, 'nle-timeline.tsx'), 'utf8');

  assert.match(source, /trimClipById/);
  assert.match(source, /nleClipTrimHandle left/);
  assert.match(source, /nleClipTrimHandle right/);
  assert.match(source, /aria-label="Trim selected clip start"/);
  assert.match(source, /aria-label="Trim selected clip end"/);
});
