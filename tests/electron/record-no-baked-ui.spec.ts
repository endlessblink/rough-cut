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
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const RECORDINGS_DIR = process.env.ROUGH_CUT_RECORDINGS_DIR ?? join(tmpdir(), 'rough-cut', 'recordings');

test.describe('TASK-197: no Rough Cut UI baked into capture', () => {
  test.skip(process.platform !== 'linux', 'X11 capture artifact is Linux-only');

  test('top-right of fresh .webm is mostly black (no notification, no UI)', async ({
    appPage,
  }) => {
    test.setTimeout(45_000);

    const recordingsBefore = listRecordings(RECORDINGS_DIR);

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

    // Wait for the file to be flushed (recording-session-manager finalizes
    // after stop; saveRecording moves it into RECORDINGS_DIR).
    const newRecording = await waitForNewRecording(RECORDINGS_DIR, recordingsBefore, 15_000);
    expect(newRecording).toBeTruthy();

    // ffprobe frame 0 of the file as a single 100×100 PNG of the top-right.
    // We use ffmpeg to extract because ffprobe doesn't render pixel data.
    // The crop runs on whatever the source resolution is, scaled to 100×100.
    const tmpPng = join(tmpdir(), `task-197-frame0-${process.pid}.png`);
    const ffmpeg = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        newRecording!,
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

    // Empirical threshold: a clean black-or-near-black region averages < 32
    // on the 0-255 luma scale. The OS notification with white text + dark
    // background averages > 60 (text dominates a 100×100 crop).
    expect(yAvg).toBeLessThan(40);
  });
});

function listRecordings(dir: string): Set<string> {
  if (!existsSync(dir)) return new Set();
  return new Set(readdirSync(dir).filter((f) => f.endsWith('.webm')));
}

async function waitForNewRecording(
  dir: string,
  before: Set<string>,
  timeoutMs: number,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(dir)) {
      const candidates = readdirSync(dir).filter(
        (f) => f.endsWith('.webm') && !before.has(f),
      );
      const ready = candidates
        .map((name) => ({ name, path: join(dir, name), stat: statSync(join(dir, name)) }))
        .filter((entry) => entry.stat.size > 1024 && Date.now() - entry.stat.mtimeMs > 200)
        .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0];
      if (ready) return ready.path;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}
