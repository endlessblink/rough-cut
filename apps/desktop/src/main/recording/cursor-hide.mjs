// @ts-check
import { execSync, spawn } from 'node:child_process';
import { writeFileSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Hide/show the system cursor on X11 Linux using XFixesHideCursor.
 *
 * XFixes cursor hide is per-display-connection: when the process that called
 * XFixesHideCursor exits (closing the display), the cursor reappears. So we
 * spawn a long-lived child process that hides the cursor and blocks on stdin.
 * When we want to show the cursor again, we close stdin — the child exits,
 * the display connection closes, and the cursor reappears automatically.
 */

const isX11 = process.env.XDG_SESSION_TYPE === 'x11' ||
              (process.env.DISPLAY !== undefined && process.env.DISPLAY !== '');
const isLinux = process.platform === 'linux';

let hidden = false;
/** @type {import('node:child_process').ChildProcess | null} */
let childProcess = null;

// The C helper hides the cursor then blocks reading stdin. When stdin closes
// (parent kills it or closes the pipe), it exits — which auto-restores the cursor.
const CURSOR_CTL_SRC = `
#include <X11/Xlib.h>
#include <X11/extensions/Xfixes.h>
#include <stdio.h>
int main(void) {
  Display *dpy = XOpenDisplay(NULL);
  if (!dpy) { fprintf(stderr, "Cannot open display\\n"); return 1; }
  XFixesHideCursor(dpy, DefaultRootWindow(dpy));
  XFlush(dpy);
  /* Block until stdin is closed (parent signals us to stop) */
  getchar();
  /* Cursor auto-restores when we close the display */
  XCloseDisplay(dpy);
  return 0;
}
`;

const BIN_PATH = join(tmpdir(), 'rc-cursor-ctl');
const SRC_PATH = join(tmpdir(), 'rc-cursor-ctl.c');

/**
 * Ensure the tiny C helper binary exists. Compiles on first call.
 * @returns {boolean}
 */
function ensureBinary() {
  if (existsSync(BIN_PATH)) return true;
  try {
    execSync('which gcc', { stdio: 'ignore' });
    writeFileSync(SRC_PATH, CURSOR_CTL_SRC);
    execSync(`gcc -o "${BIN_PATH}" "${SRC_PATH}" -lX11 -lXfixes`, {
      stdio: 'ignore',
      timeout: 10000,
    });
    chmodSync(BIN_PATH, 0o755);
    return true;
  } catch {
    return false;
  }
}

/**
 * Hide the system cursor from screen capture on X11.
 * Spawns a child process that holds the XFixes hide active.
 * @returns {boolean} Whether hiding was successful
 */
export function hideCursor() {
  if (!isLinux || !isX11) return false;
  if (hidden) return true;

  if (!ensureBinary()) {
    console.warn('cursor-hide: cannot compile XFixes helper (need gcc + libXfixes-dev)');
    return false;
  }

  try {
    childProcess = spawn(BIN_PATH, [], {
      stdio: ['pipe', 'ignore', 'pipe'],
    });

    childProcess.on('error', (err) => {
      console.warn('cursor-hide: child process error —', err.message);
      hidden = false;
      childProcess = null;
    });

    childProcess.on('exit', () => {
      hidden = false;
      childProcess = null;
    });

    // Check stderr for immediate failure
    let stderrData = '';
    childProcess.stderr?.on('data', (chunk) => { stderrData += chunk; });

    // Give the child a moment to fail or succeed
    // If it's still running after 100ms, we're good
    return new Promise((resolve) => {
      setTimeout(() => {
        if (childProcess && !childProcess.killed && childProcess.exitCode === null) {
          hidden = true;
          console.log('cursor-hide: cursor hidden via XFixes (pid ' + childProcess.pid + ')');
          resolve(true);
        } else {
          console.warn('cursor-hide: child exited immediately —', stderrData.trim());
          resolve(false);
        }
      }, 100);
    });
  } catch (err) {
    console.warn('cursor-hide: failed to spawn helper —', err.message);
    return false;
  }
}

/**
 * Show the system cursor again by killing the helper process.
 * The cursor auto-restores when the process exits and closes the display.
 * @returns {boolean}
 */
export function showCursor() {
  if (!hidden || !childProcess) {
    hidden = false;
    return false;
  }

  try {
    // Close stdin — child reads getchar(), gets EOF, exits cleanly
    childProcess.stdin?.end();
    // Also kill in case it doesn't respond to stdin close
    setTimeout(() => {
      if (childProcess && !childProcess.killed) {
        childProcess.kill('SIGTERM');
      }
    }, 200);
    hidden = false;
    childProcess = null;
    console.log('cursor-hide: cursor restored (helper process terminated)');
    return true;
  } catch (err) {
    console.warn('cursor-hide: failed to stop helper —', err.message);
    hidden = false;
    childProcess = null;
    return false;
  }
}

// Safety: always restore cursor on exit
if (isLinux && isX11) {
  const cleanup = () => { if (hidden) try { showCursor(); } catch { /* best effort */ } };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });
}
