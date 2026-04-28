import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function installRuntimeLog(logPath = resolve(process.cwd(), '../../.logs/app-runtime.log')) {
  mkdirSync(dirname(logPath), { recursive: true });

  for (const level of ['log', 'info', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      original(...args);
      appendLine(logPath, level, args);
    };
  }

  process.on('uncaughtException', (err) => {
    console.error('[process] uncaughtException', err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[process] unhandledRejection', reason);
  });
}

function appendLine(logPath, level, args) {
  const rendered = args.map(renderArg).join(' ');
  appendFileSync(logPath, `${new Date().toISOString()} ${level.toUpperCase()} ${rendered}\n`);
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
