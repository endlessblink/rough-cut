import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

test('Editor v2 panes have no eyebrow header row (banned pattern)', () => {
  const source = readFileSync(join(here, 'editor-v2-layout.tsx'), 'utf8');

  // The "MEDIA POOL / SOURCE / TIMELINE / INSPECTOR" label strip was removed;
  // viewers identify themselves with a small in-picture tag instead.
  assert.doesNotMatch(source, /ev2PaneHead/);
  assert.match(source, /ev2ViewerTag/);
  // Viewer tags show human names, not machine project ids.
  assert.match(source, /shortProjectName\(project\.document\.name\)/);
  assert.match(source, /assetLabel\(primaryAsset, 0\)/);
});

test('Editor v2 inspector starts at content and keeps working toggles', () => {
  const source = readFileSync(join(here, 'editor-v2-layout.tsx'), 'utf8');

  assert.match(source, /ev2InspectorBody/);
  assert.match(source, /role="switch"/);
  assert.match(source, /ev2InspectorEmpty/);
});
