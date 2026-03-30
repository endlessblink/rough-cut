import { test, expect, navigateToTab } from './fixtures/electron-app.js';

test.describe('Export tab', () => {
  test.beforeEach(async ({ appPage }) => {
    await navigateToTab(appPage, 'export');
  });

  test('renders the export tab root', async ({ appPage }) => {
    await expect(appPage.locator('[data-testid="export-tab-root"]')).toBeVisible();
  });

  test('shows settings panel', async ({ appPage }) => {
    await expect(appPage.locator('[data-testid="export-settings"]')).toBeVisible();
  });

  test('displays format as MP4', async ({ appPage }) => {
    await expect(appPage.locator('text=MP4 (H.264)')).toBeVisible();
  });

  test('displays resolution', async ({ appPage }) => {
    const settings = appPage.locator('[data-testid="export-settings"]');
    await expect(settings.getByText(/1920/)).toBeVisible();
  });

  test('displays frame rate', async ({ appPage }) => {
    const settings = appPage.locator('[data-testid="export-settings"]');
    await expect(settings.getByText(/fps/)).toBeVisible();
  });

  test('export button is visible', async ({ appPage }) => {
    const btn = appPage.locator('[data-testid="btn-export"]');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('Export');
  });

  test('export timeline header is present', async ({ appPage }) => {
    await expect(appPage.locator('text=Export Timeline')).toBeVisible();
  });
});
