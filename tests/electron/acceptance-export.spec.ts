import { test, expect, navigateToTab } from './fixtures/electron-app.js';

test.describe('Export Tab — Acceptance', () => {
  test.beforeEach(async ({ appPage }) => {
    await navigateToTab(appPage, 'export');
  });

  test('shows the supported MP4 export settings', async ({ appPage }) => {
    const settings = appPage.locator('[data-testid="export-settings"]');
    await expect(settings).toBeVisible();
    await expect(settings.getByText('MP4 (H.264)')).toBeVisible();
    await expect(appPage.locator('[data-testid="export-preset-select"]')).toBeVisible();
    await expect(appPage.locator('[data-testid="export-resolution-select"]')).toHaveValue(
      '1920x1080',
    );
    await expect(appPage.locator('[data-testid="export-frame-rate-select"]')).toHaveValue('30');
    await expect(appPage.locator('[data-testid="export-crf-select"]')).toHaveValue('18');
  });

  test('lets you switch export settings from the preset controls', async ({ appPage }) => {
    await appPage.locator('[data-testid="export-preset-select"]').selectOption('draft');
    await expect(appPage.locator('[data-testid="export-resolution-select"]')).toHaveValue(
      '1280x720',
    );
    await expect(appPage.locator('[data-testid="export-frame-rate-select"]')).toHaveValue('24');
    await expect(appPage.locator('[data-testid="export-crf-select"]')).toHaveValue('30');

    await appPage.locator('[data-testid="export-resolution-select"]').selectOption('1080x1080');
    await appPage.locator('[data-testid="export-frame-rate-select"]').selectOption('60');
    await appPage.locator('[data-testid="export-crf-select"]').selectOption('18');

    await expect(appPage.locator('[data-testid="export-preset-select"]')).toHaveValue('custom');
  });

  test('explains that the save path is chosen at export time', async ({ appPage }) => {
    await expect(appPage.getByText(/Export saves to a path you choose/i)).toBeVisible();
  });

  test('includes a real progress region and status surface', async ({ appPage }) => {
    await expect(appPage.locator('[data-testid="export-progress"]')).toBeVisible();
    await expect(appPage.getByText('Ready to export')).toBeVisible();
  });

  test('shows an export queue surface for sequential jobs', async ({ appPage }) => {
    await expect(appPage.locator('[data-testid="export-queue"]')).toBeVisible();
    await expect(appPage.getByText(/No queued exports yet/i)).toBeVisible();
    await expect(appPage.locator('[data-testid="btn-export"]')).toContainText('Add to Queue');
  });

  test('shows the export range timeline', async ({ appPage }) => {
    await expect(appPage.getByText('Export Timeline')).toBeVisible();
    await expect(appPage.getByText(/Drag handles to set export range/i)).toBeVisible();
  });

  test('reports an honest error for an empty composition', async ({ appPage }) => {
    await appPage.locator('[data-testid="btn-export"]').click();
    await expect(appPage.locator('[data-testid="export-error"]')).toContainText(
      'Nothing to export yet. Add a clip to the timeline first.',
    );
  });
});
