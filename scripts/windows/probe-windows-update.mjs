// Real-library probe of the Windows updater. It runs electron-updater's NsisUpdater inside Electron against a local
// loopback feed and checks the parts that can be checked without installing anything: the update is found, the whole
// installer is downloaded and verified against its SHA512, a tampered or truncated file is refused, an outage is
// reported, and nothing is ever installed (quitAndInstall is not called).
//
//   apps\desktop\node_modules\.bin\electron.cmd scripts\windows\probe-windows-update.mjs
//
// It uses a throwaway cache folder and a fake "installer" file (random bytes). Exits 0 only if every case holds.

import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..', '..');
const require = createRequire(join(root, 'apps/desktop/package.json'));
const { app } = require('electron');
const { NsisUpdater } = require('electron-updater');
const semver = createRequire(require.resolve('electron-updater'))('semver');
const { createUpdateController } = await import(pathToFileURL(join(root, 'apps/desktop/src/main/update-controller.mjs')).href);

const INSTALLER = 'Rough-Cut-0.1.0-beta.99-Setup.exe';
const payload = randomBytes(300_000);
const sha512 = createHash('sha512').update(payload).digest('base64');
const wrongSha = Buffer.alloc(64, 7).toString('base64');

let mode = 'valid';
const requests = [];
const server = createServer((request, response) => {
  requests.push({ mode, path: request.url, headers: request.headers });
  if (request.url.startsWith('/beta.yml')) {
    if (mode === 'offline') { response.writeHead(503); return response.end('Synthetic outage'); }
    if (mode === 'current') {
      response.setHeader('Content-Type', 'text/yaml');
      return response.end(`version: 0.1.0-beta.10\nfiles:\n  - url: ${INSTALLER}\n    sha512: ${sha512}\n    size: ${payload.length}\npath: ${INSTALLER}\nsha512: ${sha512}\nreleaseDate: '2026-10-19T00:00:00.000Z'\n`);
    }
    const checksum = mode === 'bad-sha' ? wrongSha : sha512;
    response.setHeader('Content-Type', 'text/yaml');
    return response.end(`version: 0.1.0-beta.99\nfiles:\n  - url: ${INSTALLER}\n    sha512: ${checksum}\n    size: ${payload.length}\npath: ${INSTALLER}\nsha512: ${checksum}\nreleaseDate: '2026-10-19T00:00:00.000Z'\n`);
  }
  if (request.url.startsWith(`/${INSTALLER}`)) {
    if (mode === 'truncated') { response.setHeader('Content-Length', payload.length); response.write(payload.subarray(0, 50_000)); setTimeout(() => response.destroy(), 20); return; }
    response.setHeader('Content-Length', payload.length);
    return response.end(payload);
  }
  response.writeHead(404); response.end();
});

function newController(cacheDir) {
  const configPath = join(cacheDir, 'app-update.yml');
  writeFileSync(configPath, `updaterCacheDirName: ${cacheDir.split(/[\\/]/).pop()}\n`);
  const backend = new NsisUpdater();
  backend.updateConfigPath = configPath;
  backend.forceDevUpdateConfig = true; // this probe runs from source, not from the installed app
  // Running bare Electron, the updater would read Electron's own version (43.x) as the app's; say what the app is.
  backend.currentVersion = new semver.SemVer('0.1.0-beta.10');
  let installCalls = 0;
  const realQuit = backend.quitAndInstall.bind(backend);
  backend.quitAndInstall = (...args) => { installCalls += 1; return realQuit(...args); };
  const { port } = server.address();
  const policy = { approved: true, provider: 'generic', url: `http://127.0.0.1:${port}/`, channel: 'beta' };
  const controller = createUpdateController({ backend, releasePolicy: policy, platform: 'win32', packaged: true, version: '0.1.0-beta.10', userDataDir: cacheDir, allowLoopbackForTests: true });
  return { controller, backend, installCalls: () => installCalls };
}

const cleanup = [];
async function run() {
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const cacheRoot = mkdtempSync(join(tmpdir(), 'rough-cut-updater-probe-'));
  cleanup.push(() => rmSync(cacheRoot, { recursive: true, force: true }));
  const results = [];
  const ok = (name, detail = '') => { results.push(name); console.info(`PASS  ${name}${detail ? `  (${detail})` : ''}`); };
  // electron-updater keeps its cache under %LOCALAPPDATA%\<updaterCacheDirName>; each case gets its own folder name.
  const localAppData = process.env.LOCALAPPDATA;
  const caseDir = (name) => { const dir = join(cacheRoot, `rough-cut-updater-probe-${name}-${process.pid}`); require('node:fs').mkdirSync(dir, { recursive: true }); cleanup.push(() => rmSync(join(localAppData, dir.split(/[\\/]/).pop()), { recursive: true, force: true })); return dir; };
  const pendingFile = (dir) => { const cache = join(localAppData, dir.split(/[\\/]/).pop(), 'pending', INSTALLER); return existsSync(cache) ? cache : null; };

  // 1. A newer, correctly checksummed installer is found, downloaded whole, and verified byte for byte.
  mode = 'valid';
  let dir = caseDir('valid');
  let { controller, installCalls } = newController(dir);
  assert.equal(controller.status().status, 'idle');
  let state = await controller.check();
  assert.equal(state.status, 'downloaded', JSON.stringify(state));
  assert.equal(state.version, '0.1.0-beta.99');
  const downloaded = pendingFile(dir);
  assert.ok(downloaded, 'the installer is in the updater cache');
  assert.equal(statSync(downloaded).size, payload.length);
  assert.equal(createHash('sha512').update(readFileSync(downloaded)).digest('base64'), sha512);
  assert.ok(requests.some((r) => r.path.startsWith(`/${INSTALLER}`) && !('range' in r.headers)), 'the whole file was requested (no differential download)');
  assert.ok(!requests.some((r) => 'x-user-staging-id' in r.headers), 'no user identifier is sent');
  assert.equal(installCalls(), 0, 'checking and downloading never installs');
  ok('newer installer is found, downloaded whole and matches its SHA512');

  // 2. The same version as installed is not an update, and nothing is downloaded.
  mode = 'current';
  requests.length = 0;
  dir = caseDir('current');
  ({ controller } = newController(dir));
  state = await controller.check();
  assert.equal(state.status, 'current');
  assert.ok(!requests.some((r) => r.path.startsWith(`/${INSTALLER}`)), 'nothing is downloaded');
  ok('same version is reported as current and downloads nothing');

  // 3. A checksum that does not match the file is refused, and the controller will not install it.
  mode = 'bad-sha';
  dir = caseDir('badsha');
  ({ controller, installCalls } = newController(dir));
  state = await controller.check();
  assert.equal(state.status, 'error', JSON.stringify(state));
  assert.equal(controller.install().status, 'not-ready');
  assert.equal(installCalls(), 0);
  ok('a file that does not match its SHA512 is refused and cannot be installed');

  // 4. A truncated download is refused.
  mode = 'truncated';
  dir = caseDir('truncated');
  ({ controller, installCalls } = newController(dir));
  state = await controller.check();
  assert.equal(state.status, 'error', JSON.stringify(state));
  assert.equal(controller.install().status, 'not-ready');
  assert.equal(installCalls(), 0);
  ok('a truncated download is refused');

  // 5. A feed outage is reported, and the current version is left alone.
  mode = 'offline';
  dir = caseDir('offline');
  ({ controller, installCalls } = newController(dir));
  state = await controller.check();
  assert.equal(state.status, 'error');
  assert.match(state.reason, /current version was not replaced/i);
  assert.equal(installCalls(), 0);
  ok('a feed outage is reported and nothing changes');
  return results;
}

app.whenReady().then(async () => {
  let code = 0;
  try {
    const results = await run();
    console.info(`\nWINDOWS UPDATE PROBE PASSED (${results.length} cases; no installer was run)`);
  } catch (error) {
    code = 1;
    console.error(`\nWINDOWS UPDATE PROBE FAILED: ${error?.stack ?? error}`);
  } finally {
    server.close();
    for (const fn of cleanup) { try { fn(); } catch { /* temp files only */ } }
    app.exit(code);
  }
});
