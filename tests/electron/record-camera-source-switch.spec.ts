import { test, expect, navigateToTab } from './fixtures/electron-app.js';

type CaptureSource = {
  id: string;
  type: 'screen' | 'window';
  name: string;
  displayId: string | null;
  thumbnailDataUrl: string;
};

type CameraPreviewState = {
  videoExists: boolean;
  videoPaused: boolean | null;
  videoReadyState: number | null;
  videoWidth: number | null;
  videoHeight: number | null;
  trackStates: string[];
};

const DEBUG_SOURCES: CaptureSource[] = [
  {
    id: 'screen:source-switch:0',
    type: 'screen',
    name: 'Source Switch Debug Screen 1',
    displayId: 'source-switch-display-1',
    thumbnailDataUrl: '',
  },
  {
    id: 'screen:source-switch:1',
    type: 'screen',
    name: 'Source Switch Debug Screen 2',
    displayId: 'source-switch-display-2',
    thumbnailDataUrl: '',
  },
];

async function readCameraPreviewState(
  page: import('@playwright/test').Page,
): Promise<CameraPreviewState> {
  return page.evaluate(() => {
    const video = document.querySelector(
      '[data-testid="panel-camera-preview-video"]',
    ) as HTMLVideoElement | null;
    const stream = video?.srcObject as MediaStream | null;
    return {
      videoExists: Boolean(video),
      videoPaused: video?.paused ?? null,
      videoReadyState: video?.readyState ?? null,
      videoWidth: video?.videoWidth ?? null,
      videoHeight: video?.videoHeight ?? null,
      trackStates: stream?.getVideoTracks().map((track) => track.readyState) ?? [],
    };
  });
}

test.setTimeout(60_000);

test('camera preview stays live while switching setup sources before REC', async ({
  appPage,
  electronApp,
}) => {
  try {
    await appPage.evaluate(
      async ({ sources }) => {
        const api = (window as unknown as { roughcut: any }).roughcut;
        await api.debugSetCaptureSources?.(sources);
        await api.recordingConfigUpdate({
          recordMode: 'fullscreen',
          selectedSourceId: sources[0]!.id,
          selectedMicDeviceId: null,
          selectedCameraDeviceId: null,
          selectedSystemAudioSourceId: null,
          micEnabled: false,
          sysAudioEnabled: false,
          cameraEnabled: false,
          countdownSeconds: 0,
        });
      },
      { sources: DEBUG_SOURCES },
    );

    await navigateToTab(appPage, 'record');

    const panelPromise = electronApp.waitForEvent('window');
    await appPage.locator('[data-testid="record-open-setup-panel"]').click();
    const panelPage = await panelPromise;
    await panelPage.waitForLoadState('domcontentloaded');

    await panelPage.evaluate(
      async ({ sources }) => {
        (window as unknown as { __panelDisplayGumCalls: number }).__panelDisplayGumCalls = 0;

        const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
          navigator.mediaDevices,
        );
        navigator.mediaDevices.getDisplayMedia = async () => {
          (window as unknown as { __panelDisplayGumCalls: number }).__panelDisplayGumCalls += 1;
          const canvas = document.createElement('canvas');
          canvas.width = 1280;
          canvas.height = 720;
          return canvas.captureStream(30);
        };
        navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
          const mandatory = (constraints?.video as { mandatory?: { chromeMediaSource?: string } })
            ?.mandatory;
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
        await api.debugSetCaptureSources?.(sources);
        await api.recordingConfigUpdate({ selectedSourceId: sources[0]!.id, cameraEnabled: true });
      },
      { sources: DEBUG_SOURCES },
    );

    await expect(panelPage.locator('[data-testid="panel-source-select"]')).toHaveValue(
      DEBUG_SOURCES[0]!.id,
      { timeout: 15_000 },
    );
    await expect(panelPage.locator('[data-testid="panel-camera-preview-video"]')).toBeVisible({
      timeout: 15_000,
    });

    await expect
      .poll(() => readCameraPreviewState(panelPage), { timeout: 10_000 })
      .toMatchObject({
        videoExists: true,
        videoPaused: false,
        trackStates: expect.arrayContaining(['live']),
      });
    expect(
      await panelPage.evaluate(
        () => (window as unknown as { __panelDisplayGumCalls: number }).__panelDisplayGumCalls,
      ),
    ).toBe(0);

    await panelPage
      .locator('[data-testid="panel-source-select"]')
      .selectOption(DEBUG_SOURCES[1]!.id);
    await expect(panelPage.locator('[data-testid="panel-source-select"]')).toHaveValue(
      DEBUG_SOURCES[1]!.id,
      { timeout: 10_000 },
    );
    await expect
      .poll(() => readCameraPreviewState(panelPage), { timeout: 10_000 })
      .toMatchObject({
        videoExists: true,
        videoPaused: false,
        trackStates: expect.arrayContaining(['live']),
      });
    expect(
      await panelPage.evaluate(
        () => (window as unknown as { __panelDisplayGumCalls: number }).__panelDisplayGumCalls,
      ),
    ).toBe(0);

    await panelPage
      .locator('[data-testid="panel-source-select"]')
      .selectOption(DEBUG_SOURCES[0]!.id);
    await expect(panelPage.locator('[data-testid="panel-source-select"]')).toHaveValue(
      DEBUG_SOURCES[0]!.id,
      { timeout: 10_000 },
    );
    await expect
      .poll(() => readCameraPreviewState(panelPage), { timeout: 10_000 })
      .toMatchObject({
        videoExists: true,
        videoPaused: false,
        trackStates: expect.arrayContaining(['live']),
      });
    expect(
      await panelPage.evaluate(
        () => (window as unknown as { __panelDisplayGumCalls: number }).__panelDisplayGumCalls,
      ),
    ).toBe(0);
  } finally {
    await appPage
      .evaluate(async () => {
        const api = (window as unknown as { roughcut: any }).roughcut;
        await api.debugSetCaptureSources?.(null);
        await api.recordingConfigUpdate({
          selectedSourceId: null,
          selectedCameraDeviceId: null,
          cameraEnabled: false,
        });
      })
      .catch(() => {});
  }
});
