import { test, expect, navigateToTab } from './fixtures/electron-app.js';

const EDIT_CAMERA_VIDEO = '[data-testid="edit-camera-playback-video"]';
const RECORDED_PROJECT_PATH =
  process.env.ROUGH_CUT_SESSION_PATH ??
  '/home/endlessblink/Documents/Rough Cut/Recording Apr 14 2026 - 1825.roughcut';

type PlaybackSample = {
  playheadFrame: number;
  cameraHash: number | null;
};

test('space starts edit playback from zoom slider focus without visual stutter', async ({ appPage }) => {
  test.setTimeout(45_000);

  await loadRecordedProjectIntoEdit(appPage);

  const zoomSlider = appPage.locator('[data-testid="edit-timeline"] input[type="range"]').first();
  await zoomSlider.click();
  await expect(zoomSlider).toBeFocused();

  const initialFrame = await appPage.evaluate(() => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    return stores?.transport.getState().playheadFrame ?? -1;
  });

  await appPage.keyboard.press('Space');

  await expect
    .poll(
      async () =>
        appPage.evaluate(() => {
          const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
          return {
            isPlaying: stores?.transport.getState().isPlaying ?? false,
            playheadFrame: stores?.transport.getState().playheadFrame ?? -1,
          };
        }),
      { timeout: 5_000 },
    )
    .toMatchObject({
      isPlaying: true,
    });

  const samples = await samplePlayback(appPage, 1_000, 180);
  const distinctPlayheadFrames = countDistinct(
    samples.map((sample) => sample.playheadFrame),
    1,
  );
  const distinctCameraHashes = countDistinct(
    samples.map((sample) => sample.cameraHash),
    1,
  );

  expect(samples.at(-1)?.playheadFrame ?? -1).toBeGreaterThan(initialFrame);
  expect(distinctPlayheadFrames).toBeGreaterThanOrEqual(3);
  expect(distinctCameraHashes).toBeGreaterThanOrEqual(2);

  const resumedSamples = await samplePlayback(appPage, 1_100, 80);
  const backwardSteps = countBackwardSteps(resumedSamples.map((sample) => sample.playheadFrame), 1);
  expect(backwardSteps).toBe(0);

  await zoomSlider.click();
  await appPage.keyboard.press('Space');
  await expect
    .poll(
      async () =>
        appPage.evaluate(() => {
          const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
          return stores?.transport.getState().isPlaying ?? true;
        }),
      { timeout: 5_000 },
    )
    .toBe(false);
});

test('space resume in edit playback stays visually monotonic after pause', async ({ appPage }) => {
  test.setTimeout(45_000);

  await loadRecordedProjectIntoEdit(appPage);

  const zoomSlider = appPage.locator('[data-testid="edit-timeline"] input[type="range"]').first();
  await zoomSlider.click();
  await expect(zoomSlider).toBeFocused();

  await appPage.keyboard.press('Space');
  await appPage.waitForTimeout(700);
  await appPage.keyboard.press('Space');

  await expect
    .poll(
      async () =>
        appPage.evaluate(() => {
          const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
          return {
            isPlaying: stores?.transport.getState().isPlaying ?? true,
            playheadFrame: stores?.transport.getState().playheadFrame ?? -1,
          };
        }),
      { timeout: 5_000 },
    )
    .toMatchObject({ isPlaying: false });

  const pausedFrame = await appPage.evaluate(() => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    return stores?.transport.getState().playheadFrame ?? -1;
  });

  await zoomSlider.click();
  await appPage.keyboard.press('Space');

  await expect
    .poll(
      async () =>
        appPage.evaluate(() => {
          const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
          return {
            isPlaying: stores?.transport.getState().isPlaying ?? false,
            playheadFrame: stores?.transport.getState().playheadFrame ?? -1,
          };
        }),
      { timeout: 5_000 },
    )
    .toMatchObject({ isPlaying: true });

  const resumedSamples = await samplePlayback(appPage, 1_200, 80);
  const backwardSteps = countBackwardSteps(resumedSamples.map((sample) => sample.playheadFrame), 1);
  expect(resumedSamples[0]?.playheadFrame ?? -1).toBeGreaterThanOrEqual(pausedFrame - 1);
  expect(resumedSamples.at(-1)?.playheadFrame ?? -1).toBeGreaterThan(pausedFrame);
  expect(backwardSteps).toBe(0);
});

async function loadRecordedProjectIntoEdit(page: import('@playwright/test').Page): Promise<void> {
  await navigateToTab(page, 'record');

  const project = (await page.evaluate(
    (projectPath) =>
      (
        window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
      ).roughcut.projectOpenPath(projectPath),
    RECORDED_PROJECT_PATH,
  )) as Record<string, any>;

  const recording = project.assets.find((asset: any) => asset.type === 'recording') ?? null;

  const patchedProject = {
    ...project,
    assets: project.assets.map((asset: any) =>
      asset.id === recording?.id
        ? {
            ...asset,
            presentation: {
              ...(asset.presentation ?? {}),
              camera: {
                ...(asset.presentation?.camera ?? {}),
                visible: true,
              },
            },
          }
        : asset,
    ),
  };

  await page.evaluate(
    ({ nextProject, projectPath, activeAssetId }) => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      stores?.project.getState().setProject(nextProject);
      stores?.project.getState().setProjectFilePath(projectPath);
      stores?.project.getState().setActiveAssetId(activeAssetId);
      stores?.transport.getState().seekToFrame(0);
    },
    {
      nextProject: patchedProject,
      projectPath: RECORDED_PROJECT_PATH,
      activeAssetId: recording?.id ?? null,
    },
  );

  await navigateToTab(page, 'edit');

  await page.waitForFunction((selector) => {
    const video = document.querySelector(selector) as HTMLVideoElement | null;
    return video?.getAttribute('data-ready') === 'true';
  }, EDIT_CAMERA_VIDEO);
}

async function samplePlayback(
  page: import('@playwright/test').Page,
  durationMs: number,
  intervalMs: number,
): Promise<PlaybackSample[]> {
  const cameraVideo = page.locator(EDIT_CAMERA_VIDEO).first();
  await cameraVideo.waitFor({ state: 'visible', timeout: 5_000 });

  const samples: PlaybackSample[] = [];
  const startedAt = Date.now();

  while (Date.now() - startedAt < durationMs) {
    const [playheadFrame, screenshot] = await Promise.all([
      page.evaluate(() => {
        const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
        return stores?.transport.getState().playheadFrame ?? -1;
      }),
      cameraVideo.screenshot({ timeout: 5_000 }),
    ]);

    samples.push({
      playheadFrame,
      cameraHash: hashBytes(screenshot),
    });

    await page.waitForTimeout(intervalMs);
  }

  return samples;
}

function countDistinct(values: Array<number | null>, tolerance: number): number {
  const distinct: number[] = [];

  for (const value of values) {
    if (value == null) continue;
    if (!distinct.some((candidate) => Math.abs(candidate - value) <= tolerance)) {
      distinct.push(value);
    }
  }

  return distinct.length;
}

function hashBytes(buffer: Buffer): number {
  let hash = 0;

  for (const value of buffer.values()) {
    hash = (hash * 33 + value) % 2147483647;
  }

  return hash;
}

function countBackwardSteps(values: number[], tolerance: number): number {
  let count = 0;

  for (let i = 1; i < values.length; i += 1) {
    if (values[i] < values[i - 1] - tolerance) {
      count += 1;
    }
  }

  return count;
}
