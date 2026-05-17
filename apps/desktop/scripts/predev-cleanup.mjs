// Best-effort cleanup of stale dev processes from a previous `pnpm dev` run
// that didn't shut down cleanly (e.g. terminal closed with Ctrl+Z, or
// concurrently failed to propagate SIGTERM to its children).
//
// Targets:
//   - whatever is listening on the Vite port 7545
//   - any electron instance that's running this project's main entry
//
// Failures are non-fatal — if there's nothing to clean up, we just continue.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const VITE_PORT = 7545;
const PROJECT_TAG = 'rough-cut-mvp/apps/desktop';

async function killByPort(port) {
  try {
    const { stdout } = await exec('lsof', ['-ti', `:${port}`]);
    const pids = stdout.split('\n').map((s) => s.trim()).filter(Boolean);
    if (pids.length === 0) return;
    for (const pid of pids) {
      try {
        process.kill(Number(pid), 'SIGTERM');
        log(`killed pid ${pid} on port ${port}`);
      } catch (err) {
        if (err.code !== 'ESRCH') log(`could not kill pid ${pid}: ${err.message}`);
      }
    }
  } catch {
    // lsof returns non-zero when nothing matches — that's the happy path.
  }
}

async function killByCommandTag(tag) {
  try {
    const { stdout } = await exec('pgrep', ['-f', tag]);
    const myPid = String(process.pid);
    const parents = new Set([myPid, String(process.ppid)]);
    const pids = stdout.split('\n').map((s) => s.trim()).filter((pid) => pid && !parents.has(pid));
    if (pids.length === 0) return;
    for (const pid of pids) {
      try {
        process.kill(Number(pid), 'SIGTERM');
        log(`killed stale electron pid ${pid}`);
      } catch (err) {
        if (err.code !== 'ESRCH') log(`could not kill pid ${pid}: ${err.message}`);
      }
    }
  } catch {
    // pgrep returns 1 when no match — fine.
  }
}

function log(message) {
  process.stdout.write(`[predev] ${message}\n`);
}

await killByPort(VITE_PORT);
await killByCommandTag(PROJECT_TAG);

// Tiny grace period so the OS releases the port before vite tries to bind.
await new Promise((r) => setTimeout(r, 150));
