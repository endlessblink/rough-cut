import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

test('styled video preview reads cursor events through the recording asset accessor', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');

  assert.match(source, /getCursorEvents\(document\)/);
  assert.doesNotMatch(source, /assets\?\.\[0\].*cursorEvents/s);
});

test('styled video preview draws cursor from the resolver source frame', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');

  assert.match(source, /preferredPlaybackAssetId: recordingAssetId/);
  assert.match(source, /resolveCursorSourceFrame\(frame, recordingAssetId, currentFrame\)/);
  assert.match(source, /cursorAtFrame\(cursorEvents, cursorSourceFrame\)/);
  assert.doesNotMatch(source, /cursorAtFrame\(cursorEvents, currentFrame\)/);
});
