import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

type ElectronFixtures = {
  electronApp: ElectronApplication;
  appPage: Page;
};

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use) => {
    const app = await electron.launch({
      args: ['--no-sandbox', 'apps/desktop'],
      cwd: process.cwd(),
    });
    await use(app);
    await app.close();
  },

  appPage: async ({ electronApp }, use) => {
    // Find the renderer window (skip DevTools)
    let page = electronApp.windows().find((w) => w.url().includes('127.0.0.1:7544'));
    if (!page) {
      page = await electronApp.waitForEvent('window', {
        predicate: (w) => w.url().includes('127.0.0.1:7544'),
        timeout: 15_000,
      });
    }
    await page.waitForLoadState('domcontentloaded');
    // Wait for React hydration — app-header testid proves the app rendered
    await page.waitForSelector('[data-testid="app-header"]', { timeout: 10_000 });
    await use(page);
  },
});

export { expect } from '@playwright/test';

/** Navigate to a tab by clicking its testid button and waiting for the tab root to appear. */
export async function navigateToTab(page: Page, tabId: string) {
  await page.click(`[data-testid="tab-${tabId}"]`);
  await page.waitForSelector(`[data-testid="${tabId}-tab-root"]`, { timeout: 5_000 });
}
