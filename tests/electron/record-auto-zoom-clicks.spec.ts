/**
 * TASK-129: Auto-zoom markers from click events
 *
 * Verifies that after a recording stops, the main process reads the cursor NDJSON
 * sidecar and generates `kind: 'auto'` zoom markers in the zoom sidecar file.
 *
 * Uses the DEBUG_APPLY_AUTO_ZOOM IPC handler to trigger generation without running
 * a real recording session (no camera / MediaRecorder / countdown involved).
 */

import { test, expect } from './fixtures/electron-app.js';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCursorNdjson(
  clicks: Array<{ frame: number; x: number; y: number }>,
): string {
  return clicks
    .map(({ frame, x, y }) =>
      JSON.stringify({ frame, x, y, type: 'down', button: 0 }),
    )
    .join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('TASK-129: Auto-zoom from cursor clicks', () => {
  test('generates auto markers from isolated clicks', async ({ appPage }) => {
    const dir = await mkdtemp(join(tmpdir(), 'rc-autozoom-'));

    try {
      // Create a dummy .webm file (content doesn't matter — no probing in this path)
      const recordingPath = join(dir, 'recording-test.webm');
      await writeFile(recordingPath, Buffer.alloc(0));

      // Cursor NDJSON with two isolated clicks (> 2 s apart at 30fps → > 60 frames gap)
      const cursorPath = join(dir, 'recording-test.cursor.ndjson');
      const clicksNdjson = makeCursorNdjson([
        { frame: 30, x: 480, y: 270 },   // click at 1 s
        { frame: 180, x: 1440, y: 810 }, // click at 6 s (5 s gap → two separate clusters)
      ]);
      await writeFile(cursorPath, clicksNdjson, 'utf-8');

      // Call the debug IPC to generate auto-zoom and return the sidecar payload
      const sidecar = await appPage.evaluate(
        async ({ recordingPath, cursorPath }) => {
          const api = (window as unknown as { roughcut: any }).roughcut;
          return api.debugApplyAutoZoom({
            filePath: recordingPath,
            cursorEventsPath: cursorPath,
            fps: 30,
            width: 1920,
            height: 1080,
          });
        },
        { recordingPath, cursorPath },
      );

      // Sidecar must be written and parseable
      expect(sidecar).not.toBeNull();
      expect(Array.isArray(sidecar?.markers)).toBe(true);

      // Both clicks are far apart → 2 auto markers
      const autoMarkers = (sidecar.markers as any[]).filter((m: any) => m.kind === 'auto');
      expect(autoMarkers.length).toBeGreaterThanOrEqual(2);

      // All auto markers have valid fields
      for (const m of autoMarkers) {
        expect(m.kind).toBe('auto');
        expect(typeof m.startFrame).toBe('number');
        expect(typeof m.endFrame).toBe('number');
        expect(m.endFrame).toBeGreaterThan(m.startFrame);
        expect(m.focalPoint.x).toBeGreaterThanOrEqual(0);
        expect(m.focalPoint.x).toBeLessThanOrEqual(1);
        expect(m.focalPoint.y).toBeGreaterThanOrEqual(0);
        expect(m.focalPoint.y).toBeLessThanOrEqual(1);
        expect(m.strength).toBeGreaterThan(0);
        expect(m.strength).toBeLessThanOrEqual(1);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('clusters two clicks 0.5 s apart into a single marker', async ({ appPage }) => {
    const dir = await mkdtemp(join(tmpdir(), 'rc-autozoom-cluster-'));

    try {
      const recordingPath = join(dir, 'recording-cluster.webm');
      await writeFile(recordingPath, Buffer.alloc(0));

      const cursorPath = join(dir, 'recording-cluster.cursor.ndjson');
      // 0.5 s × 30 fps = 15 frames apart — within cluster window
      await writeFile(
        cursorPath,
        makeCursorNdjson([
          { frame: 60, x: 500, y: 400 },
          { frame: 75, x: 520, y: 410 },
        ]),
        'utf-8',
      );

      const sidecar = await appPage.evaluate(
        async ({ recordingPath, cursorPath }) => {
          const api = (window as unknown as { roughcut: any }).roughcut;
          return api.debugApplyAutoZoom({
            filePath: recordingPath,
            cursorEventsPath: cursorPath,
            fps: 30,
            width: 1920,
            height: 1080,
          });
        },
        { recordingPath, cursorPath },
      );

      expect(sidecar).not.toBeNull();
      const autoMarkers = (sidecar.markers as any[]).filter((m: any) => m.kind === 'auto');
      // Two nearby clicks → single merged marker
      expect(autoMarkers).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('manual marker overlapping a click cluster prevents auto marker creation', async ({
    appPage,
  }) => {
    const dir = await mkdtemp(join(tmpdir(), 'rc-autozoom-manual-'));

    try {
      const recordingPath = join(dir, 'recording-manual.webm');
      await writeFile(recordingPath, Buffer.alloc(0));

      const cursorPath = join(dir, 'recording-manual.cursor.ndjson');
      await writeFile(
        cursorPath,
        makeCursorNdjson([{ frame: 60, x: 960, y: 540 }]),
        'utf-8',
      );

      // Pre-write a zoom sidecar with a manual marker that overlaps frame 60
      // (auto-zoom at intensity=0.5, fps=30 produces a marker roughly [45, 105])
      const sidecarPath = recordingPath.replace(/\.webm$/, '.zoom.json');
      const manualMarker = {
        id: 'manual-1',
        startFrame: 30,
        endFrame: 120,
        kind: 'manual',
        strength: 1,
        focalPoint: { x: 0.5, y: 0.5 },
        zoomInDuration: 9,
        zoomOutDuration: 9,
      };
      await writeFile(
        sidecarPath,
        JSON.stringify({
          version: 1,
          autoIntensity: 0.5,
          followCursor: true,
          followAnimation: 'focused',
          followPadding: 0.18,
          autoFromClicks: true,
          markers: [manualMarker],
        }),
        'utf-8',
      );

      const sidecar = await appPage.evaluate(
        async ({ recordingPath, cursorPath }) => {
          const api = (window as unknown as { roughcut: any }).roughcut;
          return api.debugApplyAutoZoom({
            filePath: recordingPath,
            cursorEventsPath: cursorPath,
            fps: 30,
            width: 1920,
            height: 1080,
          });
        },
        { recordingPath, cursorPath },
      );

      expect(sidecar).not.toBeNull();
      // Manual marker is preserved
      const manuals = (sidecar.markers as any[]).filter((m: any) => m.kind === 'manual');
      expect(manuals).toHaveLength(1);
      // Auto marker overlapping the manual marker was skipped
      const autos = (sidecar.markers as any[]).filter((m: any) => m.kind === 'auto');
      expect(autos).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('autoFromClicks: false disables generation', async ({ appPage }) => {
    const dir = await mkdtemp(join(tmpdir(), 'rc-autozoom-disabled-'));

    try {
      const recordingPath = join(dir, 'recording-disabled.webm');
      await writeFile(recordingPath, Buffer.alloc(0));

      const cursorPath = join(dir, 'recording-disabled.cursor.ndjson');
      await writeFile(
        cursorPath,
        makeCursorNdjson([{ frame: 60, x: 960, y: 540 }]),
        'utf-8',
      );

      // Pre-write sidecar with autoFromClicks: false
      const sidecarPath = recordingPath.replace(/\.webm$/, '.zoom.json');
      await writeFile(
        sidecarPath,
        JSON.stringify({
          version: 1,
          autoIntensity: 0.5,
          followCursor: true,
          followAnimation: 'focused',
          followPadding: 0.18,
          autoFromClicks: false,
          markers: [],
        }),
        'utf-8',
      );

      const sidecar = await appPage.evaluate(
        async ({ recordingPath, cursorPath }) => {
          const api = (window as unknown as { roughcut: any }).roughcut;
          return api.debugApplyAutoZoom({
            filePath: recordingPath,
            cursorEventsPath: cursorPath,
            fps: 30,
            width: 1920,
            height: 1080,
          });
        },
        { recordingPath, cursorPath },
      );

      // Sidecar loaded from disk unchanged (no auto markers written)
      expect(sidecar).not.toBeNull();
      const autoMarkers = (sidecar.markers as any[]).filter((m: any) => m.kind === 'auto');
      expect(autoMarkers).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
