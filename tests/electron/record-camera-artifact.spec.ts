import { test, expect, navigateToTab } from './fixtures/electron-app.js';
import { mkdtemp, rm, stat, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';

type CaptureSource = {
  id: string;
  type: 'screen' | 'window';
  name: string;
};

type RecordingResult = {
  filePath: string;
  durationFrames: number;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  fileSize: number;
  hasAudio: boolean;
  cameraFilePath?: string;
};

const DEBUG_SOURCE: CaptureSource & { displayId: string | null; thumbnailDataUrl: string } = {
  id: 'screen:camera-artifact:0',
  type: 'screen',
  name: 'Camera Artifact Debug Screen',
  displayId: 'camera-artifact-display',
  thumbnailDataUrl: '',
};

function ffprobeJson(filePath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    execFile(
      'ffprobe',
      ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      { timeout: 30_000 },
      (error, stdout) => {
        if (error) return reject(error);
        try {
          resolve(JSON.parse(stdout));
        } catch (parseError) {
          reject(parseError);
        }
      },
    );
  });
}

async function waitForRecordedResult(
  appPage: import('@playwright/test').Page,
  electronApp: import('@playwright/test').ElectronApplication,
  windowKey: string,
): Promise<RecordingResult> {
  const getResult = async () =>
    appPage.evaluate((key) => {
      return ((window as unknown as Record<string, RecordingResult | null | undefined>)[key] ??
        null) as RecordingResult | null;
    }, windowKey);

  const directResult = await expect
    .poll(getResult, { timeout: 10_000 })
    .not.toBeNull()
    .then(() => getResult())
    .catch(async () => {
      const fallback = await appPage.evaluate(() => {
        return (window as unknown as { roughcut: { debugLoadLastRecording: () => Promise<RecordingResult | null> } }).roughcut.debugLoadLastRecording();
      });
      if (!fallback) return null;
      await electronApp.evaluate(
        async ({ BrowserWindow }, payload) => {
          for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) {
              win.webContents.send('recording:asset-ready', payload);
            }
          }
        },
        fallback,
      );
      return fallback;
    });

  await expect.poll(getResult, { timeout: 30_000 }).not.toBeNull();
  return (directResult ?? (await getResult())) as RecordingResult;
}

test.describe('Record camera artifact', () => {
  test('disabling panel camera preview releases the live camera stream', async ({
    appPage,
    electronApp,
  }) => {
    test.setTimeout(120_000);
    let panelPage: import('@playwright/test').Page | null = null;

    try {
      await appPage.evaluate(async ({ debugSource }) => {
        const api = (window as unknown as { roughcut: any }).roughcut;
        await api.debugSetCaptureSources?.([debugSource]);
        await api.recordingConfigUpdate({
          recordMode: 'fullscreen',
          selectedSourceId: debugSource.id,
          selectedMicDeviceId: null,
          selectedCameraDeviceId: null,
          selectedSystemAudioSourceId: null,
          micEnabled: false,
          sysAudioEnabled: false,
          cameraEnabled: true,
          countdownSeconds: 0,
        });
      }, { debugSource: DEBUG_SOURCE });

      await navigateToTab(appPage, 'record');

      const panelPromise = electronApp.waitForEvent('window');
      await appPage.evaluate(() => (window as unknown as { roughcut: any }).roughcut.openRecordingPanel());
      panelPage = await panelPromise;
      await panelPage.waitForLoadState('domcontentloaded');

      await panelPage.evaluate(async ({ debugSource }) => {
        const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
          const mandatory = (constraints?.video as { mandatory?: { chromeMediaSource?: string } })?.mandatory;
          if (mandatory?.chromeMediaSource === 'desktop') {
            const canvas = document.createElement('canvas');
            canvas.width = 1280;
            canvas.height = 720;
            return canvas.captureStream(30);
          }
          if (constraints?.video) {
            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = 480;
            const ctx = canvas.getContext('2d');
            let frame = 0;
            const paint = () => {
              if (!ctx) return;
              frame += 1;
              ctx.fillStyle = '#020617';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.fillStyle = '#38bdf8';
              ctx.beginPath();
              ctx.arc(canvas.width / 2, canvas.height / 2, 40 + (frame % 20), 0, Math.PI * 2);
              ctx.fill();
            };
            paint();
            window.setInterval(paint, 100);
            return canvas.captureStream(30);
          }
          return originalGetUserMedia(constraints);
        };

        const api = (window as unknown as { roughcut: any }).roughcut;
        await api.debugSetCaptureSources?.([debugSource]);
        await api.recordingConfigUpdate({
          recordMode: 'fullscreen',
          selectedSourceId: debugSource.id,
          selectedCameraDeviceId: null,
          cameraEnabled: true,
        });
      }, { debugSource: DEBUG_SOURCE });

      await expect(panelPage.locator('button[aria-label="Camera"]')).toHaveAttribute(
        'aria-pressed',
        'true',
        { timeout: 15_000 },
      );
      await expect(panelPage.locator('[data-testid="panel-camera-preview-video"]')).toBeVisible({ timeout: 15_000 });

      await expect
        .poll(
          () =>
            panelPage.evaluate(() => {
              const hooks = (window as unknown as {
                __panelTestHooks: { getCameraStreamTrackStates: () => string[] };
              }).__panelTestHooks;
              return hooks.getCameraStreamTrackStates();
            }),
          { timeout: 10_000 },
        )
        .toContain('live');

      await panelPage.locator('button[aria-label="Camera"]').click();

      await expect(panelPage.locator('button[aria-label="Camera"]')).toHaveAttribute(
        'aria-pressed',
        'false',
        { timeout: 15_000 },
      );
      await expect(panelPage.locator('[data-testid="panel-camera-preview-video"]')).toHaveCount(0);
      await expect
        .poll(
          () =>
            panelPage.evaluate(() => {
              const hooks = (window as unknown as {
                __panelTestHooks: { getCameraStreamTrackStates: () => string[] };
              }).__panelTestHooks;
              return hooks.getCameraStreamTrackStates();
            }),
          { timeout: 10_000 },
        )
        .toEqual([]);
    } finally {
      if (panelPage && !panelPage.isClosed()) {
        await panelPage.close().catch(() => {});
      }
    }
  });

  test('closing the panel releases the live camera preview stream', async ({ appPage, electronApp }) => {
    test.setTimeout(120_000);
    let panelPage: import('@playwright/test').Page | null = null;

    try {
      await appPage.evaluate(async ({ debugSource }) => {
        const api = (window as unknown as { roughcut: any }).roughcut;
        await api.debugSetCaptureSources?.([debugSource]);
        await api.recordingConfigUpdate({
          recordMode: 'fullscreen',
          selectedSourceId: debugSource.id,
          selectedMicDeviceId: null,
          selectedCameraDeviceId: null,
          selectedSystemAudioSourceId: null,
          micEnabled: false,
          sysAudioEnabled: false,
          cameraEnabled: true,
          countdownSeconds: 0,
        });
      }, { debugSource: DEBUG_SOURCE });

      await navigateToTab(appPage, 'record');

      const panelPromise = electronApp.waitForEvent('window');
      await appPage.evaluate(() => (window as unknown as { roughcut: any }).roughcut.openRecordingPanel());
      panelPage = await panelPromise;
      await panelPage.waitForLoadState('domcontentloaded');

      await panelPage.evaluate(async ({ debugSource }) => {
        const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
          if (constraints?.video) {
            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = 480;
            return canvas.captureStream(30);
          }
          return originalGetUserMedia(constraints);
        };

        const api = (window as unknown as { roughcut: any }).roughcut;
        await api.debugSetCaptureSources?.([debugSource]);
        await api.recordingConfigUpdate({
          recordMode: 'fullscreen',
          selectedSourceId: debugSource.id,
          selectedCameraDeviceId: null,
          cameraEnabled: true,
        });
      }, { debugSource: DEBUG_SOURCE });

      await expect(panelPage.locator('[data-testid="panel-camera-preview-video"]')).toBeVisible({ timeout: 15_000 });
      await expect
        .poll(
          () =>
            panelPage!.evaluate(() => {
              const hooks = (window as unknown as {
                __panelTestHooks: { getCameraStreamTrackStates: () => string[] };
              }).__panelTestHooks;
              return hooks.getCameraStreamTrackStates();
            }),
          { timeout: 10_000 },
        )
        .toContain('live');

      const closePromise = panelPage.waitForEvent('close');
      await panelPage.locator('button[aria-label="Close recording panel"]').click();
      await closePromise;
    } finally {
      if (panelPage && !panelPage.isClosed()) {
        await panelPage.close().catch(() => {});
      }
    }
  });

  test('panel source changes do not trigger display capture or kill camera preview before REC', async ({
    appPage,
    electronApp,
  }) => {
    test.setTimeout(120_000);

    const debugSources = [
      DEBUG_SOURCE,
      {
        ...DEBUG_SOURCE,
        id: 'screen:camera-artifact:1',
        name: 'Camera Artifact Debug Screen 2',
        displayId: 'camera-artifact-display-2',
      },
    ];

    try {
      await appPage.evaluate(async ({ debugSources }) => {
        const api = (window as unknown as { roughcut: any }).roughcut;
        await api.debugSetCaptureSources?.(debugSources);
        await api.recordingConfigUpdate({
          recordMode: 'fullscreen',
          selectedSourceId: debugSources[0]!.id,
          selectedMicDeviceId: null,
          selectedCameraDeviceId: null,
          selectedSystemAudioSourceId: null,
          micEnabled: false,
          sysAudioEnabled: false,
          cameraEnabled: true,
          countdownSeconds: 0,
        });
      }, { debugSources });

      await navigateToTab(appPage, 'record');

      const panelPromise = electronApp.waitForEvent('window');
      await appPage.evaluate(() => (window as unknown as { roughcut: any }).roughcut.openRecordingPanel());
      const panelPage = await panelPromise;
      await panelPage.waitForLoadState('domcontentloaded');

      await panelPage.evaluate(async ({ debugSources }) => {
        (window as unknown as { __panelDisplayGumCalls: number }).__panelDisplayGumCalls = 0;

        const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getDisplayMedia = async () => {
          (window as unknown as { __panelDisplayGumCalls: number }).__panelDisplayGumCalls += 1;
          const canvas = document.createElement('canvas');
          canvas.width = 1280;
          canvas.height = 720;
          const ctx = canvas.getContext('2d');
          let frame = 0;
          const paint = () => {
            if (!ctx) return;
            frame += 1;
            ctx.fillStyle = '#111827';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#22c55e';
            ctx.fillRect(20 + (frame % 80), 20, Math.max(40, canvas.width / 3), Math.max(30, canvas.height / 3));
          };
          paint();
          window.setInterval(paint, 100);
          return canvas.captureStream(30);
        };
        navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
          const mandatory = (constraints?.video as { mandatory?: { chromeMediaSource?: string } })?.mandatory;
          if (mandatory?.chromeMediaSource === 'desktop') {
            const canvas = document.createElement('canvas');
            canvas.width = 1280;
            canvas.height = 720;
            return canvas.captureStream(30);
          }
          if (constraints?.video) {
            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = 480;
            const ctx = canvas.getContext('2d');
            let frame = 0;
            const paint = () => {
              if (!ctx) return;
              frame += 1;
              ctx.fillStyle = '#020617';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.fillStyle = '#38bdf8';
              ctx.beginPath();
              ctx.arc(canvas.width / 2, canvas.height / 2, 40 + (frame % 20), 0, Math.PI * 2);
              ctx.fill();
            };
            paint();
            window.setInterval(paint, 100);
            return canvas.captureStream(30);
          }
          return originalGetUserMedia(constraints);
        };

        const api = (window as unknown as { roughcut: any }).roughcut;
        await api.debugSetCaptureSources?.(debugSources);
        await api.recordingConfigUpdate({
          recordMode: 'fullscreen',
          selectedSourceId: debugSources[0]!.id,
          selectedCameraDeviceId: null,
          cameraEnabled: true,
        });
      }, { debugSources });

      await expect(panelPage.locator('button[aria-label="Camera"]')).toHaveAttribute(
        'aria-pressed',
        'true',
        { timeout: 15_000 },
      );
      await expect(panelPage.locator('[data-testid="panel-source-select"]')).toHaveValue(
        debugSources[0]!.id,
        { timeout: 15_000 },
      );

      await expect
        .poll(
          () =>
            panelPage.evaluate(
              () => Boolean((window as unknown as { __panelTestHooks?: unknown }).__panelTestHooks),
            ),
          { timeout: 10_000 },
        )
        .toBe(true);

      await expect
        .poll(
          () =>
            panelPage.evaluate(() => {
              const hooks = (window as unknown as {
                __panelTestHooks: { getCameraStreamTrackStates: () => string[] };
              }).__panelTestHooks;
              return hooks.getCameraStreamTrackStates();
            }),
          { timeout: 10_000 },
        )
        .toContain('live');

      expect(
        await panelPage.evaluate(
          () => (window as unknown as { __panelDisplayGumCalls: number }).__panelDisplayGumCalls,
        ),
      ).toBe(0);

      await panelPage.locator('[data-testid="panel-source-select"]').selectOption(debugSources[1]!.id);
      await expect(panelPage.locator('[data-testid="panel-source-select"]')).toHaveValue(
        debugSources[1]!.id,
        { timeout: 10_000 },
      );

      await expect
        .poll(
          () =>
            panelPage.evaluate(() => {
              const hooks = (window as unknown as {
                __panelTestHooks: { getCameraStreamTrackStates: () => string[] };
              }).__panelTestHooks;
              return hooks.getCameraStreamTrackStates();
            }),
          { timeout: 10_000 },
        )
        .toContain('live');

      expect(
        await panelPage.evaluate(
          () => (window as unknown as { __panelDisplayGumCalls: number }).__panelDisplayGumCalls,
        ),
      ).toBe(0);

      await expect(panelPage.locator('button[aria-label="Start recording"]')).toBeEnabled({ timeout: 30_000 });
      await panelPage.locator('button[aria-label="Start recording"]').click();
      await expect(panelPage.locator('button[aria-label="Stop recording"]')).toBeVisible({ timeout: 30_000 });

      await expect
        .poll(
          () =>
            panelPage.evaluate(
              () => (window as unknown as { __panelDisplayGumCalls: number }).__panelDisplayGumCalls,
            ),
          { timeout: 10_000 },
        )
        .toBe(1);

      await panelPage.locator('button[aria-label="Stop recording"]').click().catch(() => {});
    } finally {
      await appPage
        .evaluate(async () => {
          const api = (window as unknown as { roughcut: any }).roughcut;
          await api.debugSetCaptureSources?.(null);
          await api.recordingConfigUpdate({ selectedSourceId: null, selectedCameraDeviceId: null, cameraEnabled: false });
        })
        .catch(() => {});
    }
  });

  test('synthetic camera recording saves a separate camera file and imports camera asset', async ({
    appPage,
    electronApp,
  }) => {
    test.setTimeout(180_000);

    const recordingDir = await mkdtemp(join(tmpdir(), 'rough-cut-camera-artifact-'));

    try {
      await appPage.evaluate(async ({ debugSource }) => {
        const installAnimatedStream = (key: string, label: string, width: number, height: number) => {
          const existing = (window as Record<string, unknown>)[key] as { stream: MediaStream } | undefined;
          if (existing) return existing.stream;

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          let frame = 0;
          const paint = () => {
            if (!ctx) return;
            frame += 1;
            ctx.fillStyle = '#111827';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#22c55e';
            ctx.fillRect(20 + (frame % 80), 20, Math.max(40, canvas.width / 3), Math.max(30, canvas.height / 3));
            ctx.fillStyle = '#f8fafc';
            ctx.font = 'bold 24px sans-serif';
            ctx.fillText(label + ' ' + frame, 24, canvas.height - 28);
          };
          paint();
          window.setInterval(paint, 100);
          const stream = canvas.captureStream(30);
          (window as Record<string, unknown>)[key] = { stream };
          return stream;
        };

        const desktopStream = installAnimatedStream('__cameraArtifactDesktop', 'desktop', 1280, 720);
        const cameraStream = installAnimatedStream('__cameraArtifactCamera', 'camera', 640, 480);

        navigator.mediaDevices.getDisplayMedia = async () => desktopStream;
        const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
          const mandatory = (constraints?.video as { mandatory?: { chromeMediaSource?: string } })?.mandatory;
          if (mandatory?.chromeMediaSource === 'desktop') {
            return desktopStream;
          }
          if (constraints?.video) {
            return cameraStream;
          }
          return originalGetUserMedia(constraints);
        };

        const api = (window as unknown as { roughcut: any }).roughcut;
        await api.debugSetCaptureSources?.([debugSource]);
        await api.recordingConfigUpdate({
          recordMode: 'fullscreen',
          selectedSourceId: debugSource.id,
          selectedMicDeviceId: null,
          selectedCameraDeviceId: null,
          selectedSystemAudioSourceId: null,
          micEnabled: false,
          sysAudioEnabled: false,
          cameraEnabled: true,
          countdownSeconds: 0,
        });

        const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
        stores?.project.getState().setProject({
          ...stores.project.getState().project,
          assets: [],
          composition: {
            ...stores.project.getState().project.composition,
            duration: 0,
            tracks: stores.project.getState().project.composition.tracks.map((track: any) => ({ ...track, clips: [] })),
          },
        });
        stores?.project.getState().setActiveAssetId(null);
        stores?.transport.getState().seekToFrame(0);
      }, { debugSource: DEBUG_SOURCE });

      await navigateToTab(appPage, 'record');

      await appPage.evaluate(
        async ({ recordingDir }) => {
          await (window as unknown as { roughcut: { storageSetRecordingLocation: (path: string) => Promise<void> } }).roughcut.storageSetRecordingLocation(recordingDir);
        },
        { recordingDir },
      );

      await appPage.evaluate(() => {
        (window as unknown as { __cameraArtifactResult?: RecordingResult | null }).__cameraArtifactResult = null;
        (window as unknown as { roughcut: any }).roughcut.onRecordingAssetReady((result: RecordingResult) => {
          (window as unknown as { __cameraArtifactResult?: RecordingResult | null }).__cameraArtifactResult = result;
        });
      });

      const panelPromise = electronApp.waitForEvent('window');
      await appPage.evaluate(() => (window as unknown as { roughcut: any }).roughcut.openRecordingPanel());
      const panelPage = await panelPromise;
      await panelPage.waitForLoadState('domcontentloaded');

      await panelPage.evaluate(async ({ debugSource }) => {
        const installAnimatedStream = (key: string, label: string, width: number, height: number) => {
          const existing = (window as Record<string, unknown>)[key] as { stream: MediaStream } | undefined;
          if (existing) return existing.stream;

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          let frame = 0;
          const paint = () => {
            if (!ctx) return;
            frame += 1;
            ctx.fillStyle = '#020617';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.arc(canvas.width / 2, canvas.height / 2, 40 + (frame % 20), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#f8fafc';
            ctx.font = 'bold 20px sans-serif';
            ctx.fillText(label + ' ' + frame, 20, canvas.height - 20);
          };
          paint();
          window.setInterval(paint, 100);
          const stream = canvas.captureStream(30);
          (window as Record<string, unknown>)[key] = { stream };
          return stream;
        };

        const desktopStream = installAnimatedStream('__cameraArtifactPanelDesktop', 'desktop', 1280, 720);

        navigator.mediaDevices.getDisplayMedia = async () => desktopStream;
        const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        // Count camera-track acquisitions so we can assert the recorder acquires its own stream
        // instead of reusing the preview's track. See feedback_recording_owns_its_stream.md.
        (window as unknown as { __cameraGumCalls: number }).__cameraGumCalls = 0;
        navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
          const mandatory = (constraints?.video as { mandatory?: { chromeMediaSource?: string } })?.mandatory;
          if (mandatory?.chromeMediaSource === 'desktop') {
            return desktopStream;
          }
          if (constraints?.video) {
            // Return a FRESH stream per call — a singleton would mask the bug where recorder
            // reuses the preview's (possibly ended) track.
            (window as unknown as { __cameraGumCalls: number }).__cameraGumCalls += 1;
            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = 480;
            const ctx = canvas.getContext('2d');
            let frame = 0;
            const paint = () => {
              if (!ctx) return;
              frame += 1;
              ctx.fillStyle = '#020617';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.fillStyle = '#38bdf8';
              ctx.beginPath();
              ctx.arc(canvas.width / 2, canvas.height / 2, 40 + (frame % 20), 0, Math.PI * 2);
              ctx.fill();
            };
            paint();
            window.setInterval(paint, 100);
            return canvas.captureStream(30);
          }
          return originalGetUserMedia(constraints);
        };

        const api = (window as unknown as { roughcut: any }).roughcut;
        await api.debugSetCaptureSources?.([debugSource]);
        await api.recordingConfigUpdate({
          recordMode: 'fullscreen',
          selectedSourceId: debugSource.id,
          selectedCameraDeviceId: null,
          cameraEnabled: true,
        });
      }, { debugSource: DEBUG_SOURCE });

      await expect(panelPage.locator('button[aria-label="Camera"]')).toHaveAttribute(
        'aria-pressed',
        'true',
        { timeout: 15_000 },
      );
      await expect(panelPage.locator('[data-testid="panel-source-select"]')).toHaveValue(
        DEBUG_SOURCE.id,
        { timeout: 15_000 },
      );

      await expect(panelPage.locator('button[aria-label="Start recording"]')).toBeEnabled({ timeout: 30_000 });
      // Count calls before clicking REC so we can isolate the recorder's getUserMedia call.
      const cameraGumCallsBeforeRec = await panelPage.evaluate(
        () => (window as unknown as { __cameraGumCalls: number }).__cameraGumCalls,
      );
      await panelPage.locator('button[aria-label="Start recording"]').click();
      await expect(panelPage.locator('button[aria-label="Stop recording"]')).toBeVisible({ timeout: 30_000 });
      await panelPage.waitForTimeout(1_500);
      await panelPage.locator('button[aria-label="Stop recording"]').click().catch(() => {});

      const cameraGumCallsAfterRec = await panelPage.evaluate(
        () => (window as unknown as { __cameraGumCalls: number }).__cameraGumCalls,
      );
      // The recorder must fetch its own camera stream at REC click — never reuse the preview's
      // MediaStreamTrack. See .claude/CLAUDE.md "Recording Owns Its Own Streams".
      expect(cameraGumCallsAfterRec).toBeGreaterThan(cameraGumCallsBeforeRec);

      const result = await waitForRecordedResult(appPage, electronApp, '__cameraArtifactResult');

      expect(result.cameraFilePath).toBeTruthy();
      await access(result.filePath);
      await access(result.cameraFilePath!);
      expect((await stat(result.filePath)).size).toBeGreaterThan(0);
      expect((await stat(result.cameraFilePath!)).size).toBeGreaterThan(0);

      const snapshot = await appPage.evaluate(() => {
        const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
        const project = stores.project.getState().project;
        const recordingAsset = project.assets.find((asset: any) => asset.type === 'recording' && !asset.metadata?.isCamera) ?? null;
        const cameraAsset = project.assets.find((asset: any) => asset.metadata?.isCamera === true) ?? null;
        return {
          assetCount: project.assets.length,
          recordingAssetId: recordingAsset?.id ?? null,
          cameraAssetId: cameraAsset?.id ?? null,
          cameraAssetPath: cameraAsset?.filePath ?? null,
        };
      });

      expect(snapshot.assetCount).toBeGreaterThanOrEqual(2);
      expect(snapshot.recordingAssetId).toBeTruthy();
      expect(snapshot.cameraAssetId).toBeTruthy();
      expect(snapshot.cameraAssetPath).toBe(result.cameraFilePath);

      const activeReviewState = await appPage.evaluate(() => {
        const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
        const projectState = stores?.project.getState();
        const activeAssetId = projectState?.activeAssetId ?? null;
        const activeAsset = activeAssetId
          ? projectState?.project.assets.find((asset: any) => asset.id === activeAssetId) ?? null
          : null;
        return {
          activeAssetId,
          activeAssetType: activeAsset?.type ?? null,
          cameraAssetId: activeAsset?.cameraAssetId ?? null,
          templateId: activeAsset?.presentation?.templateId ?? null,
          cameraVisible: activeAsset?.presentation?.camera?.visible ?? null,
        };
      });

      expect(activeReviewState.activeAssetId).toBe(snapshot.recordingAssetId);
      expect(activeReviewState.activeAssetType).toBe('recording');
      expect(activeReviewState.cameraAssetId).toBe(snapshot.cameraAssetId);
      expect(activeReviewState.templateId).toBe('screen-cam-br-16x9');
      expect(activeReviewState.cameraVisible).toBe(true);

      await expect(appPage.locator('[data-testid="record-camera-frame"]')).toBeVisible();

      await expect
        .poll(
          async () =>
            appPage.evaluate(() => {
              const cameraVideo = document.querySelector(
                '[data-testid="camera-playback-video"]',
              ) as HTMLVideoElement | null;
              return cameraVideo
                ? {
                    ready: cameraVideo.getAttribute('data-ready'),
                    src: cameraVideo.getAttribute('src'),
                  }
                : null;
            }),
          { timeout: 15_000 },
        )
        .toEqual({
          ready: 'true',
          src: `media://${result.cameraFilePath!}`,
        });

      const playButton = appPage
        .locator(
          '[data-testid="record-timeline"] button[title*="Play"], [data-testid="record-timeline"] button[title*="Pause"]',
        )
        .last();
      await playButton.click();

      await expect
        .poll(
          async () =>
            appPage.evaluate(() => {
              const cameraVideo = document.querySelector(
                '[data-testid="camera-playback-video"]',
              ) as HTMLVideoElement | null;
              const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
              return {
                currentTime: cameraVideo?.currentTime ?? 0,
                paused: cameraVideo?.paused ?? true,
                playheadFrame: stores?.transport.getState().playheadFrame ?? 0,
              };
            }),
          { timeout: 10_000 },
        )
        .toMatchObject({
          paused: false,
        });

      await expect
        .poll(
          async () =>
            appPage.evaluate(() => {
              const cameraVideo = document.querySelector(
                '[data-testid="camera-playback-video"]',
              ) as HTMLVideoElement | null;
              const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
              return (cameraVideo?.currentTime ?? 0) > 0.2 &&
                (stores?.transport.getState().playheadFrame ?? 0) > 0;
            }),
          { timeout: 10_000 },
        )
        .toBe(true);

      const playbackDiag = await appPage.evaluate(() => {
        const cameraVideo = document.querySelector(
          '[data-testid="camera-playback-video"]',
        ) as HTMLVideoElement | null;
        const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
        return {
          currentTime: cameraVideo?.currentTime ?? 0,
          playheadFrame: stores?.transport.getState().playheadFrame ?? 0,
        };
      });

      expect(playbackDiag.currentTime).toBeGreaterThan(0.2);
      expect(playbackDiag.playheadFrame).toBeGreaterThan(0);

      const cameraProbe = await ffprobeJson(result.cameraFilePath!);
      const cameraVideo = cameraProbe.streams?.find((stream: any) => stream.codec_type === 'video');
      expect(cameraVideo).toBeTruthy();
      expect(Number(cameraVideo.width || 0)).toBeGreaterThan(0);
      expect(Number(cameraVideo.height || 0)).toBeGreaterThan(0);
    } finally {
      await appPage
        .evaluate(async () => {
          const api = (window as unknown as { roughcut: any }).roughcut;
          await api.debugSetCaptureSources?.(null);
          await api.recordingConfigUpdate({ selectedSourceId: null, selectedCameraDeviceId: null, cameraEnabled: false });
        })
        .catch(() => {});
      await rm(recordingDir, { recursive: true, force: true });
    }
  });

  test('camera survives mic and system-audio recording route and stays playable after import', async ({
    appPage,
    electronApp,
  }) => {
    test.setTimeout(240_000);

    const recordingDir = await mkdtemp(join(tmpdir(), 'rough-cut-camera-audio-route-'));

    try {
      const runtimeInfo = await appPage.evaluate(async ({ debugSource }) => {
        const installAnimatedStream = (key: string, label: string, width: number, height: number) => {
          const existing = (window as Record<string, unknown>)[key] as { stream: MediaStream } | undefined;
          if (existing) return existing.stream;

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          let frame = 0;
          const paint = () => {
            if (!ctx) return;
            frame += 1;
            ctx.fillStyle = '#111827';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#22c55e';
            ctx.fillRect(
              20 + (frame % 80),
              20,
              Math.max(40, canvas.width / 3),
              Math.max(30, canvas.height / 3),
            );
            ctx.fillStyle = '#f8fafc';
            ctx.font = 'bold 24px sans-serif';
            ctx.fillText(label + ' ' + frame, 24, canvas.height - 28);
          };
          paint();
          window.setInterval(paint, 100);
          const stream = canvas.captureStream(30);
          (window as Record<string, unknown>)[key] = { stream };
          return stream;
        };

        const desktopStream = installAnimatedStream('__cameraAudioRouteDesktop', 'desktop', 1280, 720);
        navigator.mediaDevices.getDisplayMedia = async () => desktopStream;
        const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
          const mandatory = (constraints?.video as { mandatory?: { chromeMediaSource?: string } })
            ?.mandatory;
          if (mandatory?.chromeMediaSource === 'desktop') {
            return desktopStream;
          }
          return originalGetUserMedia(constraints);
        };

        const api = (window as unknown as { roughcut: any }).roughcut;
        const devices = await navigator.mediaDevices.enumerateDevices();
        const systemAudioSources = await api.recordingGetSystemAudioSources();
        await api.debugSetCaptureSources?.([debugSource]);

        return {
          selectedSystemAudioSourceId: systemAudioSources[0]?.id ?? null,
          hasMicDevice: devices.some((device) => device.kind === 'audioinput'),
        };
      }, { debugSource: DEBUG_SOURCE });

      test.skip(
        !runtimeInfo.hasMicDevice || !runtimeInfo.selectedSystemAudioSourceId,
        'Mic or system audio source unavailable in this automated session',
      );

      await appPage.evaluate(
        async ({ debugSource, selectedSystemAudioSourceId }) => {
          const api = (window as unknown as { roughcut: any }).roughcut;
          await api.recordingConfigUpdate({
            recordMode: 'fullscreen',
            selectedSourceId: debugSource.id,
            selectedMicDeviceId: null,
            selectedCameraDeviceId: null,
            selectedSystemAudioSourceId,
            micEnabled: true,
            sysAudioEnabled: true,
            cameraEnabled: true,
            countdownSeconds: 0,
          });

          const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
          stores?.project.getState().setProject({
            ...stores.project.getState().project,
            assets: [],
            composition: {
              ...stores.project.getState().project.composition,
              duration: 0,
              tracks: stores.project
                .getState()
                .project.composition.tracks.map((track: any) => ({ ...track, clips: [] })),
            },
          });
          stores?.project.getState().setActiveAssetId(null);
          stores?.transport.getState().seekToFrame(0);
        },
        {
          debugSource: DEBUG_SOURCE,
          selectedSystemAudioSourceId: runtimeInfo.selectedSystemAudioSourceId,
        },
      );

      await navigateToTab(appPage, 'record');

      await appPage.evaluate(
        async ({ recordingDir }) => {
          await (
            window as unknown as {
              roughcut: { storageSetRecordingLocation: (path: string) => Promise<void> };
            }
          ).roughcut.storageSetRecordingLocation(recordingDir);
        },
        { recordingDir },
      );

      await appPage.evaluate(() => {
        (window as unknown as { __cameraAudioRouteResult?: RecordingResult | null }).__cameraAudioRouteResult = null;
        (window as unknown as { roughcut: any }).roughcut.onRecordingAssetReady((result: RecordingResult) => {
          (window as unknown as { __cameraAudioRouteResult?: RecordingResult | null }).__cameraAudioRouteResult = result;
        });
      });

      const panelPromise = electronApp.waitForEvent('window');
      await appPage.evaluate(() => (window as unknown as { roughcut: any }).roughcut.openRecordingPanel());
      const panelPage = await panelPromise;
      await panelPage.waitForLoadState('domcontentloaded');

      await panelPage.evaluate(
        async ({ debugSource, selectedSystemAudioSourceId }) => {
          const installAnimatedStream = (key: string, label: string, width: number, height: number) => {
            const existing = (window as Record<string, unknown>)[key] as { stream: MediaStream } | undefined;
            if (existing) return existing.stream;

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            let frame = 0;
            const paint = () => {
              if (!ctx) return;
              frame += 1;
              ctx.fillStyle = '#020617';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.fillStyle = '#38bdf8';
              ctx.beginPath();
              ctx.arc(canvas.width / 2, canvas.height / 2, 40 + (frame % 20), 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = '#f8fafc';
              ctx.font = 'bold 20px sans-serif';
              ctx.fillText(label + ' ' + frame, 20, canvas.height - 20);
            };
            paint();
            window.setInterval(paint, 100);
            const stream = canvas.captureStream(30);
            (window as Record<string, unknown>)[key] = { stream };
            return stream;
          };

          const desktopStream = installAnimatedStream('__cameraAudioRoutePanelDesktop', 'desktop', 1280, 720);
          const cameraStream = installAnimatedStream('__cameraAudioRoutePanelCamera', 'camera', 640, 480);

          navigator.mediaDevices.getDisplayMedia = async () => desktopStream;
          const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
          navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
            const mandatory = (constraints?.video as { mandatory?: { chromeMediaSource?: string } })
              ?.mandatory;
            if (mandatory?.chromeMediaSource === 'desktop') {
              return desktopStream;
            }
            if (constraints?.video) {
              return cameraStream;
            }
            return originalGetUserMedia(constraints);
          };

          const api = (window as unknown as { roughcut: any }).roughcut;
          await api.debugSetCaptureSources?.([debugSource]);
          await api.recordingConfigUpdate({
            recordMode: 'fullscreen',
            selectedSourceId: debugSource.id,
            selectedMicDeviceId: null,
            selectedCameraDeviceId: null,
            selectedSystemAudioSourceId,
            micEnabled: true,
            sysAudioEnabled: true,
            cameraEnabled: true,
          });
        },
        {
          debugSource: DEBUG_SOURCE,
          selectedSystemAudioSourceId: runtimeInfo.selectedSystemAudioSourceId,
        },
      );

      await expect(panelPage.locator('button[aria-label="Camera"]')).toHaveAttribute(
        'aria-pressed',
        'true',
        { timeout: 15_000 },
      );
      await expect(panelPage.locator('[data-testid="panel-source-select"]')).toHaveValue(
        DEBUG_SOURCE.id,
        { timeout: 15_000 },
      );

      await expect(panelPage.locator('button[aria-label="Start recording"]')).toBeEnabled({
        timeout: 30_000,
      });
      await panelPage.locator('button[aria-label="Start recording"]').click();
      await expect(panelPage.locator('button[aria-label="Stop recording"]')).toBeVisible({
        timeout: 30_000,
      });
      await panelPage.waitForTimeout(2_500);
      await panelPage.locator('button[aria-label="Stop recording"]').click().catch(() => {});

      const result = await waitForRecordedResult(appPage, electronApp, '__cameraAudioRouteResult');

      expect(result.cameraFilePath).toBeTruthy();
      expect(result.hasAudio).toBe(true);

      await access(result.filePath);
      await access(result.cameraFilePath!);
      expect((await stat(result.filePath)).size).toBeGreaterThan(0);
      expect((await stat(result.cameraFilePath!)).size).toBeGreaterThan(0);

      const screenProbe = await ffprobeJson(result.filePath);
      const screenAudio = screenProbe.streams?.find((stream: any) => stream.codec_type === 'audio');
      expect(screenAudio).toBeTruthy();

      await expect
        .poll(
          async () =>
            appPage.evaluate(() => {
              const cameraVideo = document.querySelector(
                '[data-testid="camera-playback-video"]',
              ) as HTMLVideoElement | null;
              return cameraVideo
                ? {
                    ready: cameraVideo.getAttribute('data-ready'),
                    src: cameraVideo.getAttribute('src'),
                  }
                : null;
            }),
          { timeout: 15_000 },
        )
        .toEqual({
          ready: 'true',
          src: `media://${result.cameraFilePath!}`,
        });

      const playButton = appPage
        .locator(
          '[data-testid="record-timeline"] button[title*="Play"], [data-testid="record-timeline"] button[title*="Pause"]',
        )
        .last();
      await playButton.click();

      await expect
        .poll(
          async () =>
            appPage.evaluate(() => {
              const cameraVideo = document.querySelector(
                '[data-testid="camera-playback-video"]',
              ) as HTMLVideoElement | null;
              const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
              return (cameraVideo?.currentTime ?? 0) > 0.2 &&
                (stores?.transport.getState().playheadFrame ?? 0) > 0;
            }),
          { timeout: 10_000 },
        )
        .toBe(true);
    } finally {
      await appPage
        .evaluate(async () => {
          const api = (window as unknown as { roughcut: any }).roughcut;
          await api.debugSetCaptureSources?.(null);
          await api.recordingConfigUpdate({
            selectedSourceId: null,
            selectedMicDeviceId: null,
            selectedCameraDeviceId: null,
            selectedSystemAudioSourceId: null,
            micEnabled: false,
            sysAudioEnabled: false,
            cameraEnabled: false,
          });
        })
        .catch(() => {});
      await rm(recordingDir, { recursive: true, force: true });
    }
  });

  // Regression test for 2026-04-22 camera-recording bug: the preview's camera track
  // transitioned to `readyState === 'ended'` before REC click, and the recorder failed
  // because it was cloning the preview's (dead) sourceTrack. The fix acquires a fresh
  // getUserMedia stream at REC click. This test deterministically reproduces the
  // ended-track state using `window.__panelTestHooks` (defined in PanelApp.tsx) and
  // asserts recording still produces a camera file.
  // See .claude/CLAUDE.md "Recording Owns Its Own Streams" and TASK-185.
  test('camera records successfully even when preview track is ended at REC click', async ({
    appPage,
    electronApp,
  }) => {
    test.setTimeout(180_000);

    const recordingDir = await mkdtemp(join(tmpdir(), 'rough-cut-camera-preview-ended-'));

    try {
      await appPage.evaluate(async ({ debugSource }) => {
        const desktopCanvas = document.createElement('canvas');
        desktopCanvas.width = 1280;
        desktopCanvas.height = 720;
        const dctx = desktopCanvas.getContext('2d');
        window.setInterval(() => {
          if (!dctx) return;
          dctx.fillStyle = '#0f172a';
          dctx.fillRect(0, 0, desktopCanvas.width, desktopCanvas.height);
        }, 100);
        const desktopStream = desktopCanvas.captureStream(30);
        navigator.mediaDevices.getDisplayMedia = async () => desktopStream;

        const api = (window as unknown as { roughcut: any }).roughcut;
        await api.debugSetCaptureSources?.([debugSource]);
        await api.recordingConfigUpdate({
          recordMode: 'fullscreen',
          selectedSourceId: debugSource.id,
          selectedMicDeviceId: null,
          selectedCameraDeviceId: null,
          selectedSystemAudioSourceId: null,
          micEnabled: false,
          sysAudioEnabled: false,
          cameraEnabled: true,
          countdownSeconds: 0,
        });

        const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
        stores?.project.getState().setProject({
          ...stores.project.getState().project,
          assets: [],
          composition: {
            ...stores.project.getState().project.composition,
            duration: 0,
            tracks: stores.project.getState().project.composition.tracks.map((track: any) => ({ ...track, clips: [] })),
          },
        });
        stores?.project.getState().setActiveAssetId(null);
        stores?.transport.getState().seekToFrame(0);
      }, { debugSource: DEBUG_SOURCE });

      await navigateToTab(appPage, 'record');

      await appPage.evaluate(
        async ({ recordingDir }) => {
          await (window as unknown as { roughcut: { storageSetRecordingLocation: (path: string) => Promise<void> } }).roughcut.storageSetRecordingLocation(recordingDir);
        },
        { recordingDir },
      );

      await appPage.evaluate(() => {
        (window as unknown as { __previewEndedResult?: RecordingResult | null }).__previewEndedResult = null;
        (window as unknown as { roughcut: any }).roughcut.onRecordingAssetReady((result: RecordingResult) => {
          (window as unknown as { __previewEndedResult?: RecordingResult | null }).__previewEndedResult = result;
        });
      });

      const panelPromise = electronApp.waitForEvent('window');
      await appPage.evaluate(() => (window as unknown as { roughcut: any }).roughcut.openRecordingPanel());
      const panelPage = await panelPromise;
      await panelPage.waitForLoadState('domcontentloaded');

      await panelPage.evaluate(async ({ debugSource }) => {
        const desktopCanvas = document.createElement('canvas');
        desktopCanvas.width = 1280;
        desktopCanvas.height = 720;
        const dctx = desktopCanvas.getContext('2d');
        window.setInterval(() => {
          if (!dctx) return;
          dctx.fillStyle = '#0f172a';
          dctx.fillRect(0, 0, desktopCanvas.width, desktopCanvas.height);
        }, 100);
        const desktopStream = desktopCanvas.captureStream(30);
        navigator.mediaDevices.getDisplayMedia = async () => desktopStream;

        // Count camera getUserMedia calls so we can prove the recorder acquires fresh
        // at REC click instead of reusing the preview-injected (dead) stream.
        (window as unknown as { __previewEndedGumCalls: number }).__previewEndedGumCalls = 0;

        const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
          const mandatory = (constraints?.video as { mandatory?: { chromeMediaSource?: string } })?.mandatory;
          if (mandatory?.chromeMediaSource === 'desktop') {
            return desktopStream;
          }
          if (constraints?.video) {
            (window as unknown as { __previewEndedGumCalls: number }).__previewEndedGumCalls += 1;
            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = 480;
            const ctx = canvas.getContext('2d');
            let frame = 0;
            const paint = () => {
              if (!ctx) return;
              frame += 1;
              ctx.fillStyle = '#1e293b';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.fillStyle = '#ef4444';
              ctx.fillRect(20 + (frame % 80), 20, 200, 120);
            };
            paint();
            window.setInterval(paint, 100);
            return canvas.captureStream(30);
          }
          return originalGetUserMedia(constraints);
        };

        const api = (window as unknown as { roughcut: any }).roughcut;
        await api.debugSetCaptureSources?.([debugSource]);
        await api.recordingConfigUpdate({
          recordMode: 'fullscreen',
          selectedSourceId: debugSource.id,
          selectedCameraDeviceId: null,
          cameraEnabled: true,
        });
      }, { debugSource: DEBUG_SOURCE });

      await expect(panelPage.locator('button[aria-label="Camera"]')).toHaveAttribute(
        'aria-pressed',
        'true',
        { timeout: 15_000 },
      );
      await expect(panelPage.locator('[data-testid="panel-source-select"]')).toHaveValue(
        DEBUG_SOURCE.id,
        { timeout: 15_000 },
      );

      await expect(panelPage.locator('button[aria-label="Start recording"]')).toBeEnabled({ timeout: 30_000 });

      // Wait for the test hooks to be exposed (they mount inside PanelApp's useEffect).
      await expect
        .poll(
          () =>
            panelPage.evaluate(
              () => Boolean((window as unknown as { __panelTestHooks?: unknown }).__panelTestHooks),
            ),
          { timeout: 10_000 },
        )
        .toBe(true);

      // Inject a fake preview stream (live track) and immediately kill its tracks.
      // This reproduces the 2026-04-22 bug state: cameraStream is non-null but the
      // sourceTrack has `readyState === 'ended'` before REC click.
      const trackStatesAfterKill = await panelPage.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        const injected = canvas.captureStream(30);
        const hooks = (window as unknown as {
          __panelTestHooks: {
            injectCameraStream: (s: MediaStream | null) => void;
            killCameraStreamTracks: () => void;
            getCameraStreamTrackStates: () => string[];
          };
        }).__panelTestHooks;
        hooks.injectCameraStream(injected);
        hooks.killCameraStreamTracks();
        return hooks.getCameraStreamTrackStates();
      });
      expect(trackStatesAfterKill.length).toBeGreaterThan(0);
      expect(trackStatesAfterKill.every((state) => state === 'ended')).toBe(true);

      const gumCallsBeforeRec = await panelPage.evaluate(
        () => (window as unknown as { __previewEndedGumCalls: number }).__previewEndedGumCalls,
      );

      await panelPage.locator('button[aria-label="Start recording"]').click();
      await expect(panelPage.locator('button[aria-label="Stop recording"]')).toBeVisible({ timeout: 30_000 });
      await panelPage.waitForTimeout(1_500);
      await panelPage.locator('button[aria-label="Stop recording"]').click().catch(() => {});

      // The recorder MUST have acquired a fresh camera stream at REC click. If the old
      // "clone the preview track" code were restored, this count would not increase
      // because the preview track is ended and cloning it doesn't call getUserMedia.
      const gumCallsAfterRec = await panelPage.evaluate(
        () => (window as unknown as { __previewEndedGumCalls: number }).__previewEndedGumCalls,
      );
      expect(gumCallsAfterRec).toBeGreaterThan(gumCallsBeforeRec);

      const result = await waitForRecordedResult(appPage, electronApp, '__previewEndedResult');

      // The fix: recording must still succeed with a non-empty camera file even though
      // the preview stream was dead at REC click.
      expect(result.cameraFilePath).toBeTruthy();
      await access(result.cameraFilePath!);
      expect((await stat(result.cameraFilePath!)).size).toBeGreaterThan(0);

      const cameraProbe = await ffprobeJson(result.cameraFilePath!);
      const cameraVideo = cameraProbe.streams?.find((stream: any) => stream.codec_type === 'video');
      expect(cameraVideo).toBeTruthy();
      expect(Number(cameraVideo.width || 0)).toBeGreaterThan(0);
    } finally {
      await appPage
        .evaluate(async () => {
          const api = (window as unknown as { roughcut: any }).roughcut;
          await api.debugSetCaptureSources?.(null);
          await api.recordingConfigUpdate({ selectedSourceId: null, selectedCameraDeviceId: null, cameraEnabled: false });
        })
        .catch(() => {});
      await rm(recordingDir, { recursive: true, force: true });
    }
  });
});
