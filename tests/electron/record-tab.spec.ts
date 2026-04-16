import { test, expect, navigateToTab } from './fixtures/electron-app.js';

type RoughcutApi = {
  recordingGetSources: () => Promise<Array<{ id: string; type: 'screen' | 'window' }>>;
  recordingConfigUpdate: (patch: Record<string, unknown>) => Promise<unknown>;
  openRecordingPanel: () => Promise<void>;
  closeRecordingPanel: () => Promise<void>;
};

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

  test('record controls update the shared recording config store', async ({ appPage }) => {
    await appPage.evaluate(async () => {
      await (
        window as unknown as {
          roughcut: { recordingConfigUpdate: (patch: Record<string, unknown>) => Promise<unknown> };
        }
      ).roughcut.recordingConfigUpdate({
        recordMode: 'window',
        micEnabled: false,
        sysAudioEnabled: false,
        cameraEnabled: false,
        countdownSeconds: 5,
      });
    });

    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          const stores = (
            window as unknown as {
              __roughcutStores?: {
                recordingConfig?: {
                  getState: () => {
                    recordMode: string;
                    micEnabled: boolean;
                    sysAudioEnabled: boolean;
                    cameraEnabled: boolean;
                    countdownSeconds: number;
                  };
                };
              };
            }
          ).__roughcutStores;
          return stores?.recordingConfig?.getState() ?? null;
        }),
      )
      .toMatchObject({
        recordMode: 'window',
        micEnabled: false,
        sysAudioEnabled: false,
        cameraEnabled: false,
        countdownSeconds: 5,
      });
  });

  test('opening the panel does not reset shared recording config', async ({ appPage }) => {
    await appPage.evaluate(async () => {
      const api = (
        window as unknown as {
          roughcut: {
            recordingConfigUpdate: (patch: Record<string, unknown>) => Promise<unknown>;
            openRecordingPanel: () => Promise<void>;
            closeRecordingPanel: () => Promise<void>;
          };
        }
      ).roughcut;

      await api.recordingConfigUpdate({
        recordMode: 'window',
        micEnabled: false,
        sysAudioEnabled: false,
        cameraEnabled: false,
        countdownSeconds: 10,
      });

      await api.openRecordingPanel();
      await new Promise((resolve) => setTimeout(resolve, 300));
      await api.closeRecordingPanel();
    });

    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          const stores = (
            window as unknown as {
              __roughcutStores?: {
                recordingConfig?: {
                  getState: () => {
                    recordMode: string;
                    micEnabled: boolean;
                    sysAudioEnabled: boolean;
                    cameraEnabled: boolean;
                    countdownSeconds: number;
                  };
                };
              };
            }
          ).__roughcutStores;
          return stores?.recordingConfig?.getState() ?? null;
        }),
      )
      .toMatchObject({
        recordMode: 'window',
        micEnabled: false,
        sysAudioEnabled: false,
        cameraEnabled: false,
        countdownSeconds: 10,
      });
  });

  test('panel hydrates the shared source and toggle config', async ({ appPage, electronApp }) => {
    const selectedSourceId = await appPage.evaluate(async () => {
      const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
      const sources = await api.recordingGetSources();
      const sourceId = sources[0]?.id ?? null;

      await api.recordingConfigUpdate({
        selectedSourceId: sourceId,
        micEnabled: false,
        sysAudioEnabled: false,
        cameraEnabled: false,
      });

      return sourceId;
    });

    const panelPromise = electronApp.waitForEvent('window');
    await appPage.evaluate(() => {
      return (window as unknown as { roughcut: RoughcutApi }).roughcut.openRecordingPanel();
    });
    const panelPage = await panelPromise;

    await panelPage.waitForLoadState('domcontentloaded');

    await expect
      .poll(async () =>
        panelPage.evaluate(() => {
          const stores = (
            window as unknown as {
              __roughcutStores?: {
                recordingConfig?: {
                  getState: () => {
                    hydrated: boolean;
                    selectedSourceId: string | null;
                    micEnabled: boolean;
                    sysAudioEnabled: boolean;
                    cameraEnabled: boolean;
                  };
                };
              };
            }
          ).__roughcutStores;
          return stores?.recordingConfig?.getState() ?? null;
        }),
      )
      .toMatchObject({
        hydrated: true,
        selectedSourceId,
        micEnabled: false,
        sysAudioEnabled: false,
        cameraEnabled: false,
      });

    if (selectedSourceId) {
      await expect(panelPage.locator('select')).toHaveValue(selectedSourceId);
    }

    await appPage.evaluate(() => {
      return (window as unknown as { roughcut: RoughcutApi }).roughcut.closeRecordingPanel();
    });
  });

  test('record mode switches reconcile capture source type and hydrate the panel', async ({
    appPage,
    electronApp,
  }) => {
    const sourceSummary = await appPage.evaluate(async () => {
      const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
      const sources = await api.recordingGetSources();
      return {
        screenIds: sources.filter((source) => source.type === 'screen').map((source) => source.id),
        windowIds: sources.filter((source) => source.type === 'window').map((source) => source.id),
      };
    });

    test.skip(
      sourceSummary.screenIds.length === 0 || sourceSummary.windowIds.length === 0,
      'Mode/source reconciliation requires both screen and window capture sources.',
    );

    const initialScreenSourceId = sourceSummary.screenIds[0] ?? null;
    if (!initialScreenSourceId) {
      throw new Error('Expected at least one screen capture source.');
    }

    await appPage.evaluate(
      async ({ sourceId }) => {
        const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
        await api.recordingConfigUpdate({
          recordMode: 'fullscreen',
          selectedSourceId: sourceId,
        });
      },
      { sourceId: initialScreenSourceId },
    );

    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          const stores = (
            window as unknown as {
              __roughcutStores?: {
                recordingConfig?: {
                  getState: () => {
                    recordMode: string;
                    selectedSourceId: string | null;
                  };
                };
              };
            }
          ).__roughcutStores;
          return stores?.recordingConfig?.getState() ?? null;
        }),
      )
      .toMatchObject({
        recordMode: 'fullscreen',
        selectedSourceId: initialScreenSourceId,
      });

    await appPage.evaluate(async () => {
      const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
      await api.recordingConfigUpdate({ recordMode: 'window' });
    });

    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          const stores = (
            window as unknown as {
              __roughcutStores?: {
                recordingConfig?: {
                  getState: () => {
                    recordMode: string;
                    selectedSourceId: string | null;
                  };
                };
              };
            }
          ).__roughcutStores;
          return stores?.recordingConfig?.getState() ?? null;
        }),
      )
      .toMatchObject({
        recordMode: 'window',
        selectedSourceId: expect.stringMatching(/^window:/),
      });

    const panelPromise = electronApp.waitForEvent('window');
    await appPage.evaluate(() => {
      return (window as unknown as { roughcut: RoughcutApi }).roughcut.openRecordingPanel();
    });
    const panelPage = await panelPromise;
    await panelPage.waitForLoadState('domcontentloaded');

    await expect(panelPage.locator('select').first()).toHaveValue(/window:/);

    await appPage.evaluate(() => {
      return (window as unknown as { roughcut: RoughcutApi }).roughcut.closeRecordingPanel();
    });

    await appPage.evaluate(async () => {
      const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
      await api.recordingConfigUpdate({ recordMode: 'region' });
    });

    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          const stores = (
            window as unknown as {
              __roughcutStores?: {
                recordingConfig?: {
                  getState: () => {
                    recordMode: string;
                    selectedSourceId: string | null;
                  };
                };
              };
            }
          ).__roughcutStores;
          return stores?.recordingConfig?.getState() ?? null;
        }),
      )
      .toMatchObject({
        recordMode: 'region',
        selectedSourceId: expect.stringMatching(/^screen:/),
      });
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
