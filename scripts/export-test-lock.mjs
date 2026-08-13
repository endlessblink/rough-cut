import { closeSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';

const STALE_LOCK_GRACE_MS = 10_000;

export function acquireExportTestLock(lockPath) {
  try {
    const fd = openSync(lockPath, 'wx');
    writeFileSync(fd, `${JSON.stringify({ pid: process.pid, host: hostname(), startedAt: new Date().toISOString() })}\n`);
    closeSync(fd);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    if (isLiveOwner(lockPath)) {
      const owner = readOwner(lockPath);
      throw new Error(`Another Rough Cut export test is already running (pid ${owner?.pid ?? 'unknown'}).`);
    }
    unlinkSync(lockPath);
    return acquireExportTestLock(lockPath);
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try { unlinkSync(lockPath); } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  };
  process.once('exit', release);
  return release;
}

function isLiveOwner(lockPath) {
  const owner = readOwner(lockPath);
  if (owner?.pid && owner.host === hostname()) {
    try {
      process.kill(owner.pid, 0);
      return true;
    } catch (error) {
      if (error?.code !== 'ESRCH') return true;
    }
  }
  try {
    return Date.now() - statSync(lockPath).mtimeMs < STALE_LOCK_GRACE_MS;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function readOwner(lockPath) {
  try { return JSON.parse(readFileSync(lockPath, 'utf8')); } catch { return null; }
}
