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

const DEBUG_SOURCE: CaptureSource & { displayId: string | null; thumbnailDataUrl: string } = {
  id: 'screen:task173:0',
  type: 'screen',
  name: 'TASK-173 Debug Screen',
  displayId: 'task173-display',
  thumbnailDataUrl: '',
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
  cursorEventsPath?: string;
  thumbnailPath?: string;
  cameraFilePath?: string;
};

type ProjectSnapshot = {
  assetCount: number;
  clipCount: number;
  recordingAssetId: string | null;
  recordingFilePath: string | null;
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

test.describe('Record readiness gate', () => {
  test('golden path: blank project to saved take stays truthful', async ({ appPage, electronApp }) => {
    test.setTimeout(180_000);

    const recordingDir = await mkdtemp(join(tmpdir(), 'rough-cut-readiness-'));

    try {
      await appPage.evaluate(async ({ debugSource }) => {
        const api = (window as unknown as { roughcut: any }).roughcut;
        const captureKey = '__task173AppCapture';
        const existing = (window as Record<string, unknown>)[captureKey] as
          | { stream: MediaStream }
          | undefined;
        const stubStream = existing?.stream ?? (() => {
          const canvas = document.createElement('canvas');
          canvas.width = 1280;
          canvas.height = 720;
          const ctx = canvas.getContext('2d');
          let frame = 0;
          const paint = () => {
            if (!ctx) return;
            frame += 1;
            ctx.fillStyle = '#0b1020';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#f59e0b';
            ctx.fillRect(80 + (frame % 120), 80, 420, 260);
            ctx.fillStyle = '#60a5fa';
            ctx.fillRect(640, 240 + (frame % 90), 260, 180);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 28px sans-serif';
            ctx.fillText(`TASK-173 frame ${frame}`, 90, 390);
          };
          paint();
          const intervalId = window.setInterval(paint, 100);
          const stream = canvas.captureStream(30);
          (window as Record<string, unknown>)[captureKey] = { stream, intervalId };
          return stream;
        })();
        const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
          const mandatory = (constraints?.video as { mandatory?: { chromeMediaSource?: string } })
            ?.mandatory;
          if (mandatory?.chromeMediaSource === 'desktop') {
            return stubStream;
          }
          return originalGetUserMedia(constraints);
        };

        await api.debugSetCaptureSources?.([debugSource]);
        await api.recordingConfigUpdate({
          recordMode: 'fullscreen',
          selectedSourceId: null,
          selectedMicDeviceId: null,
          selectedCameraDeviceId: null,
          selectedSystemAudioSourceId: null,
          micEnabled: false,
          sysAudioEnabled: false,
          cameraEnabled: false,
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
      }, { debugSource: DEBUG_SOURCE });

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

      await expect(appPage.locator('[data-testid="record-preview-status"]')).toHaveAttribute(
        'data-preview-state',
        'empty',
      );
      await expect(appPage.locator('[data-testid="btn-record"]')).toBeDisabled();

      await appPage.evaluate(async ({ source }) => {
        await (window as unknown as { roughcut: any }).roughcut.recordingConfigUpdate({
          recordMode: source.type === 'window' ? 'window' : 'fullscreen',
          selectedSourceId: source.id,
        });
      }, { source: DEBUG_SOURCE });

      // Since commit 37836c6 (TASK-178 cleanup) the main Record tab no longer
      // renders a live-preview-canvas — recursive on-screen capture. The
      // preview-mode-badge below is the authoritative "live source preview is
      // active" signal that replaces that assertion.
      await expect(appPage.locator('[data-testid="record-preview-mode-badge"]')).toContainText(
        'Live source preview',
        { timeout: 30_000 },
      );
      await expect(appPage.locator('[data-testid="btn-record"]')).toBeEnabled();

      await appPage.evaluate(() => {
        (window as unknown as { __task173Asset?: RecordingResult | null }).__task173Asset = null;
        const api = (window as unknown as { roughcut: any }).roughcut;
        api.onRecordingAssetReady((result: RecordingResult) => {
          (window as unknown as { __task173Asset?: RecordingResult | null }).__task173Asset = result;
        });
      });

      const panelPromise = electronApp.waitForEvent('window');
      await appPage.evaluate(() => {
        return (window as unknown as { roughcut: any }).roughcut.openRecordingPanel();
      });
      const panelPage = await panelPromise;
      await panelPage.waitForLoadState('domcontentloaded');

      await panelPage.evaluate(async ({ debugSource }) => {
        const captureKey = '__task173PanelCapture';
        const existing = (window as Record<string, unknown>)[captureKey] as
          | { stream: MediaStream }
          | undefined;
        const stubStream = existing?.stream ?? (() => {
          const canvas = document.createElement('canvas');
          canvas.width = 1280;
          canvas.height = 720;
          const ctx = canvas.getContext('2d');
          let frame = 0;
          const paint = () => {
            if (!ctx) return;
            frame += 1;
            ctx.fillStyle = '#0b1020';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#f59e0b';
            ctx.fillRect(80 + (frame % 120), 80, 420, 260);
            ctx.fillStyle = '#60a5fa';
            ctx.fillRect(640, 240 + (frame % 90), 260, 180);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 28px sans-serif';
            ctx.fillText(`TASK-173 frame ${frame}`, 90, 390);
          };
          paint();
          const intervalId = window.setInterval(paint, 100);
          const stream = canvas.captureStream(30);
          (window as Record<string, unknown>)[captureKey] = { stream, intervalId };
          return stream;
        })();
        const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(
          navigator.mediaDevices,
        );
        navigator.mediaDevices.getDisplayMedia = async () => stubStream;

        const api = (window as unknown as { roughcut: any }).roughcut;
        await api.debugSetCaptureSources?.([debugSource]);
        await api.recordingConfigUpdate({
          recordMode: 'fullscreen',
          selectedSourceId: debugSource.id,
        });
      }, { debugSource: DEBUG_SOURCE });

      await expect
        .poll(
          async () =>
            panelPage.evaluate(() => {
              const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
              return stores?.recordingConfig?.getState()?.selectedSourceId ?? null;
            }),
          { timeout: 30_000 },
        )
        .toBe(DEBUG_SOURCE.id);

      await expect(panelPage.locator('button[aria-label="Start recording"]')).toBeVisible({
        timeout: 30_000,
      });
      await expect(panelPage.locator('button[aria-label="Start recording"]')).toBeEnabled({
        timeout: 30_000,
      });

      await panelPage.locator('button[aria-label="Start recording"]').click();

      await expect(panelPage.locator('button[aria-label="Stop recording"]')).toBeVisible({
        timeout: 30_000,
      });

      await panelPage.waitForTimeout(1_500);
      await panelPage.locator('button[aria-label="Stop recording"]').click().catch(() => {});

      await expect
        .poll(
          async () =>
            appPage.evaluate(() => {
              return (window as unknown as { __task173Asset?: RecordingResult | null }).__task173Asset ?? null;
            }),
          { timeout: 120_000 },
        )
        .not.toBeNull();

      const result = (await appPage.evaluate(() => {
        return (window as unknown as { __task173Asset?: RecordingResult | null }).__task173Asset ?? null;
      })) as RecordingResult | null;

      expect(result).not.toBeNull();
      await access(result!.filePath);
      const outputStats = await stat(result!.filePath);
      expect(outputStats.size).toBeGreaterThan(0);

      const snapshot = (await appPage.evaluate(() => {
        const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
        const project = stores.project.getState().project;
        const recordingAsset =
          project.assets.find((asset: any) => asset.type === 'recording' && !asset.metadata?.isCamera) ?? null;
        return {
          assetCount: project.assets.length,
          clipCount: project.composition.tracks.reduce(
            (total: number, track: any) => total + track.clips.length,
            0,
          ),
          recordingAssetId: recordingAsset?.id ?? null,
          recordingFilePath: recordingAsset?.filePath ?? null,
        } satisfies ProjectSnapshot;
      })) as ProjectSnapshot;

      expect(snapshot.assetCount).toBeGreaterThan(0);
      expect(snapshot.clipCount).toBeGreaterThan(0);
      expect(snapshot.recordingAssetId).toBeTruthy();
      expect(snapshot.recordingFilePath).toBe(result!.filePath);

      await expect(appPage.locator('[data-testid="record-preview-mode-badge"]')).toContainText(
        'Saved take',
      );
      await expect(appPage.locator('[data-testid="recording-playback-canvas"]')).toBeVisible();
      await expect(appPage.locator('[data-testid="record-preview-status"]')).toHaveCount(0);

      const probe = await ffprobeJson(result!.filePath);
      const videoStream = probe.streams?.find((stream: any) => stream.codec_type === 'video');
      expect(videoStream).toBeTruthy();
      expect(Number(videoStream.width || 0)).toBeGreaterThan(0);
      expect(Number(videoStream.height || 0)).toBeGreaterThan(0);
    } finally {
      await appPage
        .evaluate(async () => {
          const api = (window as unknown as { roughcut: any }).roughcut;
          await api.debugSetCaptureSources?.(null);
          await api.recordingConfigUpdate({ selectedSourceId: null });
        })
        .catch(() => {});
      await rm(recordingDir, { recursive: true, force: true });
    }
  });
});
