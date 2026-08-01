/**
 * The app people actually launch must carry the export protections.
 *
 * Rough Cut runs from `dist/rough-cut-mvp-linux-x64/resources/app`, which ships plain
 * `.mjs` copied from source. That means the shipped app can silently drift from the
 * source tree — a stale package, a partial rebuild, or a restored backup all produce an
 * app with the tests passing and the protections absent. That is precisely how a machine
 * gets killed by code that "was fixed".
 *
 * These tests compare the packaged copies against source byte-for-byte. If they fail,
 * re-copy the files rather than editing the package by hand:
 *
 *   node scripts/sync-packaged-main.mjs
 *
 * They skip when no package is present (a clean checkout, or CI), so they never block
 * work that has nothing to do with packaging.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');
const PACKAGED = join(
  REPO, 'dist', 'rough-cut-mvp-linux-x64', 'resources', 'app', 'apps', 'desktop', 'src', 'main',
);

// Each guarded file, and the marker that proves the protection survived the copy.
const GUARDED = [
  ['freecut-host.mjs', 'inFlightStyledPrograms', 'single-flight renders'],
  ['export-service.mjs', 'memoryCappedCommand', 'the ffmpeg memory ceiling'],
  ['export-service.mjs', 'segmentInputLabels', 'per-segment inputs'],
];

const packaged = existsSync(PACKAGED);
const skip = packaged ? false : 'no packaged app present';

function sha(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

for (const [file, marker, description] of GUARDED) {
  test(`the packaged app keeps ${description}`, { skip }, () => {
    const target = join(PACKAGED, file);
    assert.ok(existsSync(target), `${file} missing from the packaged app`);
    assert.ok(
      readFileSync(target, 'utf8').includes(marker),
      `the packaged ${file} has lost ${description} — re-run scripts/sync-packaged-main.mjs`,
    );
  });
}

for (const file of [...new Set(GUARDED.map(([name]) => name))]) {
  test(`the packaged ${file} is identical to source`, { skip }, () => {
    assert.equal(
      sha(join(PACKAGED, file)),
      sha(join(HERE, file)),
      `the packaged ${file} has drifted from source — re-run scripts/sync-packaged-main.mjs`,
    );
  });
}
