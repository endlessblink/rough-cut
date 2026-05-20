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

test('styled video preview draws cursor from source media time without changing video resolver asset', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');

  assert.match(source, /cursorAtTimeMs\(cursorEvents, \(cursorFrame \/ fps\) \* 1000, fps\)/);
  assert.doesNotMatch(source, /preferredPlaybackAssetId: recordingAssetId/);
});

test('styled video preview can resolve timeline-time playback through the shared resolver', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');

  assert.match(source, /timeMode\?: PreviewTimeMode/);
  assert.match(source, /resolveTimelinePreviewFrame\(document, currentFrame/);
  assert.match(source, /resolveTimelineFrame\(project\.document as unknown as ProjectDocument, timelineFrame\)/);
  assert.match(source, /if \(timeMode === 'timeline' && !screenLayer\)/);
  assert.match(source, /if \(timeMode === 'timeline'\) return;/);
  assert.match(source, /timeMode !== 'timeline' \|\| video\.paused/);
});

test('styled video preview surfaces offscreen cursor state without clamping cursor draw', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');

  assert.match(source, /getCursorBoundsStatus\(cursorPos, sourceWidth, sourceHeight\)/);
  assert.match(source, /cursorBounds\?\.inside !== false/);
  assert.match(source, /cursorOffscreenHint/);
  assert.doesNotMatch(source, /drawCursorPath\(ctx, Math\.max/);
});
