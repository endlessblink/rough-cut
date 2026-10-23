// Opens the packaged Mac app the way a person does (Finder / `open`, no ROUGH_CUT_* settings at all) and fails if its
// window tries to load the dev server (127.0.0.1:7545) or stays blank. The other UI check sets test settings that
// happen to pick the built renderer, so it passed while a double-clicked app showed a black window (2026-10-23).
//
//   node scripts/mac/user-launch-check.mjs [--app <Rough Cut.app>] [--exe <executable, spawned directly>] [--out <dir>]
//
// The window is read through Chromium's debugging port (a launch argument, not a setting the app reacts to).
// Exits 0 and prints "USER LAUNCH CHECK PASSED" only when the editor window shows the built app with real content.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const args = process.argv.slice(2);
const argValue = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const appBundle = argValue('--app') ?? join(root, 'dist', `rough-cut-mvp-darwin-${arch}`, 'Rough Cut.app');
const exe = argValue('--exe');
const outDir = argValue('--out');
const port = 9339;
const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));
const fail = (message) => { throw new Error(message); };
const t0 = Date.now();
const log = (message) => console.info(`[user-launch ${((Date.now() - t0) / 1000).toFixed(1)}s] ${message}`);

const leaked = Object.keys(process.env).filter((key) => key.startsWith('ROUGH_CUT_'));
if (leaked.length) fail(`This check must run with no ROUGH_CUT_* settings, found: ${leaked.join(', ')}`);

let child = null;
try {
  if (exe) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('ROUGH_CUT_') && key !== 'VITE_DEV_SERVER_URL'));
    child = spawn(exe, [`--remote-debugging-port=${port}`, ...args.slice(args.indexOf('--') + 1 || args.length)], { env, stdio: 'ignore' });
    log(`spawned ${exe}`);
  } else {
    // `open` starts the app through Launch Services, so it gets a person's environment, not this shell's.
    const opened = spawnSync('open', ['-n', appBundle, '--args', `--remote-debugging-port=${port}`], { encoding: 'utf8' });
    if (opened.status !== 0) fail(`open failed: ${opened.stderr}`);
    log(`opened ${appBundle}`);
  }

  let page = null;
  let content = null;
  let lastSeen = '';
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await wait(1000);
    let targets;
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { continue; }
    const pages = targets.filter((target) => target.type === 'page');
    const seen = JSON.stringify(targets.map((target) => [target.type, target.url.split('?')[0]]));
    if (seen !== lastSeen) log(`windows: ${(lastSeen = seen)}`);
    const devLoad = pages.find((target) => /^https?:\/\/(127\.0\.0\.1|localhost):7545/.test(target.url) || target.url.startsWith('chrome-error:'));
    if (devLoad) fail(`The window loaded ${devLoad.url} instead of the built app (that is the black screen).`);
    page = pages.find((target) => target.url.startsWith('file:') && target.url.includes('/dist/renderer/index.html')) ?? null;
    if (!page) continue;
    content = await evaluate(page.webSocketDebuggerUrl, `(() => ({
      title: document.title,
      nodes: document.querySelectorAll('#root *').length,
      text: (document.body?.innerText ?? '').trim().length,
    }))()`);
    if (content.nodes >= 20 && content.text >= 20) break;
  }
  if (!page) fail('No window with the built app appeared within 2 minutes.');
  log(`window ${page.url.split('?')[0].slice(-60)}: ${JSON.stringify(content)}`);
  if (!(content.nodes >= 20 && content.text >= 20)) fail(`The window stayed blank: ${JSON.stringify(content)}`);

  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    const shot = await cdp(page.webSocketDebuggerUrl, 'Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(outDir, 'user-launch.png'), Buffer.from(shot.data, 'base64'));
    writeFileSync(join(outDir, 'user-launch.json'), `${JSON.stringify({ url: page.url, ...content }, null, 2)}\n`);
  }
  console.info('USER LAUNCH CHECK PASSED');
} finally {
  if (child) child.kill();
  else {
    spawnSync('osascript', ['-e', 'quit app "Rough Cut"']);
    await wait(2000);
    spawnSync('pkill', ['-f', 'Rough Cut.app/Contents/MacOS/Electron']);
  }
}

async function evaluate(wsUrl, expression) {
  const result = await cdp(wsUrl, 'Runtime.evaluate', { expression, returnByValue: true });
  return result.result?.value ?? {};
}

function cdp(wsUrl, method, params) {
  return new Promise((resolveCall, rejectCall) => {
    const socket = new WebSocket(wsUrl);
    const timer = setTimeout(() => { socket.close(); rejectCall(new Error(`${method} timed out`)); }, 20_000);
    socket.onopen = () => socket.send(JSON.stringify({ id: 1, method, params }));
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== 1) return;
      clearTimeout(timer);
      socket.close();
      if (message.error) rejectCall(new Error(`${method}: ${message.error.message}`));
      else resolveCall(message.result);
    };
    socket.onerror = () => { clearTimeout(timer); rejectCall(new Error(`${method}: debugging connection failed`)); };
  });
}
