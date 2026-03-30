import { test, expect, navigateToTab } from './fixtures/electron-app.js';

test.describe('Projects tab', () => {
  test('shows the New Project button', async ({ appPage }) => {
    await expect(appPage.locator('[data-testid="btn-new-project"]')).toBeVisible();
  });

  test('New Project navigates to Record tab', async ({ appPage }) => {
    await appPage.click('[data-testid="btn-new-project"]');
    await expect(appPage.locator('[data-testid="record-tab-root"]')).toBeVisible({ timeout: 5_000 });
  });

  test('hero heading is present', async ({ appPage }) => {
    await expect(appPage.locator('text=Start a new project')).toBeVisible();
  });
});
