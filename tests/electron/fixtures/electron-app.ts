import {
  test as base,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

type ElectronFixtures = {
  electronApp: ElectronApplication;
  appPage: Page;
};

type WorkerFixtures = {
  rendererUrl: string;
};

async function getFreePort(): Promise<number> {
  const { createServer } = await import('node:net');

  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate a free port')));
        return;
      }

      server.close((closeError) => {
        if (closeError) reject(closeError);
        else resolvePort(address.port);
      });
    });
  });
}

async function waitForServer(url: string, child: ChildProcessWithoutNullStreams): Promise<void> {
  const startedAt = Date.now();
  let stderr = '';

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
    if (stderr.length > 4000) stderr = stderr.slice(-4000);
  });

  while (Date.now() - startedAt < 30_000) {
    if (child.exitCode !== null) {
      throw new Error(`Vite exited before becoming ready: ${stderr}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}

    await delay(250);
  }

  throw new Error(`Timed out waiting for Vite at ${url}: ${stderr}`);
}

export const test = base.extend<ElectronFixtures, WorkerFixtures>({
  rendererUrl: [
    async ({}, use) => {
      const port = await getFreePort();
      const rendererUrl = `http://127.0.0.1:${port}`;
      const viteBin = resolve(process.cwd(), 'apps/desktop/node_modules/.bin/vite');
      const viteProcess = spawn(
        viteBin,
        [
          '--config',
          resolve(process.cwd(), 'apps/desktop/vite.config.ts'),
          '--host',
          '127.0.0.1',
          '--port',
          String(port),
          '--strictPort',
        ],
        {
          cwd: process.cwd(),
          env: process.env,
          stdio: 'pipe',
        },
      );

      try {
        await waitForServer(rendererUrl, viteProcess);
        await use(rendererUrl);
      } finally {
        viteProcess.kill('SIGTERM');
        await Promise.race([
          new Promise((resolveExit) => viteProcess.once('exit', resolveExit)),
          delay(5_000).then(() => viteProcess.kill('SIGKILL')),
        ]);
      }
    },
    { scope: 'worker' },
  ],

  electronApp: async ({ rendererUrl }, use) => {
    const app = await electron.launch({
      args: ['--no-sandbox', 'apps/desktop'],
      cwd: process.cwd(),
      env: {
        ...process.env,
        ROUGH_CUT_RENDERER_URL: rendererUrl,
      },
    });
    await use(app);
    await app.close();
  },

  appPage: async ({ electronApp, rendererUrl }, use) => {
    const page = await electronApp.firstWindow();

    await page.waitForURL((url) => url.href.startsWith(rendererUrl), { timeout: 30_000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 30_000 });

    // Wait for React to mount something into the app root. Individual tests
    // already wait for their own tab-specific UI, so the shared fixture should
    // avoid baking in assumptions about which surface renders first.
    await page.waitForFunction(
      () => {
        const root = document.getElementById('root');
        return Boolean(root && root.childElementCount > 0);
      },
      { timeout: 30_000 },
    );

    await use(page);
  },
});

export { expect } from '@playwright/test';

/** Skip tests for surfaces that are intentionally hidden from the app header. */
export async function skipIfHeaderTabHidden(page: Page, tabId: string, label = tabId) {
  const isHeaderTabVisible = await page
    .locator(`[data-testid="tab-${tabId}"]`)
    .isVisible()
    .catch(() => false);

  test.skip(
    !isHeaderTabVisible,
    `${label} acceptance is gated while the ${label} tab is hidden from the app header.`,
  );
}

/** Navigate to a tab by clicking its testid button and waiting for the tab root to appear. */
export async function navigateToTab(page: Page, tabId: string) {
  const tabButtonSelector = `[data-testid="tab-${tabId}"]`;
  const tabRootSelector = `[data-testid="${tabId}-tab-root"]`;
  const tabRoot = page.locator(tabRootSelector);
  if (await tabRoot.isVisible().catch(() => false)) {
    return;
  }

  const switchedDirectly = await page
    .evaluate((nextTab) => {
      const setter = (window as unknown as { __roughcutSetActiveTab?: (tab: string) => void })
        .__roughcutSetActiveTab;
      if (!setter) return false;
      setter(nextTab);
      return true;
    }, tabId)
    .catch(() => false);

  if (switchedDirectly) {
    await page.waitForSelector(tabRootSelector, { timeout: 30_000 });
    return;
  }

  const tabButton = page.locator(tabButtonSelector);
  await tabButton.waitFor({ state: 'visible', timeout: 30_000 });

  // App startup occasionally races the first tab switch, so retry a few times
  // before failing the test.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await tabButton.click();

    const navigated = await page
      .waitForFunction((selector) => Boolean(document.querySelector(selector)), tabRootSelector, {
        timeout: 5_000,
      })
      .then(() => true)
      .catch(() => false);

    if (navigated) {
      return;
    }
  }

  await page.waitForSelector(tabRootSelector, { timeout: 30_000 });
}
