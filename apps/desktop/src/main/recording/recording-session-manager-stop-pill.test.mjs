import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = join(__dirname, 'recording-session-manager.mjs');
const SOURCE = readFileSync(SOURCE_PATH, 'utf8');

test('TASK-196: Linux recording uses the Stop pill instead of the tray', () => {
  assert.match(
    SOURCE,
    /if \(IS_LINUX\) \{\s*createStopPillWindow\(\);\s*\} else \{\s*tray = createTray\(\);\s*\}/s,
    'startRecording should route Linux stop controls through createStopPillWindow() and non-Linux through createTray().',
  );
});

test('TASK-196: createTray refuses Linux callers', () => {
  assert.match(
    SOURCE,
    /function createTray\(\) \{\s*if \(IS_LINUX\) \{\s*console\.warn\('\[session-manager\] createTray\(\) ignored on Linux; using Stop pill instead\.'\);\s*return null;\s*\}/s,
    'createTray() should explicitly no-op on Linux so stale tray code cannot be reintroduced there.',
  );
});

test('TASK-196: cleanup and quit paths always destroy the Stop pill', () => {
  const destroyCalls = SOURCE.match(/destroyStopPillWindow\(\)/g) ?? [];
  assert.ok(
    destroyCalls.length >= 5,
    `expected multiple destroyStopPillWindow() safety-net calls, found ${destroyCalls.length}`,
  );
  assert.match(
    SOURCE,
    /function _cleanup\(\) \{[\s\S]*destroyStopPillWindow\(\);/,
    '_cleanup() must destroy the Stop pill.',
  );
  assert.match(
    SOURCE,
    /async function handleBeforeQuit\(event\) \{[\s\S]*destroyStopPillWindow\(\);[\s\S]*destroyStopPillWindow\(\);[\s\S]*destroyStopPillWindow\(\);/,
    'handleBeforeQuit() must destroy the Stop pill on every quit path.',
  );
});
