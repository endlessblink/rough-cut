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

  test('clicking a timeline clip switches selection away from a zoom marker', async ({
    appPage,
  }) => {
    await appPage.locator('[data-testid="debug-reload"]').click();
    await appPage.waitForSelector('[data-testid="zoom-host"]', { timeout: 10_000 });

    await appPage.locator('[data-testid="zoom-add"]').click();

    const marker = appPage
      .locator('[data-testid="zoom-marker"][data-marker-kind="manual"]')
      .first();
    await expect(marker).toBeVisible();
    await marker.click({ force: true });

    await expect(appPage.locator('[data-testid="inspector-card-active"]')).toHaveAttribute(
      'data-category',
      'zoom',
    );

    const firstClip = appPage.locator('[data-testid="record-timeline-clip"]').first();
    await expect(firstClip).toBeVisible();
    await firstClip.click();

    await expect(appPage.locator('[data-testid="inspector-card-active"]')).not.toHaveAttribute(
      'data-category',
      'zoom',
    );
    await expect(firstClip).toHaveAttribute('data-selected', 'true');
  });

  test('inspector follows zoom, screen, and camera timeline selection', async ({ appPage }) => {
    await appPage.locator('[data-testid="debug-reload"]').click();
    await appPage.waitForSelector('[data-testid="zoom-host"]', { timeout: 10_000 });

    const assetIds = await appPage.evaluate(() => {
      const stores = (
        window as unknown as {
          __roughcutStores?: {
            project: {
              getState: () => {
                activeAssetId: string | null;
                project: {
                  assets: Array<{ id: string; type?: string; cameraAssetId?: string | null }>;
                };
              };
            };
          };
        }
      ).__roughcutStores;
      const state = stores?.project.getState();
      const activeRecording =
        state?.project.assets.find((asset) => asset.id === state.activeAssetId) ??
        state?.project.assets.find((asset) => asset.type === 'recording') ??
        null;
      return {
        recordingAssetId: activeRecording?.id ?? null,
        cameraAssetId: activeRecording?.cameraAssetId ?? null,
      };
    });

    await appPage.locator('[data-testid="zoom-add"]').click();
    const marker = appPage
      .locator('[data-testid="zoom-marker"][data-marker-kind="manual"]')
      .first();
    await marker.click({ force: true });

    await expect(appPage.locator('[data-testid="inspector-card-active"]')).toHaveAttribute(
      'data-category',
      'zoom',
    );

    await appPage
      .locator(`[data-testid="record-timeline-clip"][data-asset-id="${assetIds.recordingAssetId}"]`)
      .click();

    await expect(appPage.locator('[data-testid="inspector-card-active"]')).toHaveAttribute(
      'data-category',
      'crop',
    );

    if (assetIds.cameraAssetId) {
      await appPage
        .locator(`[data-testid="record-timeline-clip"][data-asset-id="${assetIds.cameraAssetId}"]`)
        .click();

      await expect(appPage.locator('[data-testid="inspector-card-active"]')).toHaveAttribute(
        'data-category',
        'camera',
      );
    }
  });

  test('app header is still visible', async ({ appPage }) => {
    await expect(appPage.locator('[data-testid="app-header"]')).toBeVisible();
  });
});
