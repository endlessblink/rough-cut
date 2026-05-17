// Tiny dev orchestrator for the Electron main + preload + shared sources.
//
// Spawns Electron once, then watches src/main/, src/preload/, and src/shared/
// for changes. On any change, kills the running Electron and respawns it
// (debounced 200ms to coalesce burst edits).
//
// Renderer changes are NOT watched here — Vite HMR handles them.
//
// Why this exists: Vite's HMR can't reload preload scripts or main-process
// code (it doesn't see them), so `pnpm dev` alone used to leave stale
// preload/main running across iterations. Forcing the developer to remember
// `pkill electron` is hostile. This script makes `pnpm dev` self-healing.

import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, '..');

const ELECTRON_BIN = 'electron';
const ELECTRON_ARGS = ['--no-sandbox', '--force-color-profile=srgb', '.'];

const WATCH_DIRS = ['src/main', 'src/preload', 'src/shared'].map((rel) => join(desktopRoot, rel));

let electronProc = null;
let restartTimer = null;
let restarting = false;
let shuttingDown = false;

function spawnElectron() {
  log(`spawning ${ELECTRON_BIN} ${ELECTRON_ARGS.join(' ')}`);
  const proc = spawn(ELECTRON_BIN, ELECTRON_ARGS, {
    cwd: desktopRoot,
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: 'http://127.0.0.1:7545' },
  });
  electronProc = proc;
  proc.on('exit', (code, signal) => {
    if (proc !== electronProc) return; // a restart already replaced it
    electronProc = null;
    if (shuttingDown) return;
    if (restarting) return; // expected exit between restarts
    log(`electron exited (code=${code} signal=${signal ?? 'none'})`);
    process.exit(code ?? 0);
  });
}

function killElectron() {
  return new Promise((resolveExit) => {
    if (!electronProc) return resolveExit();
    const proc = electronProc;
    electronProc = null;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolveExit();
    };
    proc.once('exit', finish);
    try {
      proc.kill('SIGTERM');
    } catch {
      finish();
      return;
    }
    // Hard-kill if SIGTERM isn't honored within 2s.
    setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* already dead */ }
      finish();
    }, 2000);
  });
}

async function restart(reason) {
  if (restarting || shuttingDown) return;
  restarting = true;
  log(`restart triggered by ${reason}`);
  await killElectron();
  if (shuttingDown) return;
  spawnElectron();
  restarting = false;
}

function scheduleRestart(reason) {
  if (restartTimer) clearTimeout(restartTimer);
  // Debounce burst saves (e.g. format-on-save touching multiple files).
  restartTimer = setTimeout(() => {
    restartTimer = null;
    restart(reason).catch((err) => log(`restart failed: ${err.message}`));
  }, 200);
}

function watchTree(dir) {
  try {
    const watcher = watch(dir, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;
      // Ignore editor swap/lock files.
      if (/\.(swp|tmp)$/.test(filename)) return;
      if (filename.startsWith('.')) return;
      scheduleRestart(`${dir.replace(`${desktopRoot}/`, '')}/${filename}`);
    });
    watcher.on('error', (err) => log(`watch ${dir} error: ${err.message}`));
  } catch (err) {
    log(`could not watch ${dir}: ${err.message}`);
  }
}

function log(message) {
  process.stdout.write(`[electron-dev] ${message}\n`);
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`received ${signal}, shutting down`);
  killElectron().then(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

for (const dir of WATCH_DIRS) watchTree(dir);
spawnElectron();
