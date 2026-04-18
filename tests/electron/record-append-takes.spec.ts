import { test, expect, navigateToTab } from './fixtures/electron-app.js';
import type { Page } from '@playwright/test';
import { copyFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SOURCE_PROJECT_PATH =
  process.env.ROUGH_CUT_SESSION_PATH ??
  '/home/endlessblink/Documents/Rough Cut/Recording Apr 14 2026 - 1825.roughcut';

// Mirrors the RecordingResult payload shape that the main process normally
// sends over RECORDING_ASSET_READY — see apps/desktop/src/renderer/env.d.ts.
interface FakeRecordingResult {
  filePath: string;
  durationFrames: number;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  fileSize: number;
  hasAudio: boolean;
  thumbnailPath: string | null;
  cursorEventsPath: string | null;
  cameraFilePath?: string;
}

test.describe('Record append takes', () => {
  // Use a temp copy so handleRecordingComplete's auto-save can't mutate the
  // shared fixture file on disk.
  let tempProjectPath: string;

  test.beforeEach(() => {
    tempProjectPath = join(
      tmpdir(),
      `rough-cut-append-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.roughcut`,
    );
    copyFileSync(SOURCE_PROJECT_PATH, tempProjectPath);
  });

  test.afterEach(() => {
    if (tempProjectPath && existsSync(tempProjectPath)) {
      try {
        unlinkSync(tempProjectPath);
      } catch {
        /* ignore */
      }
    }
  });

  test('a second recording event appends to the open project', async ({ electronApp, appPage }) => {
    const firstFilePath = await loadRecordedProject(appPage, tempProjectPath);

    const initial = await readProjectSnapshot(appPage);
    // Fixture project has a screen recording plus a linked camera asset.
    expect(initial.assetCount).toBeGreaterThanOrEqual(1);
    expect(initial.primaryVideoClipCount).toBe(1);
    expect(initial.duration).toBeGreaterThan(0);
    const initialDuration = initial.duration;
    const initialAssetCount = initial.assetCount;
    const initialAudioClipCount = initial.audioClipCount;

    // Synthesize a second recording result. Different filePath defeats the
    // 15s dedup throttle in handleRecordingComplete; the file doesn't need
    // to exist on disk — the store mutations don't read it, and sidecar /
    // thumbnail helpers fail gracefully.
    const fake: FakeRecordingResult = {
      filePath: `${firstFilePath}.take2-synthetic.webm`,
      durationFrames: 150,
      durationMs: 5000,
      width: 1920,
      height: 1080,
      fps: 30,
      codec: 'vp8',
      fileSize: 1,
      hasAudio: true,
      thumbnailPath: null,
      cursorEventsPath: null,
    };

    await electronApp.evaluate(async ({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows().find((w) => w.webContents && !w.isDestroyed());
      if (!win) throw new Error('No BrowserWindow available to emit RECORDING_ASSET_READY');
      win.webContents.send('recording:asset-ready', payload);
    }, fake);

    // Wait for the store to reflect the append — asset count climbing to 2
    // is the simplest signal.
    await appPage.waitForFunction(
      (expected) => {
        const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
        return stores?.project.getState().project.assets.length >= expected;
      },
      initialAssetCount + 1,
      { timeout: 10_000 },
    );

    const after = await readProjectSnapshot(appPage);
    expect(after.assetCount).toBe(initialAssetCount + 1);
    expect(after.primaryVideoClipCount).toBe(2);
    expect(after.audioClipCount).toBe(initialAudioClipCount + 1);

    // New clip should sit right after the first one.
    const newestClip = after.primaryVideoClips[after.primaryVideoClips.length - 1];
    expect(newestClip).toBeDefined();
    expect(newestClip!.timelineIn).toBe(initialDuration);
    const expectedOutFrame = initialDuration + Math.round((fake.durationMs / 1000) * fake.fps);
    expect(newestClip!.timelineOut).toBe(expectedOutFrame);

    expect(after.duration).toBe(expectedOutFrame);
    expect(after.activeAssetId).not.toBeNull();
    expect(after.activeAssetId).not.toBe(initial.activeAssetId);
  });
});

async function loadRecordedProject(page: Page, projectPath: string): Promise<string> {
  await navigateToTab(page, 'record');

  const project = (await page.evaluate((filePath) => {
    return (
      window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
    ).roughcut.projectOpenPath(filePath);
  }, projectPath)) as Record<string, any>;

  const recording = project.assets.find((asset: any) => asset.type === 'recording');
  expect(recording).toBeTruthy();

  await page.evaluate(
    ({ nextProject, filePath, activeAssetId }) => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      stores?.project.getState().setProject(nextProject);
      stores?.project.getState().setProjectFilePath(filePath);
      stores?.project.getState().setActiveAssetId(activeAssetId);
      stores?.transport.getState().seekToFrame(0);
    },
    {
      nextProject: project,
      filePath: projectPath,
      activeAssetId: recording?.id ?? null,
    },
  );

  await page.waitForFunction(() => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    return stores?.project.getState().project.assets.length >= 1;
  });

  return recording.filePath as string;
}

interface ProjectSnapshot {
  assetCount: number;
  duration: number;
  activeAssetId: string | null;
  primaryVideoClipCount: number;
  audioClipCount: number;
  primaryVideoClips: Array<{
    id: string;
    assetId: string;
    timelineIn: number;
    timelineOut: number;
  }>;
}

async function readProjectSnapshot(page: Page): Promise<ProjectSnapshot> {
  return page.evaluate(() => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    const state = stores?.project.getState();
    const project = state?.project;
    const tracks = project?.composition?.tracks ?? [];
    const primaryVideoTrack = tracks.find((t: any) => t.type === 'video');
    const audioTrack = tracks.find((t: any) => t.type === 'audio');

    const primaryVideoClips = (primaryVideoTrack?.clips ?? [])
      .map((c: any) => ({
        id: c.id,
        assetId: c.assetId,
        timelineIn: c.timelineIn,
        timelineOut: c.timelineOut,
      }))
      .sort((a: any, b: any) => a.timelineIn - b.timelineIn);

    return {
      assetCount: project?.assets?.length ?? 0,
      duration: project?.composition?.duration ?? 0,
      activeAssetId: state?.activeAssetId ?? null,
      primaryVideoClipCount: primaryVideoTrack?.clips?.length ?? 0,
      audioClipCount: audioTrack?.clips?.length ?? 0,
      primaryVideoClips,
    };
  });
}
