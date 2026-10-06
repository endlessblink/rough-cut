import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const reasons = new Set(['manual', 'clean-exit', 'abnormal-exit', 'killed', 'crashed', 'oom', 'launch-failed', 'integrity-failure', 'exception']);
const processes = new Set(['browser', 'renderer', 'gpu', 'utility', 'unknown']);
const errorTypes = new Set(['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'AggregateError']);
const version = (v) => typeof v === 'string' && /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(v) ? v : 'unknown';

// Allowlisting prevents error messages, stack traces, URLs, environment variables,
// user names, project names and file paths from entering a report at all.
export function createCrashReport(event = {}, runtime = {}) {
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    product: 'Rough Cut',
    appVersion: version(runtime.appVersion),
    electronVersion: version(runtime.electronVersion),
    platform: ['linux', 'darwin', 'win32'].includes(runtime.platform) ? runtime.platform : 'unknown',
    arch: ['x64', 'arm64'].includes(runtime.arch) ? runtime.arch : 'unknown',
    processType: processes.has(event.processType) ? event.processType : 'unknown',
    reason: reasons.has(event.reason) ? event.reason : 'unknown',
    exitCode: Number.isSafeInteger(event.exitCode) ? event.exitCode : null,
    errorType: errorTypes.has(event.errorType) ? event.errorType : null,
  };
}

export function createCrashReporting({ userDataDir, runtime, dialogs, writeReport = writeFileSync } = {}) {
  const preferencePath = join(userDataDir, 'crash-reporting-preference.json');
  let enabled = false;
  try { enabled = JSON.parse(readFileSync(preferencePath, 'utf8')).localCollectionEnabled === true; } catch { /* disabled by default */ }
  let last = null;
  function setEnabled(value) {
    enabled = value === true;
    if (!enabled) last = null;
    mkdirSync(dirname(preferencePath), { recursive: true });
    writeFileSync(preferencePath, JSON.stringify({ localCollectionEnabled: enabled }) + '\n', { mode: 0o600 });
  }
  async function exportReport(window) {
    const payload = last ?? createCrashReport({ reason: 'manual' }, runtime);
    const selected = await dialogs.showSaveDialog(window, {
      title: 'Choose a local crash report file', defaultPath: 'rough-cut-crash-report.json',
      filters: [{ name: 'JSON report', extensions: ['json'] }],
    });
    if (selected.canceled || !selected.filePath) return { status: 'canceled' };
    const serialized = JSON.stringify(payload, null, 2) + '\n';
    const confirmation = await dialogs.showMessageBox(window, {
      type: 'question', title: 'Review crash report',
      message: 'Export this report to a local file?',
      detail: `Destination: ${selected.filePath}\n\nNo network upload. No recordings, project content, paths, stack traces or user identifiers are included.\n\nExact payload:\n${serialized}`,
      buttons: ['Export report', 'Cancel'], defaultId: 1, cancelId: 1, noLink: true,
    });
    if (confirmation.response !== 0) return { status: 'canceled' };
    writeReport(selected.filePath, serialized, { mode: 0o600 });
    return { status: 'exported', destination: selected.filePath };
  }
  return {
    get enabled() { return enabled; },
    capture(event) { if (enabled) last = createCrashReport(event, runtime); },
    latest() { return last; },
    async show(window) {
      const result = await dialogs.showMessageBox(window, {
        type: 'info', title: 'Crash reports',
        message: enabled ? 'Local crash reporting is enabled.' : 'Crash reporting is off.',
        detail: 'Free, local-only reporting. When enabled, the most recent crash event is kept in memory. Every export shows its destination and exact payload before you approve it. Nothing is uploaded automatically. Memory dumps, recordings and project content are never collected by this feature.',
        buttons: ['Export a report…', enabled ? 'Turn off local reporting' : 'Enable local reporting', 'Cancel'],
        defaultId: 2, cancelId: 2, noLink: true,
      });
      if (result.response === 0) return exportReport(window);
      if (result.response === 1) { setEnabled(!enabled); return { status: enabled ? 'enabled' : 'disabled' }; }
      return { status: 'canceled' };
    },
    exportReport,
  };
}
