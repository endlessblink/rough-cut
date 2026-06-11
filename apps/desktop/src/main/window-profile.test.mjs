import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

async function readMainSource() {
  return readFile(join(here, 'index.mjs'), 'utf8');
}

test('recording window profile compacts the native BrowserWindow', async () => {
  const source = await readMainSource();
  assert.ok(
    source.includes('ipcMain.handle(IPC_CHANNELS.APP_SET_WINDOW_PROFILE'),
    'main process must expose an app:set-window-profile handler',
  );
  assert.ok(
    source.includes("profile === 'recording'"),
    'handler must have an explicit recording profile branch',
  );
  assert.ok(
    source.includes('senderWindow.setMinimumSize(720, 560)'),
    'recording profile must lower the minimum size before compacting',
  );
  assert.ok(
    source.includes('senderWindow.setSize(760, 620)'),
    'recording profile must resize the native window to the compact recorder size',
  );
  assert.ok(
    source.includes('studioWindowBoundsById.set(senderWindow.id, senderWindow.getBounds())'),
    'recording profile must preserve the previous studio bounds before compacting',
  );
});

test('studio window profile restores normal editor bounds', async () => {
  const source = await readMainSource();
  assert.ok(
    source.includes("profile === 'studio'"),
    'handler must have an explicit studio profile branch',
  );
  assert.ok(
    source.includes('studioWindowBoundsById.delete(senderWindow.id)'),
    'studio profile must clear stored bounds before expanding the editor',
  );
  assert.ok(
    source.includes('const smokeBounds = requestedSmokeWindowBounds()'),
    'studio profile must preserve deterministic smoke-test bounds when requested',
  );
  assert.ok(
    source.includes('senderWindow.setSize(smokeBounds.width, smokeBounds.height)'),
    'studio profile must use explicit smoke-test dimensions when provided',
  );
  assert.ok(
    source.includes('maximizeStudioWindow(senderWindow)'),
    'studio profile must maximize the editor outside smoke tests',
  );
  assert.ok(
    source.includes('function maximizeStudioWindow(window)'),
    'studio maximization must stay centralized so create/open/profile paths agree',
  );
  assert.ok(
    source.includes('window.maximize()'),
    'studio maximization must call the native BrowserWindow maximize API',
  );
});
