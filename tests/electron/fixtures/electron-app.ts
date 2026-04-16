import {
  test as base,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

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
    const page = await electronApp.firstWindow();

    await page.waitForURL(/127\.0\.0\.1:7544/, { timeout: 30_000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 30_000 });

    // Wait for React to mount any app shell/tab content, not one specific header.
    await page.waitForFunction(
      () => {
        const root = document.getElementById('root');
        if (!root || root.childElementCount === 0) return false;

        return Boolean(
          document.querySelector('[data-testid="app-header"]') ||
          document.querySelector('[data-testid="projects-tab-root"]') ||
          document.querySelector('[data-testid="record-tab-root"]') ||
          document.querySelector('[data-testid="edit-tab-root"]') ||
          document.querySelector('[data-testid="export-tab-root"]') ||
          document.querySelector('[data-testid="motion-tab-root"]') ||
          document.querySelector('[data-testid="ai-tab-root"]'),
        );
      },
      { timeout: 30_000 },
    );

    await use(page);
  },
});

export { expect } from '@playwright/test';

/** Navigate to a tab by clicking its testid button and waiting for the tab root to appear. */
export async function navigateToTab(page: Page, tabId: string) {
  const tabButtonSelector = `[data-testid="tab-${tabId}"]`;
  const tabRootSelector = `[data-testid="${tabId}-tab-root"]`;
  const tabRoot = page.locator(tabRootSelector);
  if (await tabRoot.isVisible().catch(() => false)) {
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
