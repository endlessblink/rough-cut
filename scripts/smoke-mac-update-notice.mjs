// Linux-host visual proof of the real native notice, with mocked release responses.
// This is not evidence of a macOS runtime or an installed Mac package.
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.env.ROUGH_CUT_NOTICE_PROOF_DIR || '/tmp/rough-cut-mac-update-notice');
if (!process.versions.electron) {
  const requireDesktop = createRequire(join(root, 'apps/desktop/package.json'));
  const electron = requireDesktop('electron');
  const result = spawnSync('xvfb-run', ['-a', '-s', '-screen 0 1000x700x24', electron, '--no-sandbox', '--disable-gpu', fileURLToPath(import.meta.url)], { cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '' }, stdio: 'inherit' });
  process.exit(result.status ?? 1);
} else {
  const { app, BrowserWindow, dialog } = await import('electron');
  const { createMacUpdateController } = await import('../apps/desktop/src/main/mac-update-controller.mjs');
  mkdirSync(output, { recursive: true });
  app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 880, height: 540, center: true, title: 'Mac update notice — Linux-host test', autoHideMenuBar: true, webPreferences: { sandbox: true } });
  await window.loadURL('data:text/html,' + encodeURIComponent('<html style="background:#151719;color:#eceef0;font-family:Arial;padding:32px"><h2>Rough Cut · Mac update notice</h2><p>Linux-host native dialog test with mocked releases.</p><p>No network, installation or browser launch.</p></html>'));
  const version = '0.1.0-beta.12.mac.10';
  const releaseTag = 'v0.1.0-beta.12';
  const name = `Rough-Cut-${version}-mac-arm64.dmg`;
  const base = `https://github.com/endlessblink/rough-cut/releases/download/${releaseTag}/`;
  const release = { tag_name: releaseTag, assets: ['mac-latest.json', name].map(name => ({ name, browser_download_url: base + name })) };
  const manifest = { version, releaseTag, files: { arm64: { dmg: name } } };
  let options;
  let opened = false;
  let calls = 0;
  const controller = createMacUpdateController({ version: '0.1.0-beta.12.mac.9', arch: 'arm64', approved: true, packaged: true,
    fetchJSON: async url => { calls++; return url.includes('api.github.com') ? [release] : manifest; },
    openExternal: async () => { opened = true; },
    showMessageBox: async config => {
      options = config;
      const pending = dialog.showMessageBox(window, config);
      setTimeout(() => {
        try {
          const screenshot = join(output, 'mac-update-notice.png');
          execFileSync('import', ['-window', 'root', screenshot], { timeout: 10000 });
          execFileSync('identify', [screenshot], { timeout: 10000 });
          writeFileSync(join(output, 'report.json'), JSON.stringify({ status: 'captured', hostPlatform: process.platform, simulatedTargetPlatform: 'darwin', screenshot, sha256: createHash('sha256').update(readFileSync(screenshot)).digest('hex'), options, mockedRequests: calls, browserOpened: opened }, null, 2) + '\n');
          console.log(`NOTICE_PROOF=${screenshot}`);
          app.exit(0);
        } catch (error) { console.error(error); app.exit(1); }
      }, 1000);
      return pending;
    }
  });
  await controller.check({ notify: true });
  setTimeout(() => app.exit(1), 15000).unref();
  }).catch(error => { console.error(error); app.exit(1); });
}
