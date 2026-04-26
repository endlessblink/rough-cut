import { test, expect, navigateToTab } from './fixtures/electron-app.js';
import type { Page } from '@playwright/test';
import { copyFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PLAYBACK_PROJECT_PATH } from './fixtures/playback-fixture.js';

const DEFAULT_CAMERA_PROJECT_PATH = '/home/endlessblink/Documents/Rough Cut/Recording Apr 23 2026 - 2303.roughcut';

const SOURCE_PROJECT_PATH =
  process.env.ROUGH_CUT_SESSION_PATH && existsSync(process.env.ROUGH_CUT_SESSION_PATH)
    ? process.env.ROUGH_CUT_SESSION_PATH
    : existsSync(DEFAULT_CAMERA_PROJECT_PATH)
      ? DEFAULT_CAMERA_PROJECT_PATH
      : PLAYBACK_PROJECT_PATH;

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
    // Fixture project has at least one screen recording; exact track counts vary
    // between local fixture recordings, so assert append deltas below.
    expect(initial.assetCount).toBeGreaterThanOrEqual(1);
    expect(initial.primaryVideoClipCount).toBeGreaterThanOrEqual(1);
    expect(initial.duration).toBeGreaterThan(0);
    const initialDuration = initial.duration;
    const initialAssetCount = initial.assetCount;
    const initialAudioClipCount = initial.audioClipCount;
    const initialPrimaryClipCount = initial.primaryVideoClipCount;

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

    await fireRecordingAssetReady(electronApp, fake);

    await expect
      .poll(async () => (await readProjectSnapshot(appPage)).assetCount, { timeout: 30_000 })
      .toBe(initialAssetCount + 1);

    const after = await readProjectSnapshot(appPage);
    expect(after.assetCount).toBe(initialAssetCount + 1);
    expect(after.primaryVideoClipCount).toBe(initialPrimaryClipCount + 1);
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

  test('append with camera attaches a new PiP clip to the secondary video track', async ({
    electronApp,
    appPage,
  }) => {
    const firstFilePath = await loadRecordedProject(appPage, tempProjectPath);

    const initial = await readProjectSnapshot(appPage);
    expect(initial.cameraAssetCount).toBeGreaterThanOrEqual(1);
    expect(initial.secondaryVideoClipCount).toBeGreaterThanOrEqual(1);
    const initialDuration = initial.duration;
    const initialAssetCount = initial.assetCount;
    const initialCameraAssetCount = initial.cameraAssetCount;
    const initialPrimaryClipCount = initial.primaryVideoClipCount;
    const initialSecondaryClipCount = initial.secondaryVideoClipCount;

    const fake: FakeRecordingResult = {
      filePath: `${firstFilePath}.take2-synth-camera.webm`,
      durationFrames: 90,
      durationMs: 3000,
      width: 1920,
      height: 1080,
      fps: 30,
      codec: 'vp8',
      fileSize: 1,
      hasAudio: true,
      thumbnailPath: null,
      cursorEventsPath: null,
      cameraFilePath: `${firstFilePath}.take2-synth-camera.cam.mp4`,
    };

    await fireRecordingAssetReady(electronApp, fake);

    // Append should grow the primary track by 1, secondary (camera) track by 1,
    // and assets by 2 (one recording + one camera).
    await appPage.waitForFunction(
      (expected) => {
        const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
        return stores?.project.getState().project.assets.length >= expected;
      },
      initialAssetCount + 2,
      { timeout: 10_000 },
    );

    const after = await readProjectSnapshot(appPage);
    expect(after.assetCount).toBe(initialAssetCount + 2);
    expect(after.cameraAssetCount).toBe(initialCameraAssetCount + 1);
    expect(after.primaryVideoClipCount).toBe(initialPrimaryClipCount + 1);
    expect(after.secondaryVideoClipCount).toBe(initialSecondaryClipCount + 1);

    const newPrimary = after.primaryVideoClips[after.primaryVideoClips.length - 1];
    const newSecondary = after.secondaryVideoClips[after.secondaryVideoClips.length - 1];
    expect(newPrimary).toBeDefined();
    expect(newSecondary).toBeDefined();

    const expectedOutFrame = initialDuration + Math.round((fake.durationMs / 1000) * fake.fps);
    expect(newPrimary!.timelineIn).toBe(initialDuration);
    expect(newPrimary!.timelineOut).toBe(expectedOutFrame);
    expect(newSecondary!.timelineIn).toBe(initialDuration);
    expect(newSecondary!.timelineOut).toBe(expectedOutFrame);

    // Camera clip must carry the PiP transform (bottom-right 20%).
    expect(newSecondary!.transform).not.toBeNull();
    expect(newSecondary!.transform!.x).toBeCloseTo(0.78, 5);
    expect(newSecondary!.transform!.y).toBeCloseTo(0.78, 5);
    expect(newSecondary!.transform!.scaleX).toBeCloseTo(0.2, 5);
    expect(newSecondary!.transform!.scaleY).toBeCloseTo(0.2, 5);

    // The two camera clips sit on the same secondary track, sequential.
    const firstSecondary = after.secondaryVideoClips[0];
    expect(firstSecondary!.timelineOut).toBeLessThanOrEqual(newSecondary!.timelineIn);
  });

  test('replace branch creates a fresh project when no assets exist', async ({
    electronApp,
    appPage,
  }) => {
    await navigateToTab(appPage, 'record');

    // App's initial mount seeds a default project with 0 assets and no file.
    const initial = await readProjectSnapshot(appPage);
    expect(initial.assetCount).toBe(0);
    expect(initial.projectFilePath).toBeNull();
    const initialProjectId = initial.projectId;

    // Record the pre-existing set of .roughcut files so we can identify the
    // one auto-save writes for this test and remove only that one.
    const preSaveFiles = await listRoughcutFiles(appPage);

    const fake: FakeRecordingResult = {
      filePath: '/tmp/rough-cut-e2e-synthetic-first-take.webm',
      durationFrames: 120,
      durationMs: 4000,
      width: 1920,
      height: 1080,
      fps: 30,
      codec: 'vp8',
      fileSize: 1,
      hasAudio: true,
      thumbnailPath: null,
      cursorEventsPath: null,
    };

    await fireRecordingAssetReady(electronApp, fake);

    await appPage.waitForFunction(
      () => {
        const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
        return stores?.project.getState().project.assets.length === 1;
      },
      null,
      { timeout: 10_000 },
    );

    const after = await readProjectSnapshot(appPage);
    expect(after.projectId).not.toBe(initialProjectId);
    expect(after.assetCount).toBe(1);
    expect(after.primaryVideoClipCount).toBe(1);
    expect(after.audioClipCount).toBe(1);

    const onlyClip = after.primaryVideoClips[0];
    expect(onlyClip).toBeDefined();
    expect(onlyClip!.timelineIn).toBe(0);
    const expectedOutFrame = Math.round((fake.durationMs / 1000) * fake.fps);
    expect(onlyClip!.timelineOut).toBe(expectedOutFrame);

    expect(after.duration).toBe(expectedOutFrame);
    expect(after.activeAssetId).not.toBeNull();

    // Wait for the fire-and-forget auto-save to settle, then clean up the
    // file + recent-projects entry we just created.
    await appPage.waitForFunction(
      () => {
        const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
        return typeof stores?.project.getState().projectFilePath === 'string';
      },
      null,
      { timeout: 10_000 },
    );
    const savedPath = await appPage.evaluate(() => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      return stores?.project.getState().projectFilePath as string;
    });

    expect(savedPath).toBeTruthy();
    // Only unlink if this test actually created the file (not pre-existing).
    if (!preSaveFiles.includes(savedPath) && existsSync(savedPath)) {
      try {
        unlinkSync(savedPath);
      } catch {
        /* ignore */
      }
      const thumbPath = savedPath.replace(/\.roughcut$/, '-thumb.jpg');
      if (existsSync(thumbPath)) {
        try {
          unlinkSync(thumbPath);
        } catch {
          /* ignore */
        }
      }
    }
    await appPage.evaluate((path) => {
      return (
        window as unknown as { roughcut: { recentProjectsRemove: (p: string) => Promise<void> } }
      ).roughcut.recentProjectsRemove(path);
    }, savedPath);
  });

  test('fresh recording import prefers durationFrames when durationMs is stale', async ({
    electronApp,
    appPage,
  }) => {
    await navigateToTab(appPage, 'record');

    const initial = await readProjectSnapshot(appPage);
    expect(initial.assetCount).toBe(0);
    expect(initial.projectFilePath).toBeNull();

    const fake: FakeRecordingResult = {
      filePath: '/tmp/rough-cut-e2e-synthetic-duration-truth.webm',
      durationFrames: 270,
      durationMs: 3000,
      width: 1920,
      height: 1080,
      fps: 30,
      codec: 'vp8',
      fileSize: 1,
      hasAudio: true,
      thumbnailPath: null,
      cursorEventsPath: null,
    };

    await fireRecordingAssetReady(electronApp, fake);

    await appPage.waitForFunction(
      () => {
        const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
        return stores?.project.getState().project.assets.length === 1;
      },
      null,
      { timeout: 10_000 },
    );

    const after = await readProjectSnapshot(appPage);
    expect(after.assetCount).toBe(1);
    expect(after.primaryVideoClipCount).toBe(1);
    expect(after.audioClipCount).toBe(1);

    const onlyClip = after.primaryVideoClips[0];
    expect(onlyClip).toBeDefined();
    expect(onlyClip!.timelineIn).toBe(0);
    expect(onlyClip!.timelineOut).toBe(fake.durationFrames);
    expect(after.duration).toBe(fake.durationFrames);

    const activeAsset = await appPage.evaluate(() => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      const state = stores?.project.getState();
      return state?.project.assets.find((asset: any) => asset.id === state.activeAssetId) ?? null;
    });
    expect(activeAsset?.duration).toBe(fake.durationFrames);
  });

  test('imported project state stays silent when the final result has no audio', async ({
    electronApp,
    appPage,
  }) => {
    await navigateToTab(appPage, 'record');

    const fake: FakeRecordingResult = {
      filePath: '/tmp/rough-cut-e2e-synthetic-silent-take.webm',
      durationFrames: 120,
      durationMs: 4000,
      width: 1920,
      height: 1080,
      fps: 30,
      codec: 'vp8',
      fileSize: 1,
      hasAudio: false,
      thumbnailPath: null,
      cursorEventsPath: null,
    };

    await fireRecordingAssetReady(electronApp, fake);

    await appPage.waitForFunction(
      () => {
        const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
        return stores?.project.getState().project.assets.length === 1;
      },
      null,
      { timeout: 10_000 },
    );

    const after = await readProjectSnapshot(appPage);
    expect(after.assetCount).toBe(1);
    expect(after.primaryVideoClipCount).toBe(1);
    expect(after.audioClipCount).toBe(0);
  });
});

async function listRoughcutFiles(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const rough = (window as unknown as { roughcut: any }).roughcut;
    const entries = (await rough.recentProjectsGet()) as Array<{ filePath: string }>;
    return entries.map((e) => e.filePath);
  });
}

async function loadRecordedProject(page: Page, projectPath: string): Promise<string> {
  await navigateToTab(page, 'record');

  const project = (await page.evaluate((filePath) => {
    return (
      window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
    ).roughcut.projectOpenPath(filePath);
  }, projectPath)) as Record<string, any>;

  const recording = project.assets.find(
    (asset: any) => asset.type === 'recording' && asset.metadata?.isCamera !== true,
  );
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

interface SnapshotClip {
  id: string;
  assetId: string;
  timelineIn: number;
  timelineOut: number;
  transform: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
  } | null;
}

interface ProjectSnapshot {
  projectId: string | null;
  projectFilePath: string | null;
  assetCount: number;
  duration: number;
  activeAssetId: string | null;
  primaryVideoClipCount: number;
  secondaryVideoClipCount: number;
  audioClipCount: number;
  primaryVideoClips: SnapshotClip[];
  secondaryVideoClips: SnapshotClip[];
  cameraAssetCount: number;
}

async function readProjectSnapshot(page: Page): Promise<ProjectSnapshot> {
  return page.evaluate(() => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    const state = stores?.project.getState();
    const project = state?.project;
    const tracks = project?.composition?.tracks ?? [];
    const videoTracks = tracks
      .filter((t: any) => t.type === 'video')
      .sort((a: any, b: any) => b.index - a.index);
    const primaryVideoTrack = videoTracks[0];
    const secondaryVideoTrack = videoTracks.find((t: any) => t.id !== primaryVideoTrack?.id);
    const audioTrack = tracks.find((t: any) => t.type === 'audio');

    const mapClip = (c: any) => ({
      id: c.id,
      assetId: c.assetId,
      timelineIn: c.timelineIn,
      timelineOut: c.timelineOut,
      transform: c.transform
        ? {
            x: c.transform.x,
            y: c.transform.y,
            scaleX: c.transform.scaleX,
            scaleY: c.transform.scaleY,
          }
        : null,
    });

    const primaryVideoClips = (primaryVideoTrack?.clips ?? [])
      .map(mapClip)
      .sort((a: SnapshotClip, b: SnapshotClip) => a.timelineIn - b.timelineIn);
    const secondaryVideoClips = (secondaryVideoTrack?.clips ?? [])
      .map(mapClip)
      .sort((a: SnapshotClip, b: SnapshotClip) => a.timelineIn - b.timelineIn);

    return {
      projectId: project?.id ?? null,
      projectFilePath: state?.projectFilePath ?? null,
      assetCount: project?.assets?.length ?? 0,
      duration: project?.composition?.duration ?? 0,
      activeAssetId: state?.activeAssetId ?? null,
      primaryVideoClipCount: primaryVideoTrack?.clips?.length ?? 0,
      secondaryVideoClipCount: secondaryVideoTrack?.clips?.length ?? 0,
      audioClipCount: audioTrack?.clips?.length ?? 0,
      primaryVideoClips,
      secondaryVideoClips,
      cameraAssetCount: (project?.assets ?? []).filter(
        (a: any) => a?.metadata?.isCamera === true,
      ).length,
    };
  });
}

async function stubProjectAutoSave(page: Page, stubPath: string): Promise<void> {
  await page.evaluate((path) => {
    const rough = (window as unknown as { roughcut?: any }).roughcut;
    if (rough) {
      rough.projectAutoSave = async () => path;
    }
  }, stubPath);
}

async function fireRecordingAssetReady(
  electronApp: import('@playwright/test').ElectronApplication,
  payload: FakeRecordingResult,
): Promise<void> {
  await electronApp.evaluate(async ({ BrowserWindow }, p) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents && !w.isDestroyed());
    if (!win) throw new Error('No BrowserWindow available to emit RECORDING_ASSET_READY');
    win.webContents.send('recording:asset-ready', p);
  }, payload);
}
