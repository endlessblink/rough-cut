import { test, expect, navigateToTab } from './fixtures/electron-app.js';
import { loadPlaybackFixture } from './fixtures/playback-fixture.js';
import { loadZoomFixture } from './fixtures/zoom-fixture.js';

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

  test('displays editable resolution settings', async ({ appPage }) => {
    await expect(appPage.locator('[data-testid="export-resolution-select"]')).toHaveValue(
      '1920x1080',
    );
  });

  test('displays editable frame rate', async ({ appPage }) => {
    await expect(appPage.locator('[data-testid="export-frame-rate-select"]')).toHaveValue('30');
  });

  test('displays editable quality presets', async ({ appPage }) => {
    await expect(appPage.locator('[data-testid="export-preset-select"]')).toHaveValue('balanced');
    await expect(appPage.locator('[data-testid="export-crf-select"]')).toHaveValue('18');
  });

  test('record destination presets link social framing into export defaults', async ({ appPage }) => {
    await navigateToTab(appPage, 'record');
    await appPage.evaluate(() => {
      const button = document.querySelector(
        '[data-testid="inspector-rail-item"][data-category="destinations"]',
      ) as HTMLButtonElement | null;
      button?.click();
    });
    await expect(appPage.locator('[data-testid="inspector-card-active"]')).toHaveAttribute(
      'data-category',
      'destinations',
    );
    await appPage.evaluate(() => {
      const button = document.querySelector(
        '[data-testid="record-destination-preset-reels-portrait"]',
      ) as HTMLButtonElement | null;
      button?.click();
    });

    await navigateToTab(appPage, 'export');

    await expect(appPage.locator('[data-testid="export-linked-destination"]')).toContainText(
      'Reels / TikTok',
    );
    await expect(appPage.locator('[data-testid="export-preset-select"]')).toHaveValue(
      'social-vertical',
    );
    await expect(appPage.locator('[data-testid="export-resolution-select"]')).toHaveValue(
      '1080x1920',
    );
    await expect(appPage.locator('[data-testid="export-frame-rate-select"]')).toHaveValue('30');
  });

  test('displays export estimates', async ({ appPage }) => {
    const estimates = appPage.locator('[data-testid="export-estimates"]');
    await expect(estimates).toBeVisible();
    await expect(estimates.getByText('Clip Length')).toBeVisible();
    await expect(estimates.getByText('File Size')).toBeVisible();
    await expect(estimates.getByText('Export Time')).toBeVisible();
  });

  test('export button is visible', async ({ appPage }) => {
    const btn = appPage.locator('[data-testid="btn-export"]');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('Queue');
  });

  test('export timeline header is present', async ({ appPage }) => {
    await expect(appPage.locator('text=Export Timeline')).toBeVisible();
  });

  test('export preview responds to active zoom markers', async ({ appPage }) => {
    await navigateToTab(appPage, 'record');
    await loadPlaybackFixture(appPage, 'record');

    await appPage.evaluate(() => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      const projectState = stores?.project?.getState();
      const activeAssetId = projectState?.activeAssetId;
      if (activeAssetId) {
        projectState.addRecordingZoomMarker?.(activeAssetId, 0, 20);
      }
      stores?.transport.setState({ playheadFrame: 5 });
    });
    await navigateToTab(appPage, 'export');
    await appPage.waitForTimeout(300);

    const exportZoomSurface = appPage
      .locator('[data-testid="export-tab-root"] [data-testid="recording-playback-canvas"]')
      .first();
    const before = hashBytes(await exportZoomSurface.screenshot({ timeout: 5_000 }));

    await appPage.evaluate(() => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      const projectStore = stores?.project;
      const state = projectStore?.getState();
      const activeAssetId = state?.activeAssetId;
      if (!activeAssetId) return;

      projectStore.getState().updateProject((doc: any) => ({
        ...doc,
        assets: doc.assets.map((asset: any) =>
          asset.id === activeAssetId
            ? {
                ...asset,
                presentation: {
                  ...(asset.presentation ?? {}),
                  zoom: {
                    ...(asset.presentation?.zoom ?? {}),
                    autoIntensity: 0,
                    markers: [],
                  },
                },
              }
            : asset,
        ),
      }));
    });
    await appPage.waitForTimeout(300);

    const after = hashBytes(await exportZoomSurface.screenshot({ timeout: 5_000 }));

    await expect(exportZoomSurface).toBeVisible();
    expect(before).not.toBe(after);
  });

  test('export preview applies camera layout snapshots by playhead', async ({ appPage }) => {
    await navigateToTab(appPage, 'record');
    await loadZoomFixture(appPage);
    const snapshotFrame = 57;

    await appPage.evaluate(
      ({ snapshotFrame }) => {
        const stores = (
          window as unknown as {
            __roughcutStores?: {
              project: {
                getState: () => {
                  activeAssetId: string | null;
                  addRecordingCameraLayoutSnapshot?: Function;
                };
              };
              transport: { setState: (patch: { playheadFrame: number }) => void };
            };
          }
        ).__roughcutStores;
        const state = stores?.project.getState();
        if (state?.activeAssetId) {
          state.addRecordingCameraLayoutSnapshot?.(state.activeAssetId, snapshotFrame, {
            camera: {
              shape: 'rounded',
              aspectRatio: '16:9',
              position: 'corner-br',
              roundness: 100,
              size: 100,
              visible: false,
              padding: 0,
              inset: 0,
              insetColor: '#ffffff',
              shadowEnabled: false,
              shadowBlur: 24,
              shadowOpacity: 0.45,
            },
          });
        }
        stores?.transport.setState({ playheadFrame: 0 });
      },
      { snapshotFrame },
    );

    await navigateToTab(appPage, 'export');
    await appPage.waitForTimeout(250);

    await expect(appPage.locator('[data-testid="record-camera-frame"]')).toHaveCount(1);

    await appPage.evaluate(
      ({ snapshotFrame }) => {
        const stores = (
          window as unknown as {
            __roughcutStores?: {
              transport: { setState: (patch: { playheadFrame: number }) => void };
            };
          }
        ).__roughcutStores;
        stores?.transport.setState({ playheadFrame: snapshotFrame });
      },
      { snapshotFrame },
    );
    await appPage.waitForTimeout(250);

    const visible = await appPage
      .locator('[data-testid="template-preview-root"]')
      .getAttribute('data-camera-visible');
    const layoutFrame = await appPage
      .locator('[data-testid="template-preview-root"]')
      .getAttribute('data-active-layout-frame');

    expect(layoutFrame).toBe(String(snapshotFrame));
    expect(visible).toBe('false');
  });
});

function hashBytes(buffer: Buffer): number {
  let hash = 0;

  for (const value of buffer.values()) {
    hash = (hash * 33 + value) % 2147483647;
  }

  return hash;
}
