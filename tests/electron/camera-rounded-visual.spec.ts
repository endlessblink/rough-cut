import { test, expect, navigateToTab } from './fixtures/electron-app.js';
import type { CameraAspectRatio } from '@rough-cut/project-model';
import { copyFileSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SOURCE_PROJECT_PATH =
  process.env.ROUGH_CUT_SESSION_PATH ??
  '/home/endlessblink/Documents/Rough Cut/Recording Apr 14 2026 - 1825.roughcut';
let recordedProjectPath = SOURCE_PROJECT_PATH;

const RECORD_CAMERA_VIDEO = '[data-testid="camera-playback-video"]';
const RECORD_CAMERA_FRAME = '[data-testid="record-camera-frame"]';

test.beforeEach(() => {
  recordedProjectPath = join(
    dirname(SOURCE_PROJECT_PATH),
    `rough-cut-rounded-camera-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.roughcut`,
  );
  copyFileSync(SOURCE_PROJECT_PATH, recordedProjectPath);
});

test.afterEach(() => {
  if (!recordedProjectPath || recordedProjectPath === SOURCE_PROJECT_PATH) return;
  if (!existsSync(recordedProjectPath)) return;
  try {
    unlinkSync(recordedProjectPath);
  } catch {
    // Best-effort cleanup only; failed deletion should not mask test results.
  }
});

test('rounded camera stays a rounded square at max roundness for 1:1', async ({ appPage }) => {
  test.setTimeout(45_000);
  const metrics = await assertRoundedCameraVisual(appPage, '1:1');
  expect(Math.abs(metrics.width - metrics.height)).toBeLessThan(2);
});

test('rounded camera keeps restrained corners at max roundness for 16:9', async ({ appPage }) => {
  test.setTimeout(45_000);
  const metrics = await assertRoundedCameraVisual(appPage, '16:9');
  expect(metrics.width).toBeGreaterThan(metrics.height * 1.4);
});

test('camera aspect control updates a saved camera frame override', async ({ appPage }) => {
  test.setTimeout(45_000);

  await navigateToTab(appPage, 'record');

  const project = (await appPage.evaluate(
    (projectPath) =>
      (
        window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
      ).roughcut.projectOpenPath(projectPath),
    recordedProjectPath,
  )) as Record<string, any>;

  const recording = project.assets.find(
    (asset: any) => asset.type === 'recording' && asset.metadata?.isCamera !== true,
  );
  expect(recording).toBeTruthy();

  await appPage.evaluate(
    ({ nextProject, projectPath, activeAssetId }) => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      const patchedProject = {
        ...nextProject,
        assets: nextProject.assets.map((asset: any) =>
          asset.id === activeAssetId
            ? {
                ...asset,
                presentation: {
                  ...(asset.presentation ?? {}),
                  templateId: 'presentation-16x9',
                  cameraFrame: { x: 0.72, y: 0.72, w: 0.2, h: 0.2 },
                  camera: {
                    ...(asset.presentation?.camera ?? {}),
                    visible: true,
                    shape: 'square',
                    aspectRatio: '1:1',
                    size: 100,
                    position: 'corner-br',
                  },
                },
              }
            : asset,
        ),
      };

      stores?.project.getState().setProject(patchedProject);
      stores?.project.getState().setProjectFilePath(projectPath);
      stores?.project.getState().setActiveAssetId(activeAssetId);
      stores?.transport.getState().seekToFrame(0);
    },
    {
      nextProject: project,
      projectPath: recordedProjectPath,
      activeAssetId: recording?.id ?? null,
    },
  );

  await appPage.locator(RECORD_CAMERA_FRAME).waitFor({ state: 'visible', timeout: 30_000 });

  const before = await getFrameMetrics(appPage);
  expect(before.width).toBeGreaterThan(before.height);

  await appPage.locator(RECORD_CAMERA_FRAME).click();
  await appPage.locator('button', { hasText: '9:16' }).first().click();
  await appPage.waitForTimeout(300);

  const after = await getFrameMetrics(appPage);
  expect(after.width).toBeLessThan(before.width);
  expect(after.height).toBeGreaterThan(after.width * 1.4);
});

async function assertRoundedCameraVisual(
  appPage: import('@playwright/test').Page,
  aspectRatio: CameraAspectRatio,
) {
  await navigateToTab(appPage, 'record');

  const project = (await appPage.evaluate(
    (projectPath) =>
      (
        window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
      ).roughcut.projectOpenPath(projectPath),
    recordedProjectPath,
  )) as Record<string, any>;

  const recording = project.assets.find(
    (asset: any) => asset.type === 'recording' && asset.metadata?.isCamera !== true,
  );
  expect(recording).toBeTruthy();

  await appPage.evaluate(
    ({ nextProject, projectPath, activeAssetId, aspectRatio }) => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      const patchedProject = {
        ...nextProject,
        assets: nextProject.assets.map((asset: any) =>
          asset.id === activeAssetId
            ? {
                ...asset,
                presentation: {
                  ...(asset.presentation ?? {}),
                  templateId: 'presentation-16x9',
                  camera: {
                    ...(asset.presentation?.camera ?? {}),
                    visible: true,
                    shape: 'rounded',
                    aspectRatio,
                    roundness: 100,
                    padding: 0,
                    inset: 0,
                    shadowEnabled: false,
                    size: 100,
                    position: 'corner-br',
                  },
                  cameraFrame: aspectRatio === '1:1'
                    ? { x: 0.76375, y: 0.70, w: 0.1125, h: 0.2 }
                    : { x: 0.64, y: 0.72, w: 0.28, h: 0.16 },
                },
              }
            : asset,
        ),
      };

      stores?.project.getState().setProject(patchedProject);
      stores?.project.getState().setProjectFilePath(projectPath);
      stores?.project.getState().setActiveAssetId(activeAssetId);
      stores?.transport.getState().seekToFrame(0);
    },
    {
      nextProject: project,
      projectPath: recordedProjectPath,
      activeAssetId: recording?.id ?? null,
      aspectRatio,
    },
  );

  await appPage.locator(RECORD_CAMERA_FRAME).waitFor({ state: 'visible', timeout: 30_000 });
  await appPage.waitForTimeout(400);

  const metrics = await appPage.evaluate((selector) => {
    const frame = document.querySelector(selector) as HTMLElement | null;
    if (!frame) return null;
    const rect = frame.getBoundingClientRect();
    const styles = window.getComputedStyle(frame);
    return {
      width: rect.width,
      height: rect.height,
      borderTopLeftRadius: Number.parseFloat(styles.borderTopLeftRadius),
    };
  }, RECORD_CAMERA_FRAME);

  expect(metrics).not.toBeNull();
  if (!metrics) return;

  expect(metrics.width).toBeGreaterThan(50);
  expect(metrics.height).toBeGreaterThan(50);
  expect(metrics.borderTopLeftRadius).toBeGreaterThan(0);
  expect(metrics.borderTopLeftRadius).toBeLessThan(Math.min(metrics.width, metrics.height) / 2);
  return metrics;
}

async function getFrameMetrics(appPage: import('@playwright/test').Page) {
  const metrics = await appPage.evaluate((selector) => {
    const frame = document.querySelector(selector) as HTMLElement | null;
    if (!frame) return null;
    const rect = frame.getBoundingClientRect();
    const styles = window.getComputedStyle(frame);
    return {
      width: rect.width,
      height: rect.height,
      borderTopLeftRadius: Number.parseFloat(styles.borderTopLeftRadius),
    };
  }, RECORD_CAMERA_FRAME);

  expect(metrics).not.toBeNull();
  if (!metrics) throw new Error('Expected measurable camera frame');
  return metrics;
}
