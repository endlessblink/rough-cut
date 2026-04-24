import { test, expect, navigateToTab } from './fixtures/electron-app.js';

type RoughcutApi = {
  recordingGetSources: () => Promise<Array<{ id: string; type: 'screen' | 'window' }>>;
  recordingConfigUpdate: (patch: Record<string, unknown>) => Promise<unknown>;
  debugSetCaptureSources: (
    payload: Array<{
      id: string;
      name: string;
      type: 'screen' | 'window';
      displayId: string | null;
      thumbnailDataUrl: string;
    }> | null,
  ) => Promise<unknown>;
};

test.describe('Record source gating', () => {
  test.beforeEach(async ({ appPage }) => {
    await appPage.evaluate(async () => {
      const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
      await api.debugSetCaptureSources(null);
      await api.recordingConfigUpdate({
        recordMode: 'fullscreen',
        selectedSourceId: null,
        selectedMicDeviceId: null,
        selectedCameraDeviceId: null,
        selectedSystemAudioSourceId: null,
        micEnabled: false,
        sysAudioEnabled: false,
        cameraEnabled: false,
      });
    });

    await navigateToTab(appPage, 'record');
  });

  test.afterEach(async ({ appPage }) => {
    await appPage.evaluate(async () => {
      const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
      await api.debugSetCaptureSources(null);
    });
  });

  test('auto-refreshes sources and shows gating when every capture source disappears', async ({
    appPage,
  }) => {
    await appPage.evaluate(async () => {
      const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
      const sources = await api.recordingGetSources();
      const screenSourceId = sources.find((source) => source.type === 'screen')?.id ?? null;
      await api.recordingConfigUpdate({ selectedSourceId: screenSourceId });
      await api.debugSetCaptureSources([]);
      window.dispatchEvent(new Event('focus'));
    });

    await expect(appPage.locator('[data-testid="record-source-recovery-banner"]')).toBeVisible();
    await expect(appPage.locator('[data-testid="record-source-recovery-banner"]')).toContainText(
      'no capture sources are currently available',
    );
    await expect(appPage.locator('[data-testid="record-preview-status"]')).toHaveAttribute(
      'data-preview-state',
      'lost',
    );
    await expect(appPage.locator('[data-testid="btn-record"]')).toBeEnabled();

    await appPage.evaluate(async () => {
      const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
      await api.debugSetCaptureSources(null);
      window.dispatchEvent(new Event('focus'));
    });
  });

  test('record mode switches clear incompatible capture source and gate REC', async ({
    appPage,
    electronApp,
  }) => {
    const initialScreenSourceId = 'screen:debug-screen:0';
    const initialWindowSourceId = 'window:debug-window:0';

    await appPage.evaluate(async () => {
      const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
      const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      const stubStream = document.createElement('canvas').captureStream(1);
      navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
        const mandatory = (constraints?.video as { mandatory?: { chromeMediaSource?: string } })
          ?.mandatory;
        if (mandatory?.chromeMediaSource === 'desktop') {
          return stubStream;
        }
        return originalGetUserMedia(constraints);
      };

      await api.debugSetCaptureSources([
        {
          id: 'screen:debug-screen:0',
          name: 'Debug Screen',
          type: 'screen',
          displayId: 'debug-display',
          thumbnailDataUrl: '',
        },
        {
          id: 'window:debug-window:0',
          name: 'Debug Window',
          type: 'window',
          displayId: null,
          thumbnailDataUrl: '',
        },
      ]);

      window.dispatchEvent(new Event('focus'));
    });

    await navigateToTab(appPage, 'projects');
    await navigateToTab(appPage, 'record');

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

    const recordButton = appPage.locator('[data-testid="btn-record"]');
    await expect.poll(async () => recordButton.isEnabled()).toBe(true);

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
        selectedSourceId: null,
      });

    await expect.poll(async () => recordButton.isEnabled()).toBe(true);
    await expect(recordButton).toHaveAttribute(
      'title',
      'Open the recording panel to choose a window before recording.',
    );

    await appPage.locator('[data-testid="record-open-setup-panel"]').click();
    await expect
      .poll(async () =>
        (await electronApp.windows()).some((page) => page !== appPage && !page.isClosed()),
      )
      .toBe(true);
    const panelPage = (await electronApp.windows()).find(
      (page) => page !== appPage && !page.isClosed(),
    );
    expect(panelPage, 'Expected recording panel window').toBeTruthy();
    await panelPage!.waitForLoadState('domcontentloaded');
    await expect(panelPage!.getByRole('button', { name: 'Region' })).toHaveCount(0);
    await panelPage!
      .locator('[data-testid="panel-source-select"]')
      .selectOption({ label: 'Debug Window' });

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
        selectedSourceId: initialWindowSourceId,
      });

    await expect.poll(async () => recordButton.isEnabled()).toBe(true);

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
        recordMode: 'fullscreen',
        selectedSourceId: initialScreenSourceId,
      });

    await expect(recordButton).toBeEnabled();

    await appPage.locator('[data-testid="record-open-setup-panel"]').click();
    await expect
      .poll(async () =>
        (await electronApp.windows()).some((page) => page !== appPage && !page.isClosed()),
      )
      .toBe(true);
    const secondPanelPage = (await electronApp.windows()).find(
      (page) => page !== appPage && !page.isClosed(),
    );
    expect(secondPanelPage, 'Expected recording panel window').toBeTruthy();
    await secondPanelPage!.waitForLoadState('domcontentloaded');
    await secondPanelPage!.locator('[data-testid="panel-source-select"]').selectOption({
      label: 'Debug Screen',
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
        recordMode: 'fullscreen',
        selectedSourceId: initialScreenSourceId,
      });
  });
});
