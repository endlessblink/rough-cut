import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createSupportReport, summarizeSelfCheck, readLastRecordingSummary } from './support-diagnostics.mjs';

// The renderer can request observations, never arbitrary files or destinations.
export function installSupportServices({ app, ipcMain, channels, desktopCapturer, getPermissions,
  getDevices, getClaude, getTranscription, getRecording, recordingsDir, runtimeLogPath, shell, dialog, BrowserWindow }) {
  const selfCheckPath = join(app.getPath('userData'), 'mac-self-check.json');
  const parent = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  async function readSelfCheck() {
    try {
      const data = await readFile(selfCheckPath, 'utf8');
      if (data.length > 32768) return null;
      const checks = summarizeSelfCheck(JSON.parse(data)).checks;
      return checks.length ? checks : null;
    } catch { return null; }
  }
  async function status() {
    const [claude, transcription, selfCheck] = await Promise.all([
      Promise.resolve().then(getClaude).catch(() => ({ ok: false, status: 'unavailable' })),
      Promise.resolve().then(getTranscription).catch(() => ({ available: false, engine: null })), readSelfCheck()]);
    return { platform: process.platform, appVersion: app.getVersion(), permissions: getPermissions(),
      claude: { ok: claude?.ok === true, status: claude?.status ?? 'unavailable' },
      transcription: { available: transcription?.available === true, engine: transcription?.engine ?? null }, selfCheck };
  }
  async function saveSelfCheck(results) {
    if (!Array.isArray(results) || results.length > 6 || JSON.stringify(results).length > 32768) throw new Error('Invalid self-check results.');
    const checkedAt = new Date().toISOString();
    const checks = summarizeSelfCheck(results.map(check => ({ ...check, checkedAt }))).checks;
    if (checks.length !== 6 || new Set(checks.map(check => check.id)).size !== 6 ||
      !['opens', 'screen', 'mic', 'camera', 'claude', 'transcription'].every(id => checks.some(check => check.id === id)) ||
      checks.some(check => !['pass', 'fail', 'skipped'].includes(check.status))) throw new Error('Finish all six checks before saving.');
    await mkdir(app.getPath('userData'), { recursive: true });
    const temp = `${selfCheckPath}.tmp`;
    await writeFile(temp, JSON.stringify(checks), { mode: 0o600 });
    await rename(temp, selfCheckPath);
    return checks;
  }
  async function screenThumbnail() {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 480, height: 270 } });
    // A permission status alone is insufficient: require a real non-empty frame.
    const source = sources.find(item => item.thumbnail && !item.thumbnail.isEmpty());
    if (!source) throw new Error('No screen image is available. Allow Screen Recording in System Settings, then reopen Rough Cut.');
    return { dataUrl: source.thumbnail.toDataURL() };
  }
  async function createReport() {
    const [current, devices, lastRecording] = await Promise.all([status(),
      Promise.resolve().then(getDevices).catch(() => ({ cameras: [], microphones: [], discoveryFailed: true })),
      readLastRecordingSummary(recordingsDir)]);
    const recording = getRecording();
    return createSupportReport({ desktopPath: app.getPath('desktop'), runtimeLogPath, appVersion: app.getVersion(),
      permissions: current.permissions, devices, claude: current.claude, transcription: current.transcription,
      selfCheck: { checkedAt: current.selfCheck?.[0]?.checkedAt, checks: current.selfCheck ?? [] },
      lastRecording: recording?.startedAt ? recording : lastRecording });
  }
  async function reportProblem() {
    const report = await createReport();
    shell.showItemInFolder(report.zipPath);
    // A browser form opens; no upload, issue creation, or telemetry request occurs here.
    let issueOpened = true;
    try { await shell.openExternal(report.issueUrl); } catch { issueOpened = false; }
    void dialog.showMessageBox(parent(), { type: 'info', message: 'Your report zip is on the Desktop.',
      detail: issueOpened ? 'Nothing was sent automatically. Review the zip, then attach it to the Mac alpha bug form in your browser.'
        : 'Nothing was sent automatically. The browser could not open. Your zip is still saved; open the Rough Cut GitHub page and choose New issue to attach it.', buttons: ['OK'] }).catch(() => {});
    return { ...report, issueOpened };
  }
  ipcMain.handle(channels.SUPPORT_STATUS, () => status());
  ipcMain.handle(channels.SUPPORT_SCREEN_THUMBNAIL, () => screenThumbnail());
  ipcMain.handle(channels.SUPPORT_SAVE_SELF_CHECK, (_event, checks) => saveSelfCheck(checks));
  ipcMain.handle(channels.SUPPORT_CREATE_REPORT, () => createReport());
  ipcMain.handle(channels.SUPPORT_REPORT_PROBLEM, () => reportProblem());
  return { status, saveSelfCheck, screenThumbnail, createReport, reportProblem };
}
