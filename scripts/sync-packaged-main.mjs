/**
 * Copy the main-process sources into the packaged app.
 *
 * Rough Cut is launched from `dist/rough-cut-mvp-linux-x64/resources/app`, which ships
 * plain `.mjs`. A stale package therefore runs old code while the source tree and its
 * tests look perfectly healthy — which is how an "already fixed" export storm comes back.
 *
 * `packaged-app-guards.test.mjs` fails when the package drifts; this puts it right.
 *
 *   node scripts/sync-packaged-main.mjs [--check]
 *
 * --check reports drift without writing, for use in a pre-launch or CI step.
 */

import { createHash } from 'node:crypto';
import { copyFile, readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const SOURCE = join(REPO, 'apps', 'desktop', 'src', 'main');
const PACKAGED = join(
  REPO, 'dist', 'rough-cut-mvp-linux-x64', 'resources', 'app', 'apps', 'desktop', 'src', 'main',
);

const checkOnly = process.argv.includes('--check');

async function sha(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function main() {
  const packagedExists = await stat(PACKAGED).then((info) => info.isDirectory()).catch(() => false);
  if (!packagedExists) {
    console.log('no packaged app present; nothing to sync');
    return;
  }

  // Only files that already exist in the package — never add new ones, so this cannot
  // quietly reshape what ships.
  const packagedFiles = (await readdir(PACKAGED)).filter((name) => name.endsWith('.mjs') && !name.includes('.test.'));
  const drifted = [];

  for (const name of packagedFiles) {
    const from = join(SOURCE, name);
    const to = join(PACKAGED, name);
    const hasSource = await stat(from).then((info) => info.isFile()).catch(() => false);
    if (!hasSource) continue;
    if (await sha(from) === await sha(to)) continue;
    drifted.push(name);
    if (!checkOnly) await copyFile(from, to);
  }

  if (drifted.length === 0) {
    console.log(`packaged app matches source (${packagedFiles.length} files checked)`);
    return;
  }

  console.log(`${checkOnly ? 'DRIFTED' : 'synced'}: ${drifted.join(', ')}`);
  if (checkOnly) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exitCode = 1;
});
