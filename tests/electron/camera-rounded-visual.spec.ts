import { test, expect, navigateToTab } from './fixtures/electron-app.js';
import type { CameraAspectRatio } from '@rough-cut/project-model';

const RECORDED_PROJECT_PATH =
  process.env.ROUGH_CUT_SESSION_PATH ??
  '/home/endlessblink/Documents/Rough Cut/Recording Apr 14 2026 - 1825.roughcut';

const RECORD_CAMERA_VIDEO = '[data-testid="camera-playback-video"]';
const RECORD_CAMERA_FRAME = '[data-testid="record-camera-frame"]';

test('rounded camera stays a rounded square at max roundness for 1:1', async ({ appPage }) => {
  test.setTimeout(45_000);
  await assertRoundedCameraVisual(appPage, '1:1', 'camera-rounded-max-roundness-square.png');
});

test('rounded camera keeps restrained corners at max roundness for 16:9', async ({ appPage }) => {
  test.setTimeout(45_000);
  await assertRoundedCameraVisual(appPage, '16:9', 'camera-rounded-max-roundness-wide.png');
});

async function assertRoundedCameraVisual(
  appPage: import('@playwright/test').Page,
  aspectRatio: CameraAspectRatio,
  snapshotName: string,
) {
  await navigateToTab(appPage, 'record');

  const project = (await appPage.evaluate(
    (projectPath) =>
      (
        window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
      ).roughcut.projectOpenPath(projectPath),
    RECORDED_PROJECT_PATH,
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
      projectPath: RECORDED_PROJECT_PATH,
      activeAssetId: recording?.id ?? null,
      aspectRatio,
    },
  );

  await appPage.waitForFunction((selector) => {
    const video = document.querySelector(selector) as HTMLVideoElement | null;
    return video?.getAttribute('data-ready') === 'true';
  }, RECORD_CAMERA_VIDEO);
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

  expect(metrics.width).toBeGreaterThan(60);
  expect(metrics.height).toBeGreaterThan(60);
  expect(metrics.borderTopLeftRadius).toBeGreaterThan(0);
  expect(metrics.borderTopLeftRadius).toBeLessThan(Math.min(metrics.width, metrics.height) / 2);

  await expect(appPage.locator(RECORD_CAMERA_FRAME)).toHaveScreenshot(snapshotName, {
    animations: 'disabled',
    caret: 'hide',
  });
}
