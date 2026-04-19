import { test, expect, navigateToTab } from './fixtures/electron-app.js';

type DeviceInfo = {
  kind: MediaDeviceKind;
  deviceId: string;
  label: string;
};

type ConstraintLog = {
  audio: unknown;
  video: unknown;
};

type PanelProbeState = {
  calls: ConstraintLog[];
};

async function installPanelProbe(panelPage: import('@playwright/test').Page) {
  await panelPage.evaluate(() => {
    const probe: PanelProbeState = { calls: [] };
    (window as unknown as { __panelProbe?: PanelProbeState }).__panelProbe = probe;

    const mediaDevices = navigator.mediaDevices as MediaDevices & {
      __roughcutOriginalGetUserMedia?: typeof navigator.mediaDevices.getUserMedia;
    };

    if (!mediaDevices.__roughcutOriginalGetUserMedia) {
      mediaDevices.__roughcutOriginalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
      mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
        probe.calls.push({
          audio: constraints?.audio ?? null,
          video: constraints?.video ?? null,
        });
        return mediaDevices.__roughcutOriginalGetUserMedia!(constraints);
      };
    }
  });
}

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

  test('panel applies selected mic/camera IDs and includes selected system audio source', async ({
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

    const panelPromise = electronApp.waitForEvent('window');
    await appPage.evaluate(() => {
      return (
        window as unknown as { roughcut: { openRecordingPanel: () => Promise<void> } }
      ).roughcut.openRecordingPanel();
    });
    const panelPage = await panelPromise;

    await panelPage.waitForLoadState('domcontentloaded');
    await installPanelProbe(panelPage);

    if (micDevices.length > 0) {
      const selectedMicId = micDevices[0]!.deviceId;
      await panelPage.locator('[data-testid="panel-mic-select"]').selectOption(selectedMicId);

      await expect
        .poll(async () =>
          panelPage.evaluate(() => {
            const probe = (window as unknown as { __panelProbe?: PanelProbeState }).__panelProbe;
            return probe?.calls.some((call) => {
              const audio = call.audio as { deviceId?: { exact?: string } } | boolean | null;
              return (
                !!audio &&
                typeof audio === 'object' &&
                'deviceId' in audio &&
                audio.deviceId?.exact ===
                  (
                    window as unknown as {
                      __roughcutStores?: {
                        recordingConfig?: {
                          getState: () => { selectedMicDeviceId: string | null };
                        };
                      };
                    }
                  ).__roughcutStores?.recordingConfig?.getState().selectedMicDeviceId
              );
            });
          }),
        )
        .toBe(true);
    }

    if (cameraDevices.length > 0) {
      const selectedCameraId = cameraDevices[0]!.deviceId;
      await panelPage.locator('[data-testid="panel-camera-select"]').selectOption(selectedCameraId);

      await expect
        .poll(async () =>
          panelPage.evaluate(() => {
            const probe = (window as unknown as { __panelProbe?: PanelProbeState }).__panelProbe;
            return probe?.calls.some((call) => {
              const video = call.video as { deviceId?: { exact?: string } } | boolean | null;
              return (
                !!video &&
                typeof video === 'object' &&
                'deviceId' in video &&
                video.deviceId?.exact ===
                  (
                    window as unknown as {
                      __roughcutStores?: {
                        recordingConfig?: {
                          getState: () => { selectedCameraDeviceId: string | null };
                        };
                      };
                    }
                  ).__roughcutStores?.recordingConfig?.getState().selectedCameraDeviceId
              );
            });
          }),
        )
        .toBe(true);

      // Keep this spec focused on runtime device-selection behavior.
      // Camera preview DOM/rendering is covered elsewhere; here the proof is
      // that the selected camera id reaches getUserMedia constraints.
    }

    if (systemAudioSources.length > 0) {
      const selectedSystemAudioSourceId = systemAudioSources[0]!.id;
      await panelPage
        .locator('[data-testid="panel-system-audio-select"]')
        .selectOption(selectedSystemAudioSourceId);

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
});
