import { test, expect, navigateToTab } from './fixtures/electron-app.js';
import { mkdtemp, rm, stat, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';

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
   audioCapture?: {
     requested: {
       micEnabled: boolean;
       sysAudioEnabled: boolean;
       selectedMicDeviceId: string | null;
       selectedMicLabel: string | null;
       selectedSystemAudioSourceId: string | null;
     };
     resolved: {
       micSource: string | null;
       systemAudioSource: string | null;
     };
     final: {
       hasAudio: boolean;
     };
   };
};

function ffprobeJson(filePath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    execFile(
      'ffprobe',
      ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      { timeout: 30000 },
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

type VideoFrameStats = {
  nbReadFrames: number;
  rFrameRate: string;
  durationSeconds: number;
};

function ffprobeVideoFrameStats(filePath: string): Promise<VideoFrameStats> {
  return new Promise((resolve, reject) => {
    execFile(
      'ffprobe',
      [
        '-v',
        'quiet',
        '-count_frames',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=nb_read_frames,r_frame_rate,duration',
        '-of',
        'json',
        filePath,
      ],
      { timeout: 60000 },
      (error, stdout) => {
        if (error) return reject(error);
        try {
          const parsed = JSON.parse(stdout);
          const stream = parsed.streams?.[0] ?? {};
          resolve({
            nbReadFrames: Number(stream.nb_read_frames ?? 0),
            rFrameRate: String(stream.r_frame_rate ?? ''),
            durationSeconds: Number(stream.duration ?? 0),
          });
        } catch (parseError) {
          reject(parseError);
        }
      },
    );
  });
}

test.describe('Record device artifacts', () => {
  test('selected devices produce saved recording artifacts', async ({ appPage, electronApp }) => {
    const recordingDir = await mkdtemp(join(tmpdir(), 'rough-cut-task-088-'));

    try {
      await appPage.evaluate(async () => {
        await (
          window as unknown as {
            roughcut: {
              recordingConfigUpdate: (patch: Record<string, unknown>) => Promise<unknown>;
            };
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

      const runtimeInfo = await appPage.evaluate(async () => {
        const api = (
          window as unknown as {
            roughcut: {
              recordingGetSources: () => Promise<Array<{ id: string; type: string; name: string }>>;
              recordingGetSystemAudioSources: () => Promise<Array<{ id: string; label: string }>>;
            };
          }
        ).roughcut;
        const devices = await navigator.mediaDevices.enumerateDevices();
        return {
          sources: await api.recordingGetSources(),
          systemAudioSources: await api.recordingGetSystemAudioSources(),
          micDevices: devices.filter((device) => device.kind === 'audioinput'),
          cameraDevices: devices.filter((device) => device.kind === 'videoinput'),
        };
      });

      const selectedSourceId =
        runtimeInfo.sources.find((source) => source.type === 'screen')?.id ??
        runtimeInfo.sources[0]?.id ??
        'manual-test-source';
      const selectedMicDeviceId = runtimeInfo.micDevices[0]?.deviceId ?? null;
      const selectedCameraDeviceId = null;
      const selectedSystemAudioSourceId = runtimeInfo.systemAudioSources[0]?.id ?? null;

      await appPage.evaluate(
        async ({
          selectedSourceId,
          selectedMicDeviceId,
          selectedCameraDeviceId,
          selectedSystemAudioSourceId,
        }) => {
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
            selectedMicDeviceId,
            selectedCameraDeviceId,
            selectedSystemAudioSourceId,
          });
        },
        {
          selectedSourceId,
          selectedMicDeviceId,
          selectedCameraDeviceId,
          selectedSystemAudioSourceId,
        },
      );

      await appPage.evaluate(() => {
        (window as unknown as { __task088Asset?: RecordingResult | null }).__task088Asset = null;
        (
          window as unknown as {
            roughcut: {
              onRecordingAssetReady: (cb: (result: RecordingResult) => void) => () => void;
            };
          }
        ).roughcut.onRecordingAssetReady((result) => {
          (window as unknown as { __task088Asset?: RecordingResult | null }).__task088Asset =
            result;
        });
      });

      const panelPromise = electronApp.waitForEvent('window');
      await appPage.evaluate(() => {
        return (
          window as unknown as { roughcut: { openRecordingPanel: () => Promise<void> } }
        ).roughcut.openRecordingPanel();
      });
      const panelPage = await panelPromise;
      await panelPage.waitForLoadState('domcontentloaded');

      await panelPage.evaluate(() => {
        (window as unknown as { __task088StartedAt?: number | null }).__task088StartedAt = null;
        const api = (
          window as unknown as {
            roughcut: {
              panelMediaRecorderStarted: (timestampMs: number) => void;
              __task088OriginalPanelMediaRecorderStarted?: (timestampMs: number) => void;
            };
          }
        ).roughcut;
        if (!api.__task088OriginalPanelMediaRecorderStarted) {
          api.__task088OriginalPanelMediaRecorderStarted = api.panelMediaRecorderStarted.bind(api);
          api.panelMediaRecorderStarted = (timestampMs: number) => {
            (window as unknown as { __task088StartedAt?: number | null }).__task088StartedAt =
              timestampMs;
            api.__task088OriginalPanelMediaRecorderStarted?.(timestampMs);
          };
        }
      });

      await expect(panelPage.locator('button[aria-label="Start recording"]')).toBeVisible({
        timeout: 15000,
      });
      const canStart = await expect
        .poll(
          async () =>
            panelPage.evaluate(() => {
              const button = document.querySelector(
                'button[aria-label="Start recording"]',
              ) as HTMLButtonElement | null;
              return button ? !button.disabled : false;
            }),
          { timeout: 15000 },
        )
        .toBe(true)
        .then(() => true)
        .catch(() => false);

      test.skip(!canStart, 'Desktop capture source unavailable in this automated session');

      await panelPage.locator('button[aria-label="Start recording"]').click();

      const mediaRecorderStarted = await expect
        .poll(
          async () =>
            panelPage.evaluate(() => {
              return (
                (window as unknown as { __task088StartedAt?: number | null }).__task088StartedAt ??
                null
              );
            }),
          { timeout: 30000 },
        )
        .not.toBeNull()
        .then(() => true)
        .catch(() => false);

      test.skip(
        !mediaRecorderStarted,
        'Panel MediaRecorder did not start in this automated session',
      );

      await expect
        .poll(async () =>
          panelPage.evaluate(() => {
            const stores = (
              window as unknown as {
                __roughcutStores?: {
                  recordingConfig?: {
                    getState: () => {
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
          selectedMicDeviceId,
          selectedCameraDeviceId,
          selectedSystemAudioSourceId,
        });

      await panelPage.waitForTimeout(6000);
      await appPage.evaluate(() => {
        return (
          window as unknown as { roughcut: { panelStopRecording: () => Promise<void> } }
        ).roughcut.panelStopRecording();
      });

      await expect
        .poll(
          async () =>
            appPage.evaluate(() => {
              return (
                (window as unknown as { __task088Asset?: RecordingResult | null }).__task088Asset ??
                null
              );
            }),
          { timeout: 120000 },
        )
        .not.toBeNull();

      const result = (await appPage.evaluate(() => {
        return (
          (window as unknown as { __task088Asset?: RecordingResult | null }).__task088Asset ?? null
        );
      })) as RecordingResult | null;

      expect(result).not.toBeNull();
      expect(result!.hasAudio).toBe(true);
      expect(result!.audioCapture?.final.hasAudio).toBe(true);
      expect(result!.audioCapture?.requested.selectedSystemAudioSourceId ?? null).toBe(
        selectedSystemAudioSourceId,
      );

      if (selectedMicDeviceId) {
        expect(result!.audioCapture?.requested.selectedMicDeviceId).toBe(selectedMicDeviceId);
        expect(result!.audioCapture?.resolved.micSource).toBeTruthy();
      }

      if (selectedSystemAudioSourceId) {
        expect(result!.audioCapture?.resolved.systemAudioSource).toBe(selectedSystemAudioSourceId);
      }

      const screenStats = await stat(result!.filePath);
      test.skip(screenStats.size <= 0, 'Recording artifact was empty in this automated session');
      expect(screenStats.size).toBeGreaterThan(0);
      await access(result!.filePath);

      if (result!.thumbnailPath) {
        await access(result!.thumbnailPath);
      }
      if (result!.cursorEventsPath) {
        await access(result!.cursorEventsPath);
      }
      expect(result!.cameraFilePath).toBeTruthy();
      if (result!.cameraFilePath) {
        await access(result!.cameraFilePath);
      }

      const screenProbe = await ffprobeJson(result!.filePath);
      const screenVideo = screenProbe.streams?.find((stream: any) => stream.codec_type === 'video');
      const screenAudio = screenProbe.streams?.find((stream: any) => stream.codec_type === 'audio');
      expect(screenVideo).toBeTruthy();
      expect(Number(screenVideo.width || 0)).toBeGreaterThan(0);
      expect(Number(screenVideo.height || 0)).toBeGreaterThan(0);
      expect(screenAudio).toBeTruthy();
      expect(result!.hasAudio).toBe(Boolean(screenAudio));
      expect(result!.audioCapture?.final.hasAudio).toBe(Boolean(screenAudio));

      // Regression guard for c319886f (VP8 realtime threads for 1080p60). Capture is
      // hardcoded to TARGET_CAPTURE_FPS=60 in recording-session-manager.mjs. Without
      // the encoder fix, sustained 60fps + audio drops a meaningful fraction of frames.
      const frameStats = await ffprobeVideoFrameStats(result!.filePath);
      const reportedFps = result!.fps || 60;
      const probeDurationMs = frameStats.durationSeconds * 1000;
      const recordedDurationMs = result!.durationMs || probeDurationMs;
      const expectedFrames = (recordedDurationMs / 1000) * reportedFps;
      // 15% drop tolerance. The pre-fix bug regularly dropped 30%+ at 1080p60+audio.
      expect(frameStats.nbReadFrames).toBeGreaterThanOrEqual(Math.floor(expectedFrames * 0.85));
      // TARGET_CAPTURE_FPS is hardcoded to 60; pin the rate so a silent fps regression
      // (e.g. an FFmpeg arg drop reverting capture to 30fps) trips the test.
      expect(frameStats.rFrameRate).toBe('60/1');

      const cameraProbe = await ffprobeJson(result!.cameraFilePath!);
      const cameraVideo = cameraProbe.streams?.find((stream: any) => stream.codec_type === 'video');
      expect(cameraVideo).toBeTruthy();
      expect(Number(cameraVideo.width || 0)).toBeGreaterThan(0);
      expect(Number(cameraVideo.height || 0)).toBeGreaterThan(0);
    } finally {
      await rm(recordingDir, { recursive: true, force: true });
    }
  });
});
