import { open, opendir, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { arch as nativeArch, homedir, release, type } from 'node:os';
import { join, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

export const SUPPORT_LOG_MAX_BYTES = 2 * 1024 * 1024;
const HARD_LOG_MAX_BYTES = 8 * 1024 * 1024;
const ISSUE_URL = 'https://github.com/endlessblink/rough-cut/issues/new';
const SENSITIVE_NAME = /(?:token|secret|password|passwd|credential|authorization|cookie|api[_-]?key|private[_-]?key)/i;
const CHECK_IDS = new Set(['app', 'opens', 'screen', 'microphone', 'mic', 'camera', 'claude', 'transcription']);
const CHECK_STATES = new Set(['pass', 'fail', 'skipped', 'pending', 'running', 'error']);
const PRIVATE_PAYLOAD = /(?:["']?\b(?:prompt|transcript|transcription text|messages|environment|process\.env|env dump)\b["']?\s*[:=]|["']?[\w.-]*(?:token|secret|password|passwd|credential|authorization|cookie|api[_-]?key|private[_-]?key)[\w.-]*["']?\s*[:=])/i;

/** Redact the bounded log tail before it ever enters an archive. Never reads credential files. */
export function redactDiagnosticText(value, { home = homedir(), env = process.env } = {}) {
  let text = String(value ?? '');
  text = text.replace(/-----BEGIN [^\n]*PRIVATE KEY-----[\s\S]*?(?:-----END [^\n]*PRIVATE KEY-----|$)/gi, '[private key removed]');
  // Runtime log arguments can contain newlines. Remove the entire timestamped record when it contains a payload.
  if (/^\d{4}-\d{2}-\d{2}T\S+ (?:LOG|INFO|WARN|ERROR) /m.test(text)) {
    text = text.split(/(?=^\d{4}-\d{2}-\d{2}T\S+ (?:LOG|INFO|WARN|ERROR) )/m)
      .map(record => PRIVATE_PAYLOAD.test(record) ? '[private log entry removed]\n' : record).join('');
  }
  // Remove payload-bearing lines entirely: these may contain arbitrary user text or whole environments.
  text = text.split(/\r?\n/).map(line => PRIVATE_PAYLOAD.test(line)
    ? '[private payload removed]' : line).join('\n');
  // Strip the entire path, not only the account name; recording/project filenames can also be private.
  if (home) {
    const escapedHome = home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`${escapedHome}(?:[\\\\/][^\\s"'<>]*)?`, 'g'), '[home path removed]');
  }
  text = text.replace(/(?:\/Users\/|\/home\/)[^\s"'<>]+/g, '[home path removed]')
    .replace(/[A-Za-z]:\\Users\\[^\s"'<>]+/gi, '[home path removed]');
  // Exact values catch opaque credentials that do not have a recognizable token prefix.
  const values = Object.entries(env ?? {})
    .filter(([key, item]) => typeof item === 'string' && item && (item.length >= 4 || SENSITIVE_NAME.test(key)))
    .map(([, item]) => item).sort((a, b) => b.length - a.length);
  for (const item of values) text = text.split(item).join('[redacted]');
  text = text
    .replace(/-----BEGIN [\s\S]*?PRIVATE KEY-----[\s\S]*?(?:-----END [^\n]*PRIVATE KEY-----|$)/gi, '[private key removed]')
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_=.~-]+/gi, '[authorization removed]')
    .replace(/\b(?:sk-ant-[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|xox[baprs]-[A-Za-z0-9-]+)/g, '[token removed]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token removed]')
    .replace(/((?:["']?)[\w.-]*(?:token|secret|password|passwd|credential|authorization|cookie|api[_-]?key|private[_-]?key)[\w.-]*["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;&}]+)/gi, '$1[redacted]')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[credentials removed]@')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removed]');
  return text;
}

/** Read only the final bounded bytes, never the entire potentially huge runtime log. */
export async function readBoundedLogTail(logPath, maxBytes = SUPPORT_LOG_MAX_BYTES) {
  const limit = Math.min(HARD_LOG_MAX_BYTES, Math.max(1, Math.trunc(Number(maxBytes) || SUPPORT_LOG_MAX_BYTES)));
  if (!logPath) return { text: '[Runtime log unavailable]\n', bytesRead: 0, truncated: false };
  let handle;
  try {
    handle = await open(logPath, 'r');
    const info = await handle.stat();
    if (!info.isFile()) return { text: '[Runtime log unavailable]\n', bytesRead: 0, truncated: false };
    const size = Math.min(info.size, limit);
    const buffer = Buffer.alloc(size);
    const { bytesRead } = await handle.read(buffer, 0, size, Math.max(0, info.size - size));
    let text = buffer.subarray(0, bytesRead).toString('utf8');
    // A truncated first line may begin halfway through a credential or private payload; discard it.
    if (info.size > limit) text = text.includes('\n') ? text.slice(text.indexOf('\n') + 1) : '';
    return { text, bytesRead, truncated: info.size > limit };
  } catch {
    return { text: '[Runtime log unavailable]\n', bytesRead: 0, truncated: false };
  } finally {
    await handle?.close();
  }
}

function boundedText(value, context, max = 200) {
  return typeof value === 'string' ? redactDiagnosticText(value.slice(0, max), context) : null;
}
function finite(value) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function bool(value) { return typeof value === 'boolean' ? value : null; }
function pickNumbers(value, names) { return Object.fromEntries(names.map(name => [name, finite(value?.[name])])); }
function date(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value) ? value : null; }
function permission(value) {
  return ['granted', 'denied', 'restricted', 'not-determined', 'unknown', 'unsupported', 'not-applicable'].includes(value) ? value : 'unknown';
}

export function summarizeSelfCheck(value, context = {}) {
  const checks = Array.isArray(value) ? value : value?.checks;
  return {
    checkedAt: date(value?.checkedAt ?? value?.completedAt),
    checks: (Array.isArray(checks) ? checks : []).slice(0, 12)
      .filter(check => CHECK_IDS.has(check?.id))
      .map(check => ({
        id: check.id,
        status: CHECK_STATES.has(check.status) ? check.status : 'pending',
        detail: boundedText(check.detail, context),
        checkedAt: date(check.checkedAt),
      })),
  };
}

/** Allowlist metadata instead of serializing arbitrary app state, CLI output, media, or recordings. */
export function buildSupportSummary(options = {}) {
  const context = { home: options.home, env: options.env };
  const text = value => boundedText(value, context);
  const recording = options.lastRecording?.recording ?? options.lastRecording;
  const deviceNames = values => (Array.isArray(values) ? values : []).slice(0, 50)
    .map(item => text(typeof item === 'string' ? item : item?.label ?? item?.name)).filter(Boolean);
  const env = options.env ?? process.env;
  return {
    schemaVersion: 1,
    generatedAt: (options.now ?? new Date()).toISOString(),
    app: { version: text(options.appVersion), platform: text(options.platform ?? process.platform), chip: text(options.arch ?? nativeArch()) },
    os: { name: text(options.osName ?? type()), version: text(options.osVersion ?? release()) },
    permissions: Object.fromEntries(['screen', 'microphone', 'camera', 'accessibility'].map(name => [name, permission(options.permissions?.[name] ?? (name === 'microphone' ? options.permissions?.mic : undefined))])),
    devices: { cameras: deviceNames(options.devices?.cameras), microphones: deviceNames(options.devices?.microphones ?? options.devices?.mics) },
    claude: {
      connected: bool(options.claude?.ok ?? options.claude?.connected),
      status: text(options.claude?.status), version: text(options.claude?.version),
      environmentVariableNames: Object.keys(env).filter(name => /^[A-Z][A-Z0-9_]{0,100}$/.test(name) && /^(?:ANTHROPIC_|CLAUDE_)/.test(name) && Boolean(env[name])).sort(),
    },
    transcription: {
      available: bool(options.transcription?.available ?? options.transcription?.ok),
      engine: text(typeof options.transcription === 'string' ? options.transcription : options.transcription?.engine ?? options.transcription?.provider),
    },
    lastRecording: recording ? {
      status: text(options.lastRecording?.status ?? recording.state),
      startedAt: date(recording.startedAt), stoppedAt: date(recording.stoppedAt),
      ...pickNumbers(recording, ['width', 'height', 'fps', 'expectedDurationMs', 'mediaDurationMs', 'durationDeltaMs', 'durationMs']),
      hasVideo: bool(options.lastRecording?.media?.hasVideo), hasAudio: bool(options.lastRecording?.media?.hasAudio),
      cursor: pickNumbers(options.lastRecording?.cursor, ['totalEvents', 'moveEvents', 'buttonEvents']),
      remux: pickNumbers(options.lastRecording?.remux, ['frameDrops', 'queueWarnings']),
    } : null,
    selfCheck: summarizeSelfCheck(options.selfCheck, context),
  };
}

/** Restart-safe last-session metadata. Read only small diagnostics JSON files, never projects or media. */
export async function readLastRecordingSummary(recordingsDir) {
  if (typeof recordingsDir !== 'string') return null;
  let root;
  try { root = await realpath(recordingsDir); } catch { return null; }
  const candidates = [];
  let entriesSeen = 0;
  const inspectFolder = async (folder, maxEntries) => {
    try {
      const entries = await opendir(folder);
      let count = 0;
      for await (const entry of entries) {
        if (++count > maxEntries) break;
        if (entry.isFile() && entry.name.endsWith('.diagnostics.json')) {
          const path = join(folder, entry.name);
          const resolved = await realpath(path).catch(() => null);
          if (!resolved?.startsWith(root + sep)) continue;
          const info = await stat(resolved).catch(() => null);
          if (info?.isFile() && info.size <= 1024 * 1024) candidates.push({ path: resolved, modified: info.mtimeMs });
        }
      }
    } catch { /* A missing/unreadable folder cannot prevent a report. */ }
  };
  try {
    const entries = await opendir(root);
    const folders = [];
    for await (const entry of entries) {
      if (++entriesSeen > 500) break;
      if (entry.isDirectory()) folders.push(entry.name);
    }
    // Recording folders start with an ISO date; prefer the newest within the bounded scan.
    for (const folder of folders.sort().reverse().slice(0, 100)) await inspectFolder(join(root, folder), 64);
    await inspectFolder(root, 500); // Also supports recordings made before per-project folders.
  } catch { return null; }
  for (const candidate of candidates.sort((a, b) => b.modified - a.modified)) {
    let handle;
    try {
      handle = await open(candidate.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const info = await handle.stat();
      if (!info.isFile() || info.size > 1024 * 1024) continue;
      const buffer = Buffer.alloc(Math.min(info.size + 1, 1024 * 1024 + 1));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead > 1024 * 1024) continue;
      const raw = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
      const safe = buildSupportSummary({ lastRecording: raw }).lastRecording;
      if (!safe) continue;
      return { status: safe.status, recording: safe, media: { hasVideo: safe.hasVideo, hasAudio: safe.hasAudio }, cursor: safe.cursor, remux: safe.remux };
    } catch { /* Try the next small diagnostics file when the latest is incomplete. */ }
    finally { await handle?.close(); }
  }
  return null;
}

// ZIP's uncompressed format is sufficient for a small bounded report and avoids a new dependency or shell program.
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zipFiles(files) {
  const local = [], central = [];
  let offset = 0;
  for (const [filename, content] of Object.entries(files)) {
    const name = Buffer.from(filename), data = Buffer.from(content), checksum = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4);
    header.writeUInt32LE(checksum, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
    local.push(header, name, data);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(0x0314, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(checksum, 16); directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE((0o100600 << 16) >>> 0, 38); directory.writeUInt32LE(offset, 42);
    central.push(directory, name); offset += header.length + name.length + data.length;
  }
  const centralBytes = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(local.length / 3, 8); end.writeUInt16LE(local.length / 3, 10);
  end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, end]);
}

export function supportIssueUrl(appVersion) {
  const url = new URL(ISSUE_URL);
  url.searchParams.set('template', 'mac-alpha-bug.yml');
  url.searchParams.set('title', `[Mac alpha] Rough Cut ${/^\d[\w.+-]{0,50}$/.test(appVersion ?? '') ? appVersion : ''}: `);
  return url.toString();
}

/** Local file creation only. The caller shows the path and opens a draft issue; nothing is uploaded. */
export async function createSupportReport(options = {}) {
  const { desktopPath, runtimeLogPath } = options;
  if (typeof desktopPath !== 'string' || !(await stat(desktopPath)).isDirectory()) throw new Error('Desktop folder unavailable. No report was created.');
  const summary = buildSupportSummary(options);
  const log = await readBoundedLogTail(runtimeLogPath, options.maxLogBytes);
  summary.runtimeLog = { bytesRead: log.bytesRead, truncated: log.truncated, maximumBytes: Math.min(HARD_LOG_MAX_BYTES, options.maxLogBytes || SUPPORT_LOG_MAX_BYTES) };
  const files = {
    'summary.json': `${JSON.stringify(summary, null, 2)}\n`,
    'self-check.json': `${JSON.stringify(summary.selfCheck, null, 2)}\n`,
    'app-runtime.log': redactDiagnosticText(log.text, { home: options.home, env: options.env }),
    'README.txt': 'Rough Cut problem report\n\nReview these files before sharing. Home folder names, known secrets and private payloads are removed.\nNo recordings, thumbnails, transcripts, account details or environment values are intentionally included.\nAttach this zip to the Mac alpha bug issue and answer its three questions. Nothing was uploaded automatically.\n',
  };
  const filename = `Rough-Cut-report-${summary.generatedAt.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.zip`;
  const zipPath = join(desktopPath, filename);
  const handle = await open(zipPath, 'wx', 0o600);
  try { await handle.writeFile(zipFiles(files)); } finally { await handle.close(); }
  return { zipPath, fileNames: Object.keys(files), issueUrl: supportIssueUrl(options.appVersion), summary };
}
