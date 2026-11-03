import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createUpdateController, validateReleasePolicy } from './update-controller.mjs';
import { shell } from 'electron';
import { isMacReleaseBundle } from './mac-app-bundle.mjs';
import { createMacUpdateController } from './mac-update-controller.mjs';
import { createCrashReporting } from './crash-reporting.mjs';
const require = createRequire(import.meta.url);

// Native menus leave the Recording edit surface and existing renderer untouched.
export function installReleaseServices({ app, Menu, dialog, BrowserWindow, isBusy, ipcMain = null, channels = null, support = null }) {
  const window = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  let releasePolicy = { approved: false };
  try { releasePolicy = JSON.parse(readFileSync(join(app.getAppPath(), 'release-policy.json'), 'utf8')); } catch {}
  let backend;
  // No updater is instantiated, and no network work starts, without a release approval.
  let approvedPolicy = null;
  try { approvedPolicy = validateReleasePolicy(releasePolicy); } catch {}
  // Windows updates the installed (packaged) app through its NSIS installer; Linux updates the AppImage in place.
  const windows = process.platform === 'win32';
  const mac = process.platform === 'darwin';
  const macPackaged = mac && (app.isPackaged || isMacReleaseBundle({ appPath: app.getAppPath() }));
  let macVersion = app.getVersion();
  if (macPackaged) {
    try { macVersion = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')).version; } catch {}
  }
  if (!mac && approvedPolicy && (windows ? app.isPackaged : process.env.APPIMAGE)) {
    const { AppImageUpdater, NsisUpdater } = require('electron-updater');
    backend = windows ? new NsisUpdater() : new AppImageUpdater();
    backend.updateConfigPath = join(app.getAppPath(), 'app-update.yml');
  }
  // Every status change reaches the open windows, so the top bar can show "Update ready".
  const broadcast = (status) => {
    if (!channels) return;
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channels.UPDATE_STATUS, status);
    }
  };
  const updates = mac ? createMacUpdateController({ version: macVersion, packaged: macPackaged, approved: approvedPolicy?.provider === 'github', isBusy, showMessageBox: (options) => dialog.showMessageBox(window(), options), openExternal: (url) => shell.openExternal(url) }) : createUpdateController({ onStatus: broadcast, backend, releasePolicy, appImagePath: process.env.APPIMAGE, userDataDir: app.getPath('userData'), version: app.getVersion(), isBusy, platform: windows ? 'win32' : 'linux', packaged: app.isPackaged });
  const reports = createCrashReporting({ userDataDir: app.getPath('userData'), runtime: { appVersion: app.getVersion(), electronVersion: process.versions.electron, platform: process.platform, arch: process.arch }, dialogs: dialog });
  const guarded = (fn) => async () => {
    try { await fn(); }
    catch { await dialog.showMessageBox(window(), { type: 'error', message: 'The requested action could not be completed.', detail: 'Your project was not modified. Check that the destination is writable and try again.', buttons: ['OK'] }); }
  };
  const explain = (state) => mac && state.status === 'available' ? updates.prompt() : dialog.showMessageBox(window(), { type: state.status === 'error' ? 'error' : 'info', message: ({ downloaded: `Rough Cut ${state.version} is ready.`, current: 'You have the latest version.', busy: 'Finish recording or exporting first.', 'install-requested': 'Restarting to update.' })[state.status] ?? 'Updates are unavailable for this build.', detail: state.reason ?? (state.status === 'busy' ? 'Rough Cut updates once recording or export has stopped.' : 'Click Update at the top of the window to install it.'), buttons: ['OK'] });
  // Shared by the Help menu, the top bar's "Update" button and About: one click downloads, closes and reopens on the new
  // version. Projects save as you edit, so there is nothing to confirm; it never runs while recording or exporting.
  async function updateNow() {
    const result = await updates.updateNow();
    if (result.status === 'busy') await explain(result);
    return result;
  }
  if (ipcMain && channels) {
    ipcMain.handle(channels.UPDATE_STATUS, () => updates.status());
    ipcMain.handle(channels.UPDATE_CHECK, async () => { const state = await updates.check(); if (mac) await explain(state); return state; });
    ipcMain.handle(channels.UPDATE_INSTALL, async () => { try { await updateNow(); } catch {} return updates.status(); });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    // macOS puts the first menu under the app's name; give it the standard app menu (About, Hide, Quit).
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [{ role: 'close' }, { role: 'quit' }] },
    { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
    { role: 'help', submenu: [
      { label: 'About Rough Cut', click: () => { if (channels) window()?.webContents.send(channels.ABOUT_OPEN); } },
      { label: 'Check for updates…', click: guarded(async () => explain(await updates.check())) },
      ...(!mac ? [{ label: 'Update Rough Cut', click: guarded(async () => { const r = await updateNow(); if (!['busy', 'install-requested'].includes(r.status)) await explain(r); }) }] : []),
      // Windows keeps no previous-version copy (the installer replaces the app), so there is nothing to restore there.
      ...((windows || mac) ? [] : [{ label: 'Restore previous version…', click: guarded(async () => {
        if (isBusy()) return explain({ status: 'busy' });
        if (!updates.canRollback()) return explain({ reason: 'There is no previous-version backup for this installation.' });
        const answer = await dialog.showMessageBox(window(), { type: 'question', message: 'Save your work, then restore the previous AppImage?', detail: 'Only the application file is restored. Projects and settings are kept. Close and reopen Rough Cut after restoring.', buttons: ['Restore previous version', 'Cancel'], defaultId: 1, cancelId: 1, noLink: true });
        if (answer.response === 0) { updates.rollback(); app.quit(); }
      }) }]),
      { type: 'separator' },
      ...(support ? [
        { label: 'Mac self-check…', click: () => window()?.webContents.send(channels.SUPPORT_OPEN) },
        { label: 'Report a problem…', click: guarded(() => support.reportProblem()) },
      ] : []),
      { label: 'Crash reports…', click: guarded(() => reports.show(window())) },
    ] },
  ]));
  app.on('render-process-gone', (_event, _contents, details) => reports.capture({ processType: 'renderer', reason: details.reason, exitCode: details.exitCode }));
  app.on('child-process-gone', (_event, details) => reports.capture({ processType: details.type === 'GPU' ? 'gpu' : 'utility', reason: details.reason, exitCode: details.exitCode }));
  const captureException = (error) => reports.capture({ processType: 'browser', reason: 'exception', errorType: error?.name });
  process.on('uncaughtExceptionMonitor', captureException);
  let timer;
  if (backend || (mac && approvedPolicy && macPackaged)) {
    const checkWhenIdle = () => { if (!isBusy()) void updates.check(mac ? { notify: true } : undefined); };
    timer = setInterval(checkWhenIdle, 6 * 60 * 60 * 1000);
    timer.unref();
    checkWhenIdle();
  }
  app.once('will-quit', () => { clearInterval(timer); process.removeListener('uncaughtExceptionMonitor', captureException); });
  return { updates, reports };
}
