// Interactive walkthrough of the nine checks that need a person. Run it yourself, in a normal terminal:
//
//   node scripts/windows/guided-checks.mjs            go through every check that is not recorded yet
//   node scripts/windows/guided-checks.mjs <key>      just one
//
// For each check it shows exactly what to do, then asks whether it passed. Only your typed "y" and note are recorded,
// through the same `confirm` command the gate reads (which refuses to run without an interactive terminal).

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';

const root = resolve(import.meta.dirname, '..', '..');
const verify = join(root, 'scripts', 'windows', 'verify-windows-port.mjs');
const evidencePath = join(root, '.git', 'windows-port-evidence.json');
const installer = join(root, 'release', 'windows', 'Rough-Cut-0.1.0-beta.8-Setup.exe');
const portable = join(root, 'dist', 'rough-cut-mvp-win32-x64', 'Rough Cut.exe');

const CHECKS = {
  'record-all-sources': ['Record 60 seconds with everything on', [
    `Start the app (${portable}).`,
    'Open Record. Turn on the microphone, System audio and the camera. Start recording.',
    'While recording: talk, play some music or a video with sound, and move in front of the camera.',
    'Stop after about 60 s. In the editor, play it back.',
    'PASS if: the picture is smooth, your voice AND the system sound are both audible, and the camera stays in sync with your voice.',
  ]],
  'scaled-display': ['Recorded area matches the screen at your scaling', [
    'Record a take of the whole screen (Screen option).',
    'In the editor, compare the first frame with what was on screen: nothing cropped, shifted or stretched.',
    'PASS if: the recording shows the full screen at the right size.',
  ]],
  'cursor-click-sync': ['Cursor and clicks line up', [
    'Record about 20 s of normal mouse use: move around and click a few buttons or links, type a little.',
    'In the editor, step through a click: the click flash and cursor must be on the thing you clicked, at that moment (within about one frame).',
    'Check the Zoom panel: automatic zoom suggestions should appear around your clicks.',
    'PASS if: clicks land on the right spot and time, and suggestions come from your clicks.',
  ]],
  'region-and-second-monitor': ['Region and second monitor', [
    'Record a Region: drag a rectangle and use it. The recording must show exactly that rectangle.',
    'If you have a second monitor: record Screen on that monitor. It must show the right monitor.',
    'PASS if: both record the correct area. (No second monitor? Say so in the note and answer y only if the region part passed.)',
  ]],
  'editor-pass': ['Editing works on a Windows recording', [
    'Open a recording in the editor. Split and delete a part, add a zoom, change the camera layout, add a censor box.',
    'Optional: add a Claude graphic if you have the claude command installed.',
    'Play it back after the edits.',
    'PASS if: every edit does what it says and playback is smooth.',
  ]],
  'export-playable': ['Export through the real Save dialog', [
    'In the editor, open the Export panel and press Export. The Windows "Save as" dialog opens: press Save.',
    'When it finishes, open the MP4 in a normal player (Movies & TV, VLC).',
    'PASS if: the dialog works, and the video plays with picture and sound.',
  ]],
  'no-orphan-ffmpeg': ['Nothing left running', [
    'Open Task Manager (Ctrl+Shift+Esc), Details tab, sort by Name, find ffmpeg.exe (there should be none before you start).',
    'Start a recording, then Cancel it. Check: no ffmpeg.exe. Start another, Stop it. Check: none after it saves.',
    'Start a third and quit the app while it records. Check: no ffmpeg.exe or Rough Cut.exe remains.',
    'PASS if: no ffmpeg.exe is left after Cancel, Stop and quitting mid-recording.',
  ]],
  'crash-recovery': ['Recover a take after a crash', [
    'Start a recording and let it run about 15 s.',
    'In Task Manager, end "Rough Cut.exe" (End task) to simulate a crash.',
    'Start the app again. It should offer to recover the unfinished take (or show it in the recovery list).',
    'PASS if: the take can be recovered and plays.',
  ]],
  'installer-clean-machine': ['Installer on a PC with nothing installed', [
    `Copy ${installer} to a PC (or fresh Windows Sandbox / VM) with no Node, pnpm or ffmpeg.`,
    'Run it (SmartScreen: More info, Run anyway), start the app, and repeat a short recording with an export.',
    'PASS if: it installs, runs and records without installing anything else. (Windows Sandbox is fine: it is a clean machine.)',
  ]],
};

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Run this yourself in an interactive terminal; it records only what you type.');
  process.exit(2);
}

const recorded = existsSync(evidencePath) ? JSON.parse(readFileSync(evidencePath, 'utf8')) : {};
const only = process.argv[2];
const keys = Object.keys(CHECKS).filter((key) => (only ? key === only : recorded[key]?.status !== 'passed'));
if (only && !CHECKS[only]) {
  console.error(`Unknown key. Choose one of: ${Object.keys(CHECKS).join(', ')}`);
  process.exit(2);
}
if (keys.length === 0) {
  console.log('Every check is already recorded. Run: pnpm gate:windows');
  process.exit(0);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
console.log(`\n${keys.length} check(s) to go. Answer y (passed), n (failed) or s (skip for now) after each.\n`);
for (const key of keys) {
  const [title, steps] = CHECKS[key];
  console.log(`\n=== ${key}: ${title}`);
  steps.forEach((step, i) => console.log(`  ${i + 1}. ${step}`));
  const answer = (await rl.question('\nDid it pass? [y/n/s] ')).trim().toLowerCase();
  if (answer === 'y') {
    const note = (await rl.question('Note (what you checked, on which machine): ')).trim();
    const result = spawnSync(process.execPath, [verify, 'confirm', key, note], { stdio: 'inherit' });
    if (result.status !== 0) console.log('Not recorded (a note of at least 5 characters is required).');
  } else if (answer === 'n') {
    const what = (await rl.question('What went wrong? (paste this to Claude): ')).trim();
    console.log(`\nNot recorded. Tell Claude: "${key} failed: ${what}"`);
  } else {
    console.log('Skipped.');
  }
}
rl.close();
console.log('\nDone. Run: pnpm gate:windows');
