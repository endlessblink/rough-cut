import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createUpdateController, validateReleasePolicy } from './update-controller.mjs';
import { createCrashReporting } from './crash-reporting.mjs';
const require = createRequire(import.meta.url);

// Native menus leave the Recording edit surface and existing renderer untouched.
export function installReleaseServices({ app, Menu, dialog, BrowserWindow, isBusy }) {
  const window = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  let releasePolicy = { approved: false };
  try { releasePolicy = JSON.parse(readFileSync(join(app.getAppPath(), 'release-policy.json'), 'utf8')); } catch {}
  let backend;
  // No updater is instantiated, and no network work starts, without a release approval.
  let approvedPolicy = null;
  try { approvedPolicy = validateReleasePolicy(releasePolicy); } catch {}
  if (process.env.APPIMAGE && approvedPolicy) {
    const { AppImageUpdater } = require('electron-updater');
    backend = new AppImageUpdater();
    backend.updateConfigPath = join(app.getAppPath(), 'app-update.yml');
  }
  const updates = createUpdateController({ backend, releasePolicy, appImagePath: process.env.APPIMAGE, userDataDir: app.getPath('userData'), version: app.getVersion(), isBusy });
  const reports = createCrashReporting({ userDataDir: app.getPath('userData'), runtime: { appVersion: app.getVersion(), electronVersion: process.versions.electron, platform: process.platform, arch: process.arch }, dialogs: dialog });
  const guarded = (fn) => async () => {
    try { await fn(); }
    catch { await dialog.showMessageBox(window(), { type: 'error', message: 'The requested action could not be completed.', detail: 'Your project was not modified. Check that the destination is writable and try again.', buttons: ['OK'] }); }
  };
  const explain = (state) => dialog.showMessageBox(window(), { type: state.status === 'error' ? 'error' : 'info', message: ({ downloaded: `Rough Cut ${state.version} is ready.`, current: 'You have the latest version.', busy: 'Finish recording or exporting first.', 'install-requested': 'Restart requested.' })[state.status] ?? 'Updates are unavailable for this build.', detail: state.reason ?? 'Use Help → Restart to install update when your work is saved.', buttons: ['OK'] });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'close' }, { role: 'quit' }] },
    { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
    { role: 'help', submenu: [
      { label: 'Check for updates…', click: guarded(async () => explain(await updates.check())) },
      { label: 'Restart to install update…', click: guarded(async () => {
        if (isBusy()) return explain({ status: 'busy' });
        if (updates.status().status !== 'downloaded') return explain(updates.status());
        const answer = await dialog.showMessageBox(window(), { type: 'question', message: 'Save your work, then restart to install the update?', detail: 'The previous AppImage is kept beside this version for rollback. Recording and export must be stopped.', buttons: ['Restart and install', 'Cancel'], defaultId: 1, cancelId: 1, noLink: true });
        if (answer.response === 0) { const result = updates.install(); if (result.status !== 'install-requested') await explain(result); }
      }) },
      { label: 'Restore previous version…', click: guarded(async () => {
        if (isBusy()) return explain({ status: 'busy' });
        if (!updates.canRollback()) return explain({ reason: 'There is no previous-version backup for this installation.' });
        const answer = await dialog.showMessageBox(window(), { type: 'question', message: 'Save your work, then restore the previous AppImage?', detail: 'Only the application file is restored. Projects and settings are kept. Close and reopen Rough Cut after restoring.', buttons: ['Restore previous version', 'Cancel'], defaultId: 1, cancelId: 1, noLink: true });
        if (answer.response === 0) { updates.rollback(); app.quit(); }
      }) },
      { type: 'separator' },
      { label: 'Crash reports…', click: guarded(() => reports.show(window())) },
    ] },
  ]));
  app.on('render-process-gone', (_event, _contents, details) => reports.capture({ processType: 'renderer', reason: details.reason, exitCode: details.exitCode }));
  app.on('child-process-gone', (_event, details) => reports.capture({ processType: details.type === 'GPU' ? 'gpu' : 'utility', reason: details.reason, exitCode: details.exitCode }));
  const captureException = (error) => reports.capture({ processType: 'browser', reason: 'exception', errorType: error?.name });
  process.on('uncaughtExceptionMonitor', captureException);
  let timer;
  if (backend) {
    const checkWhenIdle = () => { if (!isBusy()) void updates.check(); };
    timer = setInterval(checkWhenIdle, 6 * 60 * 60 * 1000);
    timer.unref();
    checkWhenIdle();
  }
  app.once('will-quit', () => { clearInterval(timer); process.removeListener('uncaughtExceptionMonitor', captureException); });
  return { updates, reports };
}
