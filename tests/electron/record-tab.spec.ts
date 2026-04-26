import { test, expect, navigateToTab } from './fixtures/electron-app.js';
import { loadZoomFixture } from './fixtures/zoom-fixture.js';

type RoughcutApi = {
  recordingGetSources: () => Promise<Array<{ id: string; type: 'screen' | 'window' }>>;
  recordingConfigUpdate: (patch: Record<string, unknown>) => Promise<unknown>;
  openRecordingPanel: () => Promise<void>;
  closeRecordingPanel: () => Promise<void>;
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

type DeviceSelectionSnapshot = {
  selectedMicDeviceId: string | null;
  selectedCameraDeviceId: string | null;
  selectedSystemAudioSourceId: string | null;
};

async function chooseRecordSource(
  appPage: import('@playwright/test').Page,
  electronApp: import('@playwright/test').ElectronApplication,
  sourceName: string,
): Promise<void> {
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
  await expect(panelPage!.locator('[data-testid="panel-source-select"]')).toBeVisible();
  await panelPage!
    .locator('[data-testid="panel-source-select"]')
    .selectOption({ label: sourceName });
}

async function getAvailableDeviceSelections(appPage: import('@playwright/test').Page) {
  return appPage.evaluate(async () => {
    const devices = await (navigator.mediaDevices?.enumerateDevices?.() ?? Promise.resolve([]));
    const systemAudioSources = await (
      window as unknown as {
        roughcut: { recordingGetSystemAudioSources: () => Promise<Array<{ id: string }>> };
      }
    ).roughcut.recordingGetSystemAudioSources();

    return {
      selectedMicDeviceId: devices.find((device) => device.kind === 'audioinput')?.deviceId ?? null,
      selectedCameraDeviceId:
        devices.find((device) => device.kind === 'videoinput')?.deviceId ?? null,
      selectedSystemAudioSourceId: systemAudioSources[0]?.id ?? null,
    };
  });
}

test.describe('Record tab', () => {
  test.beforeEach(async ({ appPage }) => {
    await appPage.evaluate(async () => {
      const api = (
        window as unknown as {
          roughcut: {
            recordingConfigUpdate: (patch: Record<string, unknown>) => Promise<unknown>;
            debugSetCaptureSources: (payload: unknown) => Promise<unknown>;
          };
        }
      ).roughcut;

      await api.debugSetCaptureSources(null);
      await api.recordingConfigUpdate({
        recordMode: 'fullscreen',
        selectedSourceId: null,
        selectedMicDeviceId: null,
        selectedCameraDeviceId: null,
        selectedSystemAudioSourceId: null,
        micEnabled: true,
        sysAudioEnabled: true,
        cameraEnabled: true,
        countdownSeconds: 3,
      });
    });
    await navigateToTab(appPage, 'record');
  });

  test('renders the record tab root', async ({ appPage }) => {
    await expect(appPage.locator('[data-testid="record-tab-root"]')).toBeVisible();
  });

  test('wires in-app preflight diagnostics and permission deep links', async ({ appPage }) => {
    await appPage.evaluate(async () => {
      const roughcut = (window as unknown as { roughcut: Record<string, any> }).roughcut;

      await roughcut.debugSetRecordingPreflightStatus({
        platform: 'darwin',
        requiresFullRelaunch: true,
        screenCapture: {
          status: 'attention',
          detail: 'Screen Recording permission is still blocked.',
          canOpenSettings: true,
        },
        microphone: {
          status: 'granted',
          detail: 'Ready.',
          canOpenSettings: true,
        },
        camera: {
          status: 'not-required',
          detail: 'Camera is optional for this test.',
          canOpenSettings: false,
        },
      });
      await roughcut.debugSetRecordingPermissionSettingsResult({
        screenCapture: {
          opened: true,
          requiresFullRelaunch: true,
          message: 'Opened screenCapture',
        },
      });

      const originalEnumerateDevices = navigator.mediaDevices.enumerateDevices.bind(
        navigator.mediaDevices,
      );
      navigator.mediaDevices.enumerateDevices = async () => [
        { kind: 'audioinput', deviceId: 'mic-1', label: 'Mic 1', groupId: 'g1' },
        { kind: 'videoinput', deviceId: 'cam-1', label: 'Cam 1', groupId: 'g2' },
      ] as MediaDeviceInfo[];

      (window as unknown as { __task143Cleanup?: () => Promise<void> }).__task143Cleanup = async () => {
        navigator.mediaDevices.enumerateDevices = originalEnumerateDevices;
        await roughcut.debugSetRecordingPreflightStatus(null);
        await roughcut.debugSetRecordingPermissionSettingsResult(null);
      };
    });

    await expect(appPage.locator('[data-testid="record-preflight-card"]')).toBeVisible();
    await expect(appPage.locator('[data-testid="record-preflight-card"]')).toContainText(
      'Recording preflight',
    );

    await appPage.locator('[data-testid="record-preflight-run"]').click();
    await expect(appPage.locator('[data-testid="record-preflight-card"]')).toContainText(
      'Screen Recording permission is still blocked.',
    );
    await expect(appPage.locator('[data-testid="record-preflight-runtime"]')).toBeVisible();

    await appPage.locator('[data-testid="record-preflight-open-screenCapture"]').click();
    await expect(appPage.getByRole('alert').filter({ hasText: 'Opened screenCapture' })).toBeVisible();
    await expect(appPage.getByRole('alert').filter({ hasText: 'Relaunch required' })).toBeVisible();

    await appPage.evaluate(async () => {
      await (window as unknown as { __task143Cleanup?: () => Promise<void> }).__task143Cleanup?.();
    });
  });

  test('shows the zoom-to-cursor control in the zoom panel', async ({ appPage }) => {
    await loadZoomFixture(appPage, { preserveCursorEvents: true });

    const recordRoot = appPage.locator('[data-testid="record-tab-root"]');
    const zoomRailItem = recordRoot.locator(
      '[data-testid="inspector-rail-item"][data-category="zoom"]',
    );
    await expect(zoomRailItem).toBeVisible();
    await zoomRailItem.evaluate((element) => {
      (element as HTMLButtonElement).click();
    });

    await expect(recordRoot.getByText('Zoom to cursor')).toBeVisible();
    await expect(
      recordRoot.getByText('Keeps the active zoom framing attached to the mouse'),
    ).toBeVisible();
  });

  test('shows the record button', async ({ appPage }) => {
    await expect(appPage.locator('[data-testid="btn-record"]')).toBeVisible();
  });

  test('shows fear-reducing recording affordances before the first take', async ({ appPage }) => {
    const banner = appPage.locator('[data-testid="record-confidence-banner"]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Do Not Disturb');
    await expect(banner).toContainText('5-second test clip');
    await expect(banner).toContainText('Stop saves the take');
  });

  test('record button opens the pre-recording panel', async ({ appPage, electronApp }) => {
    const panelPromise = electronApp.waitForEvent('window');
    await appPage.locator('[data-testid="btn-record"]').click();
    const panelPage = await panelPromise;
    await expect(panelPage.locator('[data-testid="panel-source-select"]')).toBeVisible();
  });

  test('record button reuses the existing pre-recording panel', async ({ appPage, electronApp }) => {
    const firstPanelPromise = electronApp.waitForEvent('window');
    await appPage.locator('[data-testid="btn-record"]').click();
    const firstPanelPage = await firstPanelPromise;
    await expect(firstPanelPage.locator('[data-testid="panel-source-select"]')).toBeVisible();

    await appPage.locator('[data-testid="btn-record"]').click();
    const panelPages = (await electronApp.windows()).filter(
      (page) => page !== appPage && !page.isClosed(),
    );
    expect(panelPages).toHaveLength(1);
    await expect(panelPages[0]!.locator('[data-testid="panel-source-select"]')).toBeVisible();
  });

  test('record button opens a fresh pre-recording panel after close', async ({
    appPage,
    electronApp,
  }) => {
    const firstPanelPromise = electronApp.waitForEvent('window');
    await appPage.locator('[data-testid="btn-record"]').click();
    const firstPanelPage = await firstPanelPromise;
    await expect(firstPanelPage.locator('[data-testid="panel-source-select"]')).toBeVisible();

    const closePromise = firstPanelPage.waitForEvent('close');
    await firstPanelPage
      .locator('button[aria-label="Close recording panel"]')
      .click()
      .catch(() => {});
    await closePromise;

    const secondPanelPromise = electronApp.waitForEvent('window');
    await appPage.locator('[data-testid="btn-record"]').click();
    const secondPanelPage = await secondPanelPromise;
    await expect(secondPanelPage.locator('[data-testid="panel-source-select"]')).toBeVisible();
  });

  test('panel surfaces DND, test-clip, and safe-stop affordances', async ({
    appPage,
    electronApp,
  }) => {
    const panelPromise = electronApp.waitForEvent('window');
    await appPage.locator('[data-testid="record-open-setup-panel"]').click();
    const panelPage = await panelPromise;
    await panelPage.waitForLoadState('domcontentloaded');

    const affordances = panelPage.locator('[data-testid="panel-confidence-affordances"]');
    await expect(affordances).toBeVisible();
    await expect(affordances).toContainText('Do Not Disturb');
    await expect(affordances).toContainText('5-second');
    await expect(affordances).toContainText('Stop safely saves the take');
    await expect(panelPage.locator('[data-testid="panel-start-test-clip"]')).toBeVisible();

    await appPage.evaluate(async () => {
      await (window as unknown as { roughcut: { closeRecordingPanel: () => Promise<void> } }).roughcut.closeRecordingPanel();
    });
  });

  test('renders the live camera stream inside the Record PiP frame before recording', async ({
    appPage,
  }) => {
    await appPage.evaluate(async () => {
      await (
        window as unknown as {
          roughcut: { recordingConfigUpdate: (patch: Record<string, unknown>) => Promise<unknown> };
        }
      ).roughcut.recordingConfigUpdate({ cameraEnabled: false, selectedCameraDeviceId: null });

      const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      const previewState = { tracks: [] as MediaStreamTrack[] };
      (window as unknown as { __recordTabCameraPreviewState?: typeof previewState }).__recordTabCameraPreviewState =
        previewState;

      navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
        if (constraints?.video && !constraints?.audio) {
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 480;
          const ctx = canvas.getContext('2d');
          let frame = 0;
          const paint = () => {
            if (!ctx) return;
            frame += 1;
            ctx.fillStyle = '#111827';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#fb7185';
            ctx.fillRect(48 + (frame % 120), 80, 144, 144);
          };
          paint();
          window.setInterval(paint, 50);
          const stream = canvas.captureStream(30);
          previewState.tracks.push(...stream.getVideoTracks());
          return stream;
        }

        return originalGetUserMedia(constraints);
      };
    });

    await appPage.evaluate(async () => {
      await (
        window as unknown as {
          roughcut: { recordingConfigUpdate: (patch: Record<string, unknown>) => Promise<unknown> };
        }
      ).roughcut.recordingConfigUpdate({ cameraEnabled: true, selectedCameraDeviceId: null });
    });

    await expect(appPage.locator('[data-testid="record-camera-frame"]')).toBeVisible();
    await expect(appPage.locator('[data-testid="record-live-camera-video"]')).toBeVisible();
    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          const video = document.querySelector(
            '[data-testid="record-live-camera-video"]',
          ) as HTMLVideoElement | null;
          const previewState = (
            window as unknown as {
              __recordTabCameraPreviewState?: { tracks: MediaStreamTrack[] };
            }
          ).__recordTabCameraPreviewState;
          return {
            isReady: (video?.readyState ?? 0) >= HTMLMediaElement.HAVE_CURRENT_DATA,
            hasSrcObject: Boolean(video?.srcObject),
            hasLiveTrack: previewState?.tracks.some((track) => track.readyState === 'live') ?? false,
          };
        }),
      )
      .toMatchObject({ isReady: true, hasSrcObject: true, hasLiveTrack: true });
  });

  test('record controls update the shared recording config store', async ({ appPage }) => {
    const deviceSelections = await getAvailableDeviceSelections(appPage);

    await appPage.evaluate(
      async ({ deviceSelections }) => {
        await (
          window as unknown as {
            roughcut: {
              recordingConfigUpdate: (patch: Record<string, unknown>) => Promise<unknown>;
            };
          }
        ).roughcut.recordingConfigUpdate({
          recordMode: 'window',
          micEnabled: false,
          sysAudioEnabled: false,
          cameraEnabled: false,
          countdownSeconds: 5,
          ...deviceSelections,
        });
      },
      { deviceSelections },
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
                    micEnabled: boolean;
                    sysAudioEnabled: boolean;
                    cameraEnabled: boolean;
                    countdownSeconds: number;
                    selectedMicDeviceId: string | null;
                    selectedCameraDeviceId: string | null;
                    selectedSystemAudioSourceId: string | null;
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
        ...deviceSelections,
      });
  });

  test('countdown controls update inline without opening the recording panel', async ({
    appPage,
    electronApp,
  }) => {
    await expect(appPage.locator('[data-testid="countdown-config"]')).toBeVisible();

    const windowCountBefore = electronApp.windows().length;
    await appPage.locator('[data-testid="countdown-option-10"]').click();

    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          const stores = (
            window as unknown as {
              __roughcutStores?: {
                recordingConfig?: {
                  getState: () => { countdownSeconds: number };
                };
              };
            }
          ).__roughcutStores;
          return stores?.recordingConfig?.getState().countdownSeconds ?? null;
        }),
      )
      .toBe(10);

    expect(electronApp.windows().length).toBe(windowCountBefore);
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
    });

    await navigateToTab(appPage, 'projects');
    await navigateToTab(appPage, 'record');

    await expect
      .poll(async () =>
        appPage.evaluate(async () => {
          const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
          const sources = await api.recordingGetSources();
          return sources.map((source) => source.id);
        }),
      )
      .toContain(initialScreenSourceId);

    await chooseRecordSource(appPage, electronApp, 'Debug Screen');

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
    const firstPanelPage = (await electronApp.windows()).find(
      (page) => page !== appPage && !page.isClosed(),
    );
    expect(firstPanelPage, 'Expected recording panel window').toBeTruthy();
    await firstPanelPage!.waitForLoadState('domcontentloaded');
    await firstPanelPage!.locator('[data-testid="panel-source-select"]').selectOption({
      label: 'Debug Window',
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

    await appPage.evaluate(async () => {
      const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
      await api.debugSetCaptureSources(null);
    });
  });

  test('debug capture source override keeps the Record tab alive', async ({ appPage }) => {
    await appPage.evaluate(async () => {
      const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
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
    });

    await expect(appPage.locator('[data-testid="btn-record"]')).toBeVisible();

    await appPage.evaluate(async () => {
      const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
      await api.recordingConfigUpdate({ recordMode: 'window' });
      await api.debugSetCaptureSources(null);
    });

    await expect(appPage.locator('[data-testid="btn-record"]')).toBeVisible();
  });

  test('camera layout snapshots change the preview by playhead position', async ({ appPage }) => {
    await loadZoomFixture(appPage);
    const snapshotFrame = 37;

    const cameraFrame = appPage.locator('[data-testid="record-camera-frame"]');

    const readSize = async () =>
      cameraFrame.evaluate((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });

    const readRect = async () =>
      cameraFrame.evaluate((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      });

    const base = await readSize();
    await appPage.evaluate(
      ({ snapshotFrame }) => {
        const stores = (
          window as unknown as {
            __roughcutStores?: {
              transport: { setState: (patch: { playheadFrame: number }) => void };
              project: {
                getState: () => {
                  activeAssetId: string | null;
                  addRecordingCameraLayoutSnapshot?: Function;
                  updateCameraPresentation: Function;
                };
              };
            };
          }
        ).__roughcutStores;
        stores?.transport.setState({ playheadFrame: snapshotFrame });
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
          state.updateCameraPresentation(state.activeAssetId, { visible: true });
        }
      },
      { snapshotFrame },
    );

    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          const stores = (
            window as unknown as {
              __roughcutStores?: {
                project: {
                  getState: () => { project: { assets: Array<any> }; activeAssetId: string | null };
                };
              };
            }
          ).__roughcutStores;
          const state = stores?.project.getState();
          const asset = state?.project.assets.find((entry) => entry.id === state.activeAssetId);
          return (asset?.presentation?.cameraLayouts ?? []).map((entry: any) => ({
            frame: entry.frame,
            visible: entry.camera?.visible ?? null,
          }));
        }),
      )
      .toContainEqual({ frame: snapshotFrame, visible: false });

    await expect
      .poll(async () =>
        appPage.locator('[data-testid="camera-layout-marker"][title*="layout @ 37"]').count(),
      )
      .toBeGreaterThan(0);

    await appPage.evaluate(() => {
      const stores = (
        window as unknown as {
          __roughcutStores?: {
            transport: { setState: (patch: { playheadFrame: number }) => void };
            project: {
              getState: () => { activeAssetId: string | null; updateCameraPresentation: Function };
            };
          };
        }
      ).__roughcutStores;
      const state = stores?.project.getState();
      if (state?.activeAssetId) {
        state.updateCameraPresentation(state.activeAssetId, { visible: true });
      }
      stores?.transport.setState({ playheadFrame: 0 });
    });
    await appPage.waitForTimeout(400);
    const atStart = await readSize();
    const atStartVisible = await appPage
      .locator('[data-testid="template-preview-root"]')
      .getAttribute('data-camera-visible');
    await expect(cameraFrame).toHaveCount(1);

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
    await appPage.waitForTimeout(400);
    const atSnapshotVisible = await appPage
      .locator('[data-testid="template-preview-root"]')
      .getAttribute('data-camera-visible');
    const atSnapshotLayoutFrame = await appPage
      .locator('[data-testid="template-preview-root"]')
      .getAttribute('data-active-layout-frame');
    const atSnapshotLayoutVisible = await appPage
      .locator('[data-testid="template-preview-root"]')
      .getAttribute('data-active-layout-visible');
    expect(atStartVisible).toBe('true');
    expect(atSnapshotLayoutFrame).toBe(String(snapshotFrame));
    expect(atSnapshotLayoutVisible).toBe('false');
    expect(atSnapshotVisible).toBe('false');
    expect(atStart.width).toBeGreaterThan(0);
    expect(base.width).toBeGreaterThan(0);
  });

  test('clicking a camera layout marker activates the Camera inspector', async ({ appPage }) => {
    await loadZoomFixture(appPage);
    const snapshotFrame = 41;

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
            };
          }
        ).__roughcutStores;
        const state = stores?.project.getState();
        if (state?.activeAssetId) {
          state.addRecordingCameraLayoutSnapshot?.(state.activeAssetId, snapshotFrame, {
            camera: {
              shape: 'rounded',
              aspectRatio: '16:9',
              position: 'corner-tl',
              roundness: 40,
              size: 100,
              visible: true,
              padding: 0,
              inset: 0,
              insetColor: '#ffffff',
              shadowEnabled: false,
              shadowBlur: 24,
              shadowOpacity: 0.45,
            },
          });
        }
      },
      { snapshotFrame },
    );

    const marker = appPage
      .locator('[data-testid="camera-layout-marker"][title*="layout @ 41"]')
      .first();
    await marker.click();

    await expect(appPage.locator('[data-testid="inspector-card-active"]')).toHaveAttribute(
      'data-category',
      'camera',
    );
    await expect(marker).toHaveAttribute('data-selected', 'true');
  });

  test('camera layout preset buttons add template-driven snapshots', async ({ appPage }) => {
    await loadZoomFixture(appPage);
    const snapshotFrame = 43;

    await appPage.locator('[data-testid="inspector-rail-item"][data-category="camera"]').click();
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

    await appPage.locator('[data-testid="camera-layout-preset-presentation"]').click();

    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          const stores = (
            window as unknown as {
              __roughcutStores?: {
                project: {
                  getState: () => { project: { assets: Array<any> }; activeAssetId: string | null };
                };
              };
            }
          ).__roughcutStores;
          const state = stores?.project.getState();
          const asset = state?.project.assets.find((entry) => entry.id === state.activeAssetId);
          return (asset?.presentation?.cameraLayouts ?? []).map((entry: any) => ({
            frame: entry.frame,
            templateId: entry.templateId ?? null,
          }));
        }),
      )
      .toContainEqual({ frame: snapshotFrame, templateId: 'presentation-16x9' });

    await expect(
      appPage.locator('[data-testid="camera-layout-marker"][title*="layout @ 43"]'),
    ).toHaveCount(1);
    await expect(
      appPage.locator('[data-testid="camera-layout-marker"] span', { hasText: 'Presentation' }),
    ).toBeVisible();
  });

  test('delete removes the selected camera layout marker', async ({ appPage }) => {
    await loadZoomFixture(appPage);
    const snapshotFrame = 47;

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
            };
          }
        ).__roughcutStores;
        const state = stores?.project.getState();
        if (state?.activeAssetId) {
          state.addRecordingCameraLayoutSnapshot?.(state.activeAssetId, snapshotFrame, {
            camera: {
              shape: 'rounded',
              aspectRatio: '16:9',
              position: 'corner-tl',
              roundness: 40,
              size: 100,
              visible: true,
              padding: 0,
              inset: 0,
              insetColor: '#ffffff',
              shadowEnabled: false,
              shadowBlur: 24,
              shadowOpacity: 0.45,
            },
          });
        }
      },
      { snapshotFrame },
    );

    const marker = appPage
      .locator('[data-testid="camera-layout-marker"][title*="layout @ 47"]')
      .first();
    await marker.click();
    await appPage.locator('[data-testid="camera-layout-delete"]').click();

    await expect
      .poll(async () =>
        appPage.locator('[data-testid="camera-layout-marker"][title*="layout @ 47"]').count(),
      )
      .toBe(0);
  });

  test('dragging a camera layout marker updates its frame', async ({ appPage }) => {
    await loadZoomFixture(appPage);
    const snapshotFrame = 52;

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
            };
          }
        ).__roughcutStores;
        const state = stores?.project.getState();
        if (state?.activeAssetId) {
          state.addRecordingCameraLayoutSnapshot?.(state.activeAssetId, snapshotFrame, {
            camera: {
              shape: 'rounded',
              aspectRatio: '16:9',
              position: 'corner-tl',
              roundness: 40,
              size: 100,
              visible: true,
              padding: 0,
              inset: 0,
              insetColor: '#ffffff',
              shadowEnabled: false,
              shadowBlur: 24,
              shadowOpacity: 0.45,
            },
          });
        }
      },
      { snapshotFrame },
    );

    const marker = appPage
      .locator('[data-testid="camera-layout-marker"][title*="layout @ 52"]')
      .first();
    const box = await marker.boundingBox();
    if (!box) throw new Error('Expected camera layout marker bounding box');

    await marker.dispatchEvent('pointerdown', {
      clientX: box.x + box.width / 2,
      clientY: box.y + box.height / 2,
    });
    await appPage.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2);
    await appPage.mouse.up();

    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          const stores = (
            window as unknown as {
              __roughcutStores?: {
                project: {
                  getState: () => { project: { assets: Array<any> }; activeAssetId: string | null };
                };
              };
            }
          ).__roughcutStores;
          const state = stores?.project.getState();
          const asset = state?.project.assets.find((entry) => entry.id === state.activeAssetId);
          return (asset?.presentation?.cameraLayouts ?? []).map((entry: any) => entry.frame);
        }),
      )
      .not.toContain(snapshotFrame);
  });

  test('preset buttons update the selected camera layout marker instead of adding a new one', async ({
    appPage,
  }) => {
    await loadZoomFixture(appPage);
    const snapshotFrame = 61;

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
            };
          }
        ).__roughcutStores;
        const state = stores?.project.getState();
        if (state?.activeAssetId) {
          state.addRecordingCameraLayoutSnapshot?.(state.activeAssetId, snapshotFrame, {
            camera: {
              shape: 'rounded',
              aspectRatio: '16:9',
              position: 'corner-tl',
              roundness: 40,
              size: 100,
              visible: true,
              padding: 0,
              inset: 0,
              insetColor: '#ffffff',
              shadowEnabled: false,
              shadowBlur: 24,
              shadowOpacity: 0.45,
            },
          });
        }
      },
      { snapshotFrame },
    );

    const marker = appPage
      .locator('[data-testid="camera-layout-marker"][title*="layout @ 61"]')
      .first();
    await marker.click();
    await appPage.locator('[data-testid="camera-layout-preset-hide"]').click();

    const layouts = await appPage.evaluate(() => {
      const stores = (
        window as unknown as {
          __roughcutStores?: {
            project: {
              getState: () => { project: { assets: Array<any> }; activeAssetId: string | null };
            };
          };
        }
      ).__roughcutStores;
      const state = stores?.project.getState();
      const asset = state?.project.assets.find((entry) => entry.id === state.activeAssetId);
      return (asset?.presentation?.cameraLayouts ?? []).filter((entry: any) => entry.frame === 61);
    });

    expect(layouts).toHaveLength(1);
    expect(layouts[0]?.camera?.visible).toBe(false);
  });

  test('camera layout changes use a smooth transition', async ({ appPage }) => {
    await loadZoomFixture(appPage);

    const transitionDuration = await appPage
      .locator('[data-testid="record-camera-frame"]')
      .evaluate((el) => getComputedStyle(el as HTMLElement).transitionDuration);

    expect(transitionDuration).not.toBe('0s');
  });

  test('captions are available in the Record inspector for the active recording', async ({
    appPage,
  }) => {
    await loadZoomFixture(appPage);

    await appPage.evaluate(() => {
      const stores = (
        window as unknown as {
          __roughcutStores?: {
            project: {
              getState: () => { activeAssetId: string | null; addCaptionSegments: Function };
            };
          };
        }
      ).__roughcutStores;
      const state = stores?.project.getState();
      if (!state?.activeAssetId) return;
      state.addCaptionSegments([
        {
          id: 'caption-seg-1',
          assetId: state.activeAssetId,
          status: 'accepted',
          confidence: 0.98,
          startFrame: 0,
          endFrame: 30,
          text: 'Hello from Record captions',
          words: [],
        },
      ]);
    });

    await appPage.evaluate(() => {
      const button = document.querySelector(
        '[data-testid="inspector-rail-item"][data-category="captions"]',
      ) as HTMLButtonElement | null;
      button?.click();
    });
    await expect(appPage.locator('[data-testid="inspector-card-active"]')).toHaveAttribute(
      'data-category',
      'captions',
    );
    await expect(
      appPage
        .locator('[data-testid="inspector-card-active"]')
        .locator('input[value="Hello from Record captions"]')
        .first(),
    ).toBeVisible();
  });

  test('Record captions panel can generate captions for the active recording', async ({
    appPage,
  }) => {
    await loadZoomFixture(appPage);

    await appPage.evaluate(() => {
      (window as any).__roughcutTestOverridesCalls = 0;
      (window as any).__roughcutTestOverrides = {
        aiGetProviderConfig: async () => ({ provider: 'groq' }),
        aiGetApiKey: async () => 'test-key',
        aiAnalyzeCaptions: async (assets: Array<{ id: string }>) => {
          (window as any).__roughcutTestOverridesCalls += 1;
          return [
            {
              id: 'caption-generated-1',
              assetId: assets[0]?.id ?? '',
              status: 'accepted',
              confidence: 0.97,
              startFrame: 0,
              endFrame: 24,
              text: 'Generated in Record',
              words: [],
            },
          ];
        },
      };
    });

    await appPage.getByRole('button', { name: 'Captions' }).click();
    await appPage.locator('[data-testid="record-captions-generate"]').click();

    await expect
      .poll(async () => appPage.evaluate(() => (window as any).__roughcutTestOverridesCalls ?? 0))
      .toBeGreaterThan(0);

    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          const stores = (
            window as unknown as {
              __roughcutStores?: {
                project: {
                  getState: () => { project: { aiAnnotations: { captionSegments: Array<any> } } };
                };
              };
            }
          ).__roughcutStores;
          return stores?.project
            .getState()
            .project.aiAnnotations.captionSegments.map((seg) => seg.text);
        }),
      )
      .toContain('Generated in Record');
  });

  test('Record captions panel updates persisted caption style', async ({ appPage }) => {
    await loadZoomFixture(appPage);

    await appPage.getByRole('button', { name: 'Captions' }).click();
    await appPage
      .locator('select')
      .filter({ has: appPage.locator('option[value="bottom"]') })
      .last()
      .selectOption('center');

    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          const stores = (
            window as unknown as {
              __roughcutStores?: {
                project: { getState: () => { project: { aiAnnotations: { captionStyle: any } } } };
              };
            }
          ).__roughcutStores;
          return stores?.project.getState().project.aiAnnotations.captionStyle ?? null;
        }),
      )
      .toMatchObject({ position: 'center' });
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
    await loadZoomFixture(appPage);

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
    await loadZoomFixture(appPage);

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
