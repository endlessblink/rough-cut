import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const DEFAULT_MAX_LOG_BYTES = 50 * 1024 * 1024;
const originalConsole = Object.fromEntries(
  ['log', 'info', 'warn', 'error'].map((level) => [level, console[level].bind(console)]),
);

// Where the log goes when the caller gives no path. Dev and the dock launcher
// keep the repo-relative `.logs/`; anything else (a downloaded build started
// from any folder) must never depend on the working directory.
export function defaultRuntimeLogPath(env = process.env, cwd = process.cwd()) {
  if (env.ROUGH_CUT_LOG_PATH) return env.ROUGH_CUT_LOG_PATH;
  if (env.ROUGH_CUT_DOCK_LAUNCH === '1' || env.ROUGH_CUT_DEV_LOGS === '1') return resolve(cwd, '../../.logs/app-runtime.log');
  const configRoot = env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(configRoot, 'rough-cut-mvp', 'logs', 'app-runtime.log');
}

export function installRuntimeLog(logPath = defaultRuntimeLogPath(), options = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_LOG_BYTES;
  // Logging must never stop the app from starting.
  try {
    mkdirSync(dirname(logPath), { recursive: true });
  } catch {
    logPath = join(tmpdir(), 'rough-cut-mvp-app-runtime.log');
    try { mkdirSync(dirname(logPath), { recursive: true }); } catch { /* tmp always exists */ }
  }

  for (const level of ['log', 'info', 'warn', 'error']) {
    console[level] = (...args) => {
      originalConsole[level](...args);
      appendLine(logPath, level, args, maxBytes);
    };
  }

  process.on('uncaughtException', (err) => {
    console.error('[process] uncaughtException', err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[process] unhandledRejection', reason);
  });

  return logPath;
}

function appendLine(logPath, level, args, maxBytes) {
  try {
    const rendered = args.map(renderArg).join(' ');
    const line = `${new Date().toISOString()} ${level.toUpperCase()} ${rendered}\n`;
    rotateLogIfNeeded(logPath, maxBytes, Buffer.byteLength(line));
    appendFileSync(logPath, line);
  } catch {
    // Logging must never crash the app.
  }
}

function rotateLogIfNeeded(logPath, maxBytes, nextBytes = 0) {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0 || !existsSync(logPath)) return;
  if (statSync(logPath).size + nextBytes < maxBytes) return;

  const rotatedPath = `${logPath}.1`;
  try {
    renameSync(logPath, rotatedPath);
  } catch {
    // Logging must never crash the app.
  }
}

function renderArg(arg) {
  if (arg instanceof Error) return `${arg.stack || arg.message}`;
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}
