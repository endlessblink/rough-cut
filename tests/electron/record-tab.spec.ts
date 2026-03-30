import { test, expect, navigateToTab } from './fixtures/electron-app.js';

test.describe('Record tab', () => {
  test.beforeEach(async ({ appPage }) => {
    await navigateToTab(appPage, 'record');
  });

  test('renders the record tab root', async ({ appPage }) => {
    await expect(appPage.locator('[data-testid="record-tab-root"]')).toBeVisible();
  });

  test('shows the record button', async ({ appPage }) => {
    await expect(appPage.locator('[data-testid="btn-record"]')).toBeVisible();
  });

  test('record button shows REC text when idle', async ({ appPage }) => {
    const btn = appPage.locator('[data-testid="btn-record"]');
    await expect(btn).toContainText('REC');
  });

  test('timeline section is visible', async ({ appPage }) => {
    await expect(appPage.locator('[data-testid="record-timeline"]')).toBeVisible();
  });

  test('app header is still visible', async ({ appPage }) => {
    await expect(appPage.locator('[data-testid="app-header"]')).toBeVisible();
  });
});
