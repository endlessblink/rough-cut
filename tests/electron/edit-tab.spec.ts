import { test, expect, navigateToTab } from './fixtures/electron-app.js';

test.describe('Edit tab', () => {
  test.beforeEach(async ({ appPage }) => {
    await navigateToTab(appPage, 'edit');
  });

  test('renders the edit tab root', async ({ appPage }) => {
    await expect(appPage.locator('[data-testid="edit-tab-root"]')).toBeVisible();
  });

  test('shows the timeline', async ({ appPage }) => {
    await expect(appPage.locator('[data-testid="edit-timeline"]')).toBeVisible();
  });

  test('toolbar buttons exist', async ({ appPage }) => {
    await expect(appPage.locator('[data-testid="btn-undo"]')).toBeVisible();
    await expect(appPage.locator('[data-testid="btn-redo"]')).toBeVisible();
    await expect(appPage.locator('[data-testid="btn-split"]')).toBeVisible();
    await expect(appPage.locator('[data-testid="btn-delete"]')).toBeVisible();
  });

  test('split and delete are disabled without selection', async ({ appPage }) => {
    await expect(appPage.locator('[data-testid="btn-split"]')).toBeDisabled();
    await expect(appPage.locator('[data-testid="btn-delete"]')).toBeDisabled();
  });

  test('keyboard navigation does not crash', async ({ appPage }) => {
    // Press space (toggle play) and arrow keys (frame step)
    await appPage.keyboard.press('Space');
    await appPage.keyboard.press('ArrowRight');
    await appPage.keyboard.press('ArrowLeft');
    // If we get here without error, the tab is stable
    await expect(appPage.locator('[data-testid="edit-tab-root"]')).toBeVisible();
  });
});
