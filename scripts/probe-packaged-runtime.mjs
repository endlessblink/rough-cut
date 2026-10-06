import { loadPlaywright } from './lib/load-playwright.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const { _electron } = loadPlaywright();
const evidence = resolve(process.env.ROUGH_CUT_PROBE_EVIDENCE_DIR ?? '../evidence/runtime-probe'); await mkdir(evidence, { recursive: true });
const executablePath = process.env.ROUGH_CUT_PROBE_EXECUTABLE ?? resolve('release/Rough-Cut-0.1.0-beta.3-x86_64.AppImage');
const electron = await _electron.launch({ executablePath, args: ['--enable-sandbox', `--user-data-dir=${join(evidence, 'profile')}`], chromiumSandbox: true, timeout: 60000, env: { ...process.env, APPIMAGE_EXTRACT_AND_RUN: '1', HOME: resolve('../runtime-home'), XDG_CONFIG_HOME: resolve('../runtime-home/.config'), XDG_CACHE_HOME: resolve('../runtime-home/.cache'), ROUGH_CUT_STARTUP_MODE: 'editor' } });
electron.process().stdout?.on('data', (data) => process.stdout.write(data));
electron.process().stderr?.on('data', (data) => process.stderr.write(data));
try {
  const page = await electron.firstWindow(); await page.waitForLoadState('domcontentloaded');
  await page.locator('body').waitFor();
  const runtime = await electron.evaluate(({ app, BrowserWindow, Menu }) => {
    const fs = process.getBuiltinModule('node:fs'); const path = process.getBuiltinModule('node:path'); const child = process.getBuiltinModule('node:child_process');
    const preference = path.join(app.getPath('userData'), 'crash-reporting-preference.json');
    const windows = BrowserWindow.getAllWindows().map((win) => ({ sandbox: win.webContents.getLastWebPreferences().sandbox, contextIsolation: win.webContents.getLastWebPreferences().contextIsolation, nodeIntegration: win.webContents.getLastWebPreferences().nodeIntegration }));
    const tools = Object.fromEntries(['ffmpeg', 'ffprobe', 'xdotool', 'xinput', 'pactl'].map((tool) => [tool, child.execFileSync('/usr/bin/which', [tool], { encoding: 'utf8' }).trim()]));
    const identity = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package-identity.json')));
    const policy = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'release-policy.json')));
    const help = Menu.getApplicationMenu().items.find((item) => item.role === 'help' || item.label === 'Help');
    return { version: app.getVersion(), electron: process.versions.electron, packaged: app.isPackaged, appPath: app.getAppPath(), resourcesPath: process.resourcesPath, windows, tools, identity, policy, electronLibraryPath: process.env.LD_LIBRARY_PATH ?? null, reportsPreferenceCreated: fs.existsSync(preference), helpItems: help.submenu.items.map((item) => item.label) };
  });
  assert.equal(runtime.version, '0.1.0-beta.3'); assert.equal(runtime.electron, '43.7.7'); assert.equal(runtime.packaged, true);
  assert.ok(runtime.windows.every((win) => win.sandbox === true && win.contextIsolation === true && win.nodeIntegration === false));
  assert.ok(!(runtime.electronLibraryPath ?? '').includes('/resources/media-tools/lib')); assert.ok(!(runtime.electronLibraryPath ?? '').includes('/resources/lib')); assert.equal(runtime.policy.approved, false); assert.equal(runtime.reportsPreferenceCreated, false);
  for (const tool of Object.values(runtime.tools)) assert.ok(tool.startsWith(runtime.resourcesPath + '/bin/'));
  assert.ok(runtime.helpItems.includes('Crash reports…'));
  const screenshot = join(evidence, 'packaged-gallery.png'); await page.screenshot({ path: screenshot });
  // Inspect the real native dialog preview without writing any report. Cancel stays the default.
  const dialogs = await electron.evaluate(async ({ app, dialog, BrowserWindow, Menu }) => {
    const previews = [];
    const showMessageBox = dialog.showMessageBox; const showSaveDialog = dialog.showSaveDialog;
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: '/tmp/synthetic-crash-report-preview.json' });
    let complete; const completed = new Promise((resolve) => { complete = resolve; });
    let call = 0; dialog.showMessageBox = async (_window, options) => { previews.push(options); const response = call++ === 0 ? 0 : 1; if (call === 2) complete(); return { response }; };
    try {
      const help = Menu.getApplicationMenu().items.find((item) => item.role === 'help' || item.label === 'Help');
      help.submenu.items.find((item) => item.label === 'Crash reports…').click();
      await completed;
      return { previews, saved: process.getBuiltinModule('node:fs').existsSync('/tmp/synthetic-crash-report-preview.json') };
    } finally { dialog.showMessageBox = showMessageBox; dialog.showSaveDialog = showSaveDialog; }
  });
  assert.equal(dialogs.saved, false); assert.equal(dialogs.previews.length, 2); assert.equal(dialogs.previews[1].defaultId, 1); assert.ok(dialogs.previews[1].detail.includes('Exact payload:'));
  await electron.evaluate(({ dialog, BrowserWindow }, options) => { globalThis.roughCutNativePreview = dialog.showMessageBox(BrowserWindow.getAllWindows()[0], options); }, dialogs.previews[1]);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const nativeScreenshot = join(evidence, 'native-report-preview.png');
  execFileSync('import', ['-window', 'root', nativeScreenshot]);
  execFileSync('xdotool', ['key', 'Escape']);
  const nativeCancel = await electron.evaluate(async () => (await globalThis.roughCutNativePreview).response);
  assert.equal(nativeCancel, 1);
  await writeFile(join(evidence, 'runtime.json'), JSON.stringify({ runtime, dialogs, screenshot, nativeScreenshot, nativeCancel }, null, 2));
  console.info(JSON.stringify({ ok: true, runtime, dialogCancelVerified: true, screenshot }, null, 2));
} finally { await electron.close(); }
