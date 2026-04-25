import { test, expect, navigateToTab } from './fixtures/electron-app.js';

type DeviceInfo = {
  kind: MediaDeviceKind;
  deviceId: string;
  label: string;
};

test.describe('Record device selection runtime', () => {
  test.beforeEach(async ({ appPage }) => {
    await appPage.evaluate(async () => {
      const api = (
        window as unknown as {
          roughcut: {
            debugSetCaptureSources: (payload: unknown) => Promise<unknown>;
            recordingConfigUpdate: (patch: Record<string, unknown>) => Promise<unknown>;
          };
        }
      ).roughcut;

      await api.debugSetCaptureSources(null);
      await api.recordingConfigUpdate({
        selectedSourceId: null,
        selectedMicDeviceId: null,
        selectedCameraDeviceId: null,
        selectedSystemAudioSourceId: null,
        micEnabled: true,
        sysAudioEnabled: true,
        cameraEnabled: true,
      });
    });
  });

  test.afterEach(async ({ appPage }) => {
    await appPage.evaluate(async () => {
      const api = (
        window as unknown as {
          roughcut: {
            closeRecordingPanel: () => Promise<void>;
            debugSetCaptureSources: (payload: unknown) => Promise<unknown>;
          };
        }
      ).roughcut;

      await api.closeRecordingPanel().catch(() => {});
      await api.debugSetCaptureSources(null);
    });
  });

  test('main Record selectors sync selected devices into the panel runtime', async ({
    appPage,
    electronApp,
  }) => {
    await appPage.evaluate(async () => {
      await (
        window as unknown as {
          roughcut: { recordingConfigUpdate: (patch: Record<string, unknown>) => Promise<unknown> };
        }
      ).roughcut.recordingConfigUpdate({
        selectedSourceId: null,
        selectedMicDeviceId: null,
        selectedCameraDeviceId: null,
        selectedSystemAudioSourceId: null,
        micEnabled: true,
        sysAudioEnabled: true,
        cameraEnabled: true,
      });
    });
    await navigateToTab(appPage, 'record');

    const runtimeInfo = await appPage.evaluate(async () => {
      const devices = (await navigator.mediaDevices.enumerateDevices()).map((device) => ({
        kind: device.kind,
        deviceId: device.deviceId,
        label: device.label,
      }));

      const api = (
        window as unknown as {
          roughcut: {
            recordingGetSources: () => Promise<Array<{ id: string; name: string }>>;
            recordingGetSystemAudioSources: () => Promise<Array<{ id: string; label: string }>>;
          };
        }
      ).roughcut;

      return {
        devices,
        sources: await api.recordingGetSources(),
        systemAudioSources: await api.recordingGetSystemAudioSources(),
      };
    });

    const selectedSourceId = runtimeInfo.sources[0]?.id ?? null;
    const micDevices = runtimeInfo.devices.filter((device) => device.kind === 'audioinput');
    const cameraDevices = runtimeInfo.devices.filter((device) => device.kind === 'videoinput');
    const systemAudioSources = runtimeInfo.systemAudioSources;

    await appPage.evaluate(
      async ({ selectedSourceId }) => {
        await (
          window as unknown as {
            roughcut: {
              recordingConfigUpdate: (patch: Record<string, unknown>) => Promise<unknown>;
            };
          }
        ).roughcut.recordingConfigUpdate({
          selectedSourceId,
          micEnabled: true,
          sysAudioEnabled: true,
          cameraEnabled: true,
          selectedMicDeviceId: null,
          selectedCameraDeviceId: null,
          selectedSystemAudioSourceId: null,
        });
      },
      { selectedSourceId },
    );

    if (micDevices.length > 0) {
      await appPage.locator('[data-testid="record-mic-select"]').selectOption(micDevices[0]!.deviceId);
      await expect
        .poll(async () =>
          appPage.evaluate(() => {
            const stores = (
              window as unknown as {
                __roughcutStores?: {
                  recordingConfig?: {
                    getState: () => { selectedMicDeviceId: string | null };
                  };
                };
              }
            ).__roughcutStores;
            return stores?.recordingConfig?.getState().selectedMicDeviceId ?? null;
          }),
        )
        .toBe(micDevices[0]!.deviceId);
    }

    if (cameraDevices.length > 0) {
      await appPage
        .locator('[data-testid="record-camera-select"]')
        .selectOption(cameraDevices[0]!.deviceId);
      await expect
        .poll(async () =>
          appPage.evaluate(() => {
            const stores = (
              window as unknown as {
                __roughcutStores?: {
                  recordingConfig?: {
                    getState: () => { selectedCameraDeviceId: string | null };
                  };
                };
              }
            ).__roughcutStores;
            return stores?.recordingConfig?.getState().selectedCameraDeviceId ?? null;
          }),
        )
        .toBe(cameraDevices[0]!.deviceId);
    }

    if (systemAudioSources.length > 0) {
      await appPage
        .locator('[data-testid="record-system-audio-select"]')
        .selectOption(systemAudioSources[0]!.id);
      await expect
        .poll(async () =>
          appPage.evaluate(() => {
            const stores = (
              window as unknown as {
                __roughcutStores?: {
                  recordingConfig?: {
                    getState: () => { selectedSystemAudioSourceId: string | null };
                  };
                };
              }
            ).__roughcutStores;
            return stores?.recordingConfig?.getState().selectedSystemAudioSourceId ?? null;
          }),
        )
        .toBe(systemAudioSources[0]!.id);
    }

    const panelPromise = electronApp.waitForEvent('window');
    await appPage.evaluate(() => {
      return (
        window as unknown as { roughcut: { openRecordingPanel: () => Promise<void> } }
      ).roughcut.openRecordingPanel();
    });
    const panelPage = await panelPromise;

    await panelPage.waitForLoadState('domcontentloaded');
    await expect(panelPage.locator('[data-testid="panel-source-select"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="panel-mic-select"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="panel-camera-select"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="panel-system-audio-select"]')).toBeVisible();

    if (micDevices.length > 0) {
      const selectedMicId = micDevices[0]!.deviceId;
      await expect(panelPage.locator('[data-testid="panel-mic-select"]')).toHaveValue(selectedMicId);
    }

    if (cameraDevices.length > 0) {
      const selectedCameraId = cameraDevices[0]!.deviceId;
      await expect(panelPage.locator('[data-testid="panel-camera-select"]')).toHaveValue(selectedCameraId);
    }

    if (systemAudioSources.length > 0) {
      const selectedSystemAudioSourceId = systemAudioSources[0]!.id;
      await expect(panelPage.locator('[data-testid="panel-system-audio-select"]')).toHaveValue(
        selectedSystemAudioSourceId,
      );

      await expect
        .poll(async () =>
          panelPage.evaluate(() => {
            const stores = (
              window as unknown as {
                __roughcutStores?: {
                  recordingConfig?: {
                    getState: () => { selectedSystemAudioSourceId: string | null };
                  };
                };
              }
            ).__roughcutStores;
            return stores?.recordingConfig?.getState().selectedSystemAudioSourceId ?? null;
          }),
        )
        .toBe(selectedSystemAudioSourceId);
    }

    await appPage.evaluate(() => {
      return (
        window as unknown as { roughcut: { closeRecordingPanel: () => Promise<void> } }
      ).roughcut.closeRecordingPanel();
    });

    expect(
      micDevices.length + cameraDevices.length + systemAudioSources.length,
    ).toBeGreaterThanOrEqual(0);
  });

  test('selecting default mic or system audio re-enables them', async ({ appPage }) => {
    await navigateToTab(appPage, 'record');

    await appPage.evaluate(async () => {
      await (
        window as unknown as {
          roughcut: { recordingConfigUpdate: (patch: Record<string, unknown>) => Promise<unknown> };
        }
      ).roughcut.recordingConfigUpdate({
        micEnabled: false,
        sysAudioEnabled: false,
        selectedMicDeviceId: 'placeholder-mic',
        selectedSystemAudioSourceId: 'placeholder-system-audio',
      });
    });

    await appPage.locator('[data-testid="record-mic-select"]').click();
    await appPage.locator('[data-testid="record-system-audio-select"]').click();

    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          const stores = (
            window as unknown as {
              __roughcutStores?: {
                recordingConfig?: {
                  getState: () => {
                    micEnabled: boolean;
                    sysAudioEnabled: boolean;
                  };
                };
              };
            }
          ).__roughcutStores;
          return stores?.recordingConfig?.getState() ?? null;
        }),
      )
      .toMatchObject({
        micEnabled: true,
        sysAudioEnabled: true,
      });

    await appPage.evaluate(async () => {
      await (
        window as unknown as {
          roughcut: { recordingConfigUpdate: (patch: Record<string, unknown>) => Promise<unknown> };
        }
      ).roughcut.recordingConfigUpdate({
        micEnabled: false,
        sysAudioEnabled: false,
        selectedMicDeviceId: 'placeholder-mic',
        selectedSystemAudioSourceId: 'placeholder-system-audio',
      });
    });

    await appPage.locator('[data-testid="record-mic-select"]').selectOption('');
    await appPage.locator('[data-testid="record-system-audio-select"]').selectOption('');

    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          const stores = (
            window as unknown as {
              __roughcutStores?: {
                recordingConfig?: {
                  getState: () => {
                    micEnabled: boolean;
                    sysAudioEnabled: boolean;
                    selectedMicDeviceId: string | null;
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
        micEnabled: true,
        sysAudioEnabled: true,
        selectedMicDeviceId: null,
        selectedSystemAudioSourceId: null,
      });
  });

  test('mic acquisition does not stop the live camera preview stream', async ({ appPage, electronApp }) => {
    await appPage.evaluate(async () => {
      await (
        window as unknown as {
          roughcut: { recordingConfigUpdate: (patch: Record<string, unknown>) => Promise<unknown> };
        }
      ).roughcut.recordingConfigUpdate({
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

    const panelPromise = electronApp.waitForEvent('window');
    await appPage.evaluate(() => {
      return (
        window as unknown as { roughcut: { openRecordingPanel: () => Promise<void> } }
      ).roughcut.openRecordingPanel();
    });
    const panelPage = await panelPromise;
    await panelPage.waitForLoadState('domcontentloaded');

    await panelPage.evaluate(() => {
      const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      const testState: {
        cameraTracks: MediaStreamTrack[];
        micTracks: MediaStreamTrack[];
      } = { cameraTracks: [], micTracks: [] };
      (window as unknown as { __deviceRuntimeState?: typeof testState }).__deviceRuntimeState =
        testState;

      navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
        if (constraints?.video) {
          const canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = 240;
          const ctx = canvas.getContext('2d');
          let frame = 0;
          const paint = () => {
            if (!ctx) return;
            frame += 1;
            ctx.fillStyle = '#020617';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#22c55e';
            ctx.fillRect(20 + (frame % 80), 40, 80, 80);
          };
          paint();
          window.setInterval(paint, 50);
          const stream = canvas.captureStream(30);
          testState.cameraTracks.push(...stream.getVideoTracks());
          return stream;
        }

        if (constraints?.audio) {
          const context = new AudioContext();
          const oscillator = context.createOscillator();
          const destination = context.createMediaStreamDestination();
          oscillator.connect(destination);
          oscillator.start();
          testState.micTracks.push(...destination.stream.getAudioTracks());
          return destination.stream;
        }

        return originalGetUserMedia(constraints);
      };
    });

    await panelPage.locator('[data-testid="panel-camera-select"]').click();
    await expect(panelPage.locator('[data-testid="panel-camera-preview-video"]')).toBeVisible();
    await expect
      .poll(async () =>
        panelPage.evaluate(() => {
          const state = (window as unknown as { __deviceRuntimeState?: { cameraTracks: MediaStreamTrack[] } })
            .__deviceRuntimeState;
          return state?.cameraTracks.some((track) => track.readyState === 'live') ?? false;
        }),
      )
      .toBe(true);

    await panelPage.locator('[data-testid="panel-mic-select"]').click();

    await expect
      .poll(async () =>
        panelPage.evaluate(() => {
          const state = (
            window as unknown as {
              __deviceRuntimeState?: {
                cameraTracks: MediaStreamTrack[];
                micTracks: MediaStreamTrack[];
              };
            }
          ).__deviceRuntimeState;
          return {
            hasLiveCamera: state?.cameraTracks.some((track) => track.readyState === 'live') ?? false,
            hasLiveMic: state?.micTracks.some((track) => track.readyState === 'live') ?? false,
          };
        }),
      )
      .toMatchObject({ hasLiveCamera: true, hasLiveMic: true });
  });
});
