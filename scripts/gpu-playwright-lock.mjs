import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_STALE_MS = 10 * 60_000;
const POLL_MS = 500;
const lockDir = join(tmpdir(), 'rough-cut-headed-gpu-playwright.lock');
const holderPath = join(lockDir, 'holder.json');

export async function acquireGpuPlaywrightLock(holder, options = {}) {
  const timeoutMs = Number(options.timeoutMs ?? process.env.ROUGH_CUT_GPU_PLAYWRIGHT_LOCK_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const staleMs = Number(options.staleMs ?? process.env.ROUGH_CUT_GPU_PLAYWRIGHT_LOCK_STALE_MS ?? DEFAULT_STALE_MS);
  const startedAt = Date.now();
  const lockHolder = {
    holder,
    pid: process.pid,
    startedAt: new Date(startedAt).toISOString(),
  };

  for (;;) {
    try {
      await mkdir(lockDir);
      await writeFile(holderPath, `${JSON.stringify(lockHolder, null, 2)}\n`, 'utf8');
      return {
        path: lockDir,
        release: async () => {
          await rm(lockDir, { recursive: true, force: true });
        },
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const existing = await readExistingHolder();
      if (existing?.startedAt && Date.now() - Date.parse(existing.startedAt) > staleMs) {
        await rm(lockDir, { recursive: true, force: true });
        continue;
      }
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Timed out waiting for headed GPU Playwright lock: ${JSON.stringify({ lockDir, holder, existing })}`);
      }
      await sleep(POLL_MS);
    }
  }
}

async function readExistingHolder() {
  try {
    return JSON.parse(await readFile(holderPath, 'utf8'));
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
