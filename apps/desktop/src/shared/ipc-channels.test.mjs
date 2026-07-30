import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { IPC_CHANNELS as SHARED_CHANNELS } from './ipc-channels.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// Regression guard for the contract between shared/ipc-channels.mjs and
// preload/index.cjs. The preload is a CJS sandbox and can't import from
// shared, so it carries its own IPC_CHANNELS literal. Two failure modes
// have bitten us before:
//
//   1. A new bridge function is added in preload (e.g.
//      pickImportFile: () => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_PICK_IMPORT_FILE))
//      but the corresponding key isn't added to the local IPC_CHANNELS literal.
//      `IPC_CHANNELS.LIBRARY_PICK_IMPORT_FILE` then evaluates to `undefined`,
//      and the renderer invokes channel `undefined` — main never receives it.
//
//   2. The same key exists in both files but with different values, so the
//      renderer invokes one channel string and main listens on a different
//      one — same silent breakage.
//
// This test parses preload as text, extracts the keys referenced as
// `IPC_CHANNELS.X` and the keys actually defined in the local literal, then
// requires every referenced key to be defined locally AND to match the
// shared value.

async function readPreload() {
  const path = join(here, '..', 'preload', 'index.cjs');
  return readFile(path, 'utf8');
}

function extractReferencedKeys(source) {
  const referenced = new Set();
  const re = /IPC_CHANNELS\.([A-Z0-9_]+)/g;
  let m;
  while ((m = re.exec(source)) !== null) referenced.add(m[1]);
  return referenced;
}

function extractDefinedEntries(source) {
  // Find the body of the local IPC_CHANNELS literal in preload.
  const opener = source.indexOf('const IPC_CHANNELS = {');
  assert.ok(opener >= 0, 'preload must declare `const IPC_CHANNELS = {`');
  // Walk forward, balancing braces.
  let depth = 0;
  let end = -1;
  for (let i = opener; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  assert.ok(end > opener, 'preload IPC_CHANNELS literal is unbalanced');
  const body = source.slice(opener, end + 1);
  const entries = new Map();
  const re = /\b([A-Z][A-Z0-9_]+)\s*:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(body)) !== null) entries.set(m[1], m[2]);
  return entries;
}

test('every IPC_CHANNELS.X referenced in preload is defined in the local literal', async () => {
  const source = await readPreload();
  const referenced = extractReferencedKeys(source);
  const defined = extractDefinedEntries(source);
  const missing = [...referenced].filter((k) => !defined.has(k));
  assert.equal(
    missing.length,
    0,
    `Preload bridges reference these keys but the local IPC_CHANNELS literal is missing them:\n  - ${missing.join('\n  - ')}`,
  );
});

test('preload IPC_CHANNELS values match shared/ipc-channels.mjs for every shared key', async () => {
  const source = await readPreload();
  const defined = extractDefinedEntries(source);
  const mismatches = [];
  for (const [name, value] of defined) {
    if (!(name in SHARED_CHANNELS)) {
      mismatches.push(`${name}: defined in preload but not in shared`);
      continue;
    }
    if (SHARED_CHANNELS[name] !== value) {
      mismatches.push(`${name}: preload="${value}" vs shared="${SHARED_CHANNELS[name]}"`);
    }
  }
  assert.equal(
    mismatches.length,
    0,
    `Preload IPC_CHANNELS drift vs shared/ipc-channels.mjs:\n  - ${mismatches.join('\n  - ')}`,
  );
});

test('clip visuals channel is part of the IPC contract', async () => {
  const { IPC_CHANNELS } = await import('./ipc-channels.mjs');
  assert.equal(IPC_CHANNELS.CLIP_VISUALS_GET, 'clip-visuals:get');
});

test('visual discontinuity inspection is part of the IPC contract', async () => {
  const { IPC_CHANNELS } = await import('./ipc-channels.mjs');
  assert.equal(
    IPC_CHANNELS.VISUAL_DISCONTINUITY_INSPECT,
    'visual-discontinuity:inspect',
  );
});

test('debug dump channel is part of the IPC contract', async () => {
  const { IPC_CHANNELS } = await import('./ipc-channels.mjs');
  assert.equal(IPC_CHANNELS.DEBUG_DUMP_SAVE, 'debug:dump-save');
});

test('window profile channel is part of the IPC contract', async () => {
  const { IPC_CHANNELS } = await import('./ipc-channels.mjs');
  assert.equal(IPC_CHANNELS.APP_SET_WINDOW_PROFILE, 'app:set-window-profile');
});

test('censor tracking channel is part of the IPC contract', async () => {
  const { IPC_CHANNELS } = await import('./ipc-channels.mjs');
  assert.equal(IPC_CHANNELS.CENSOR_TRACK, 'censor:track');
});

test('censor tracking progress channel is part of the IPC contract', async () => {
  const { IPC_CHANNELS } = await import('./ipc-channels.mjs');
  assert.equal(IPC_CHANNELS.CENSOR_TRACK_PROGRESS, 'censor:track-progress');
});
