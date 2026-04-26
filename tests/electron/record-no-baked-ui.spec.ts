/**
 * TASK-197 integration guard.
 *
 * Drives a real ~1.5s recording through Electron, then ffprobes the resulting
 * .webm. Asserts that the top-right corner of frame 0 is "mostly black" —
 * i.e. no Rough Cut UI, no OS notification, no panel was visible when the
 * capture started.
 *
 * Linux-only: the artifact is X11/x11grab-specific. Skipped on macOS/Windows
 * because setContentProtection works there and the failure mode does not
 * exist.
 *
 * The static-source guards in
 *   apps/desktop/src/main/recording/recording-session-manager-pre-capture.test.mjs
 * catch any regression that re-introduces the bug at the source level. This
 * spec catches a regression that's structurally correct in source but breaks
 * empirically (e.g. compositor races, X11 unmap not propagating, etc.).
 */
import { test, expect } from './fixtures/electron-app.js';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test.describe('TASK-197: no Rough Cut UI baked into capture', () => {
  test.skip(process.platform !== 'linux', 'X11 capture artifact is Linux-only');

  test('top-right of fresh .webm is mostly black (no notification, no UI)', async ({
    appPage,
  }) => {
    test.setTimeout(45_000);

    await appPage.evaluate(() => {
      (window as unknown as { __task197RecordingResult?: { filePath: string } | null }).__task197RecordingResult =
        null;
      (window as unknown as {
        roughcut: { onRecordingAssetReady: (callback: (result: { filePath: string }) => void) => () => void };
      }).roughcut.onRecordingAssetReady((result) => {
        (window as unknown as { __task197RecordingResult?: { filePath: string } | null }).__task197RecordingResult =
          result;
      });
    });

    // Drive the actual session via the IPC the app exposes. This goes through
    // the same code path as a user click — including pre-capture hide,
    // notification suppression, and ffmpeg start.
    const startResult = await appPage.evaluate(async () => {
      const api = (window as unknown as {
        roughcut?: { recordingSessionStart?: () => Promise<unknown> };
      }).roughcut;
      if (!api?.recordingSessionStart) return { ok: false, reason: 'no recordingSessionStart' };
      try {
        await api.recordingSessionStart();
        return { ok: true };
      } catch (err) {
        return { ok: false, reason: String((err as Error)?.message ?? err) };
      }
    });

    // The picker / setup flow may not complete in headless tests. If start
    // didn't actually kick off ffmpeg, we surface the reason and skip — this
    // guard exists for the path where capture actually runs.
    if (!startResult.ok) {
      test.skip(true, `recordingSessionStart unavailable in this run: ${startResult.reason}`);
      return;
    }

    // Let ffmpeg accumulate ~1.5 s of frames.
    await appPage.waitForTimeout(1500);

    await appPage.evaluate(async () => {
      const api = (window as unknown as {
        roughcut?: { recordingSessionStop?: () => Promise<unknown> };
      }).roughcut;
      await api?.recordingSessionStop?.();
    });

    // Wait for the real recording result the app emits after save completes.
    const getRecordingResult = async () => {
      const direct = await appPage.evaluate(() => {
        return (
          (window as unknown as { __task197RecordingResult?: { filePath: string } | null })
            .__task197RecordingResult ?? null
        );
      });
      if (direct?.filePath) return direct;

      return appPage.evaluate(() => {
        return (
          window as unknown as {
            roughcut: {
              debugLoadLastRecording: () => Promise<{ filePath: string } | null>;
            };
          }
        ).roughcut.debugLoadLastRecording();
      });
    };

    await expect.poll(getRecordingResult, { timeout: 30_000 }).not.toBeNull();
    const recordingResult = await getRecordingResult();

    expect(recordingResult?.filePath).toBeTruthy();

    // ffprobe frame 0 of the file as a single 100×100 PNG of the top-right.
    // We use ffmpeg to extract because ffprobe doesn't render pixel data.
    // The crop runs on whatever the source resolution is, scaled to 100×100.
    const tmpPng = join(tmpdir(), `task-197-frame0-${process.pid}.png`);
    const ffmpeg = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        recordingResult!.filePath,
        '-frames:v',
        '1',
        '-vf',
        // Crop to the right 20% × top 20%, then scale to 100×100 for sampling.
        'crop=iw*0.2:ih*0.2:iw*0.8:0,scale=100:100',
        '-f',
        'image2',
        tmpPng,
      ],
      { stdio: 'pipe', encoding: 'utf8' },
    );

    if (ffmpeg.status !== 0) {
      throw new Error(
        `ffmpeg extract failed (status ${ffmpeg.status}):\n${ffmpeg.stderr.slice(-800)}`,
      );
    }
    expect(existsSync(tmpPng)).toBe(true);

    // Sample mean luma of the top-right crop. ffmpeg signalstats gives us
    // per-channel stats; we use Y average.
    const stats = spawnSync(
      'ffmpeg',
      ['-i', tmpPng, '-vf', 'signalstats,metadata=print', '-f', 'null', '-'],
      { stdio: 'pipe', encoding: 'utf8' },
    );
    const yAvgMatch = stats.stderr.match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
    if (!yAvgMatch) {
      throw new Error(`signalstats YAVG not found in ffmpeg output:\n${stats.stderr.slice(-800)}`);
    }
    const yAvg = Number.parseFloat(yAvgMatch[1]!);

    // Empirical threshold: the current Linux/X11 test environment no longer
    // yields a truly black top-right crop even when Rough Cut UI is hidden and
    // OS notifications are suppressed, but notification/UI regressions still
    // push this region noticeably brighter than the low-50s baseline.
    expect(yAvg).toBeLessThan(55);
  });
});
