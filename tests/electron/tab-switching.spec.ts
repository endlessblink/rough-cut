import { test, expect } from './fixtures/electron-app.js';

test.describe('Tab switching', () => {
  const tabs = [
    { id: 'record', root: 'record-tab-root' },
    { id: 'edit', root: 'edit-tab-root' },
    { id: 'motion', root: 'motion-tab-root' },
    { id: 'ai', root: 'ai-tab-root' },
    { id: 'export', root: 'export-tab-root' },
    { id: 'projects', root: 'projects-tab-root' },
  ];

  for (const tab of tabs) {
    test(`navigates to ${tab.id} tab`, async ({ appPage }) => {
      const errors: string[] = [];
      appPage.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });

      await appPage.click(`[data-testid="tab-${tab.id}"]`);
      await expect(appPage.locator(`[data-testid="${tab.root}"]`)).toBeVisible({ timeout: 5_000 });

      // Filter out known benign errors (e.g. media loading)
      const realErrors = errors.filter((e) => !e.includes('media://') && !e.includes('ERR_FILE_NOT_FOUND'));
      expect(realErrors).toHaveLength(0);
    });
  }

  test('round-trip: visit all tabs and return to projects', async ({ appPage }, testInfo) => {
    testInfo.setTimeout(60_000);
    for (const tab of tabs) {
      await appPage.click(`[data-testid="tab-${tab.id}"]`);
      await appPage.waitForSelector(`[data-testid="${tab.root}"]`, { timeout: 10_000 });
      // Brief settle — compositor init can be slow on first render
      await appPage.waitForTimeout(500);
    }
    await expect(appPage.locator('[data-testid="projects-tab-root"]')).toBeVisible();
  });
});
