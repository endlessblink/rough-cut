import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DEFAULT_MAX_LOG_BYTES = 50 * 1024 * 1024;
const originalConsole = Object.fromEntries(
  ['log', 'info', 'warn', 'error'].map((level) => [level, console[level].bind(console)]),
);

export function installRuntimeLog(logPath = resolve(process.cwd(), '../../.logs/app-runtime.log'), options = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_LOG_BYTES;
  mkdirSync(dirname(logPath), { recursive: true });

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
