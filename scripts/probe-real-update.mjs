import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createUpdateController } from '../apps/desktop/src/main/update-controller.mjs';
const require = createRequire(resolve('apps/desktop/package.json'));
const { AppImageUpdater } = require('electron-updater');
const { ElectronHttpExecutor } = require('electron-updater/out/electronHttpExecutor');
const { app } = require('electron'); app.enableSandbox();
async function runProbe() {
const root = resolve('../update-probe'); await mkdir(root, { recursive: true });
const sourceImage = resolve('release/Rough-Cut-0.1.0-beta.3-x86_64.AppImage');
const nextImage = resolve('../update-fixture/release/Update-fixture-0.1.0-beta.4.AppImage');
const payload = await readFile(nextImage); const sha512 = createHash('sha512').update(payload).digest('base64');
let mode = 'valid'; const requests = [];
const server = createServer((request, response) => {
  requests.push({ mode, path: request.url, headers: request.headers });
  if (request.url.startsWith('/beta-linux.yml')) {
    if (mode === 'offline') { response.writeHead(503); return response.end('Synthetic outage'); }
    const checksum = mode === 'bad-sha' ? Buffer.alloc(64, 7).toString('base64') : sha512;
    const metadata = `version: 0.1.0-beta.4\nfiles:\n  - url: update.AppImage\n    sha512: ${checksum}\n    size: ${payload.length}\npath: update.AppImage\nsha512: ${checksum}\nreleaseDate: '2026-10-04T00:00:00Z'\n`;
    response.setHeader('Content-Type', 'text/yaml'); return response.end(metadata);
  }
  if (request.url.startsWith('/update.AppImage')) {
    if (mode === 'truncated') { response.setHeader('Content-Length', payload.length); response.write(payload.subarray(0, 100000)); setTimeout(() => response.destroy(), 20); return; }
    response.setHeader('Content-Length', payload.length); return createReadStream(nextImage).pipe(response);
  }
  response.writeHead(404); response.end();
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const oldSha = createHash('sha256').update(await readFile(sourceImage)).digest('hex');
const hash = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');
const results = [];
try {
  for (const scenario of ['offline', 'bad-sha', 'truncated', 'valid']) {
    mode = scenario; const directory = join(root, scenario); await rm(directory, { recursive: true, force: true }); await mkdir(directory, { recursive: true });
    const image = join(directory, 'Rough-Cut.AppImage'); await copyFile(sourceImage, image);
    process.env.APPIMAGE = image; process.env.APPIMAGE_EXTRACT_AND_RUN = '1';
    const cfg = join(directory, 'app-update.yml'); await writeFile(cfg, 'updaterCacheDirName: fixture-updates\n');
    const adapter = { version: '0.1.0-beta.3', name: 'rough-cut-fixture', isPackaged: true, appUpdateConfigPath: cfg, userDataPath: directory, baseCachePath: directory, whenReady: async () => {}, quit() {}, onQuit() {} };
    const backend = new AppImageUpdater(undefined, adapter); backend.logger = console; backend.httpExecutor = new ElectronHttpExecutor(); backend.disableDifferentialDownload = true;
    // Exercise the official synchronous AppImage installer under Node; Electron quit/relaunch is separately probed in the packaged app.
    backend.quitAndInstall = () => { if (!backend.install(true, false)) throw new Error('Official AppImage installer failed'); };
    const manager = createUpdateController({ backend, releasePolicy: { approved: true, url, channel: 'beta' }, appImagePath: image, userDataDir: directory, version: adapter.version, allowLoopbackForTests: true });
    const result = await manager.check();
    if (scenario !== 'valid') { assert.equal(result.status, 'error', scenario); assert.equal(manager.install().status, 'not-ready'); assert.equal(await hash(image), oldSha); results.push({ scenario, preservedPrevious: true, status: result.status }); continue; }
    assert.equal(result.status, 'downloaded'); await writeFile(join(directory, 'project.roughcut'), 'UNCHANGED_SYNTHETIC_PROJECT');
    assert.equal(manager.install().status, 'install-requested'); assert.equal(await hash(image), await hash(nextImage));
    const runtimeReport = join(directory, 'new-runtime.json');
    const launch = spawnSync(image, ['--enable-sandbox', `--user-data-dir=${join(directory, 'new-profile')}`], { env: { ...process.env, ROUGH_CUT_UPDATE_FIXTURE_RESULT: runtimeReport, APPIMAGE_EXIT_AFTER_INSTALL: '' }, encoding: 'utf8', timeout: 30000 });
    assert.equal(launch.status, 0, launch.stderr); const runtime = JSON.parse(await readFile(runtimeReport, 'utf8'));
    assert.equal(runtime.version, '0.1.0-beta.4'); assert.equal(runtime.packaged, true); assert.equal(runtime.sandbox, true); assert.equal(runtime.rendererNoNode, true);
    const restored = manager.rollback(); assert.equal(restored.version, adapter.version); assert.equal(await hash(image), oldSha); assert.equal(await readFile(join(directory, 'project.roughcut'), 'utf8'), 'UNCHANGED_SYNTHETIC_PROJECT');
    results.push({ scenario, installedRealImage: true, newRuntime: runtime, rolledBackSha256: await hash(image), projectUnchanged: true });
  }
  assert.equal(requests.some((request) => 'x-user-staging-id' in request.headers), false);
  for (const scenario of ['offline', 'bad-sha', 'truncated', 'valid']) assert.equal(await stat(join(root, scenario, '.updaterId')).then(() => true, () => false), false);
  await writeFile(resolve('../evidence/real-update-result.json'), JSON.stringify({ results, requests, noStagingIdentifier: true, testTransport: 'official AppImageUpdater + ElectronHttpExecutor, loopback only' }, null, 2));
  console.info(JSON.stringify({ ok: true, results, noStagingIdentifier: true }, null, 2));
} catch (error) { console.error(error); app.exit(1); } finally { await new Promise((resolve) => server.close(resolve)); app.quit(); }

}
app.whenReady().then(runProbe).catch((error) => { console.error(error); app.exit(1); });
