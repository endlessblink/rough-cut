import { test, expect, navigateToTab } from './fixtures/electron-app.js';
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
    await loadZoomFixture(appPage);

    await appPage.locator('[data-testid="zoom-add"]').click();

    await appPage.evaluate(() => {
      type StoreSetState = (patch: { playheadFrame: number }) => void;
      const stores = (
        window as unknown as {
          __roughcutStores?: { transport: { setState: StoreSetState } };
        }
      ).__roughcutStores;
      stores?.transport.setState({ playheadFrame: 0 });
    });
    await navigateToTab(appPage, 'export');
    await appPage.waitForTimeout(300);

    const exportZoomSurface = appPage
      .locator('[data-testid="export-tab-root"] [data-testid="recording-playback-canvas"]')
      .first();
    const beforeTransform = await exportZoomSurface.evaluate(
      (el) => getComputedStyle(el as HTMLElement).transform,
    );

    await appPage.evaluate(() => {
      type StoreSetState = (patch: { playheadFrame: number }) => void;
      const stores = (
        window as unknown as {
          __roughcutStores?: { transport: { setState: StoreSetState } };
        }
      ).__roughcutStores;
      stores?.transport.setState({ playheadFrame: 5 });
    });
    await appPage.waitForTimeout(150);

    const duringTransform = await exportZoomSurface.evaluate(
      (el) => getComputedStyle(el as HTMLElement).transform,
    );

    await expect(exportZoomSurface).toBeVisible();
    expect(isIdentityTransform(beforeTransform)).toBe(true);
    expect(isIdentityTransform(duringTransform)).toBe(false);
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

function isIdentityTransform(transform: string): boolean {
  return transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)';
}
