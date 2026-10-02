#!/usr/bin/env node
// Sort the flat projects folder into one dated folder per video.
//
//   node scripts/organize-projects.mjs                 dry run: shows exactly what would move (changes nothing)
//   node scripts/organize-projects.mjs --apply         does it (Rough Cut must be closed); rolls back on any problem
//   node scripts/organize-projects.mjs --undo <manifest.json>   puts everything back byte for byte
//   [folder]  default: ~/Documents/Rough Cut MVP/recordings

import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { applyOrganize, planOrganize, undoOrganize } from '../apps/desktop/src/main/organize-projects.mjs';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const valueOf = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null; };
const positional = argv.filter((arg, i) => !arg.startsWith('--') && !(i > 0 && argv[i - 1] === '--undo'));
const root = resolve(positional[0] || join(homedir(), 'Documents', 'Rough Cut MVP', 'recordings'));

const gb = (bytes) => `${(bytes / 1e9).toFixed(2)} GB`;

function appIsRunning() {
  const result = spawnSync('pgrep', ['-f', 'rough-cut-mvp-linux-x64/electron'], { encoding: 'utf8' });
  return (result.stdout || '').split('\n').filter(Boolean).length;
}

if (valueOf('undo')) {
  const done = await undoOrganize(resolve(valueOf('undo')));
  console.log(`Undone: ${done.restored} files are back where they were.`);
  process.exit(0);
}

const plan = await planOrganize(root);
console.log(`Folder: ${root}`);
console.log(`${plan.totals.files} files (${gb(plan.totals.bytes)}) would move into ${plan.totals.folders} folders. Nothing is copied: files are renamed in place.\n`);
const unfiled = plan.groups.filter((group) => group.kind === 'orphan');
for (const group of plan.groups.filter((item) => item.kind !== 'orphan')) {
  const videos = group.files.filter((file) => /\.(mp4|mkv)$/i.test(file.name)).length;
  console.log(`${group.folderName}/   ${group.files.length} files, ${gb(group.bytes)}${videos ? `, ${videos} video file(s)` : ''}`);
}
if (unfiled.length > 0) {
  console.log(`_Unfiled recordings/   ${unfiled.length} recordings that no project uses (${gb(unfiled.reduce((sum, group) => sum + group.bytes, 0))}), each in its own dated folder inside`);
}
if (plan.leftInPlace.length > 0) {
  console.log(`\nLeft exactly where they are (${plan.leftInPlace.length}):`);
  for (const item of plan.leftInPlace) console.log(`  ${item.name}   (${item.reason})`);
}
if (plan.unreadable.length > 0) console.log(`\nProjects that cannot be read (never moved): ${plan.unreadable.join(', ')}`);

if (!flag('apply')) {
  console.log('\nDRY RUN: nothing was changed. To do it: close Rough Cut, then run with --apply.');
  process.exit(0);
}

const running = appIsRunning();
if (running > 0 && !flag('force-running')) {
  console.error(`\nRough Cut is running (${running} process(es)). Close it first, then run this again. Nothing was changed.`);
  process.exit(2);
}
const result = await applyOrganize(root, plan);
console.log(`\nDone: ${result.moved} files moved into ${result.folders} folders, ${result.projectsRewritten} projects updated and checked.`);
console.log(`Undo any time: node scripts/organize-projects.mjs --undo "${result.manifestPath}"`);
