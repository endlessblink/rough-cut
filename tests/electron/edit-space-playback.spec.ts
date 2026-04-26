import { test, expect, navigateToTab } from './fixtures/electron-app.js';

const EDIT_CAMERA_VIDEO = '[data-testid="edit-camera-playback-video"]';
const RECORDED_PROJECT_PATH =
  process.env.ROUGH_CUT_SESSION_PATH ??
  '/home/endlessblink/Documents/Rough Cut/Recording Apr 23 2026 - 2303.roughcut';

type PlaybackSample = {
  playheadFrame: number;
  /** Camera <video>.currentTime in seconds — proxies "is the camera frame visibly progressing". */
  cameraTime: number;
};

test('space starts edit playback from zoom slider focus without visual stutter', async ({ appPage }) => {

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

  const samples = await samplePlayback(appPage, 1_000, 100);
  const distinctPlayheadFrames = countDistinct(
    samples.map((sample) => sample.playheadFrame),
    1,
  );
  const distinctCameraTimes = countDistinct(
    samples.map((sample) => sample.cameraTime),
    0.05,
  );

  expect(samples.at(-1)?.playheadFrame ?? -1).toBeGreaterThan(initialFrame);
  expect(distinctPlayheadFrames).toBeGreaterThanOrEqual(3);
  expect(distinctCameraTimes).toBeGreaterThanOrEqual(2);

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

  // Pick the recording asset that actually has a clip in the composition. The
  // project file may carry stale recording entries in `assets` that aren't wired
  // into any track — taking just `find(type === 'recording')` returns the wrong
  // one and leaves the active asset un-renderable in the Edit tab.
  const recordingClipOwner = project.composition.tracks
    .flatMap((t: any) => t.clips)
    .find((c: any) =>
      project.assets.some((a: any) => a.id === c.assetId && a.type === 'recording'),
    ) ?? null;
  const recording = recordingClipOwner
    ? (project.assets.find((a: any) => a.id === recordingClipOwner.assetId) ?? null)
    : (project.assets.find((asset: any) => asset.type === 'recording') ?? null);

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
  await page.locator(EDIT_CAMERA_VIDEO).first().waitFor({ state: 'visible', timeout: 5_000 });

  const samples: PlaybackSample[] = [];
  const startedAt = Date.now();

  while (Date.now() - startedAt < durationMs) {
    const sample = await page.evaluate((selector) => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      const video = document.querySelector(selector) as HTMLVideoElement | null;
      return {
        playheadFrame: stores?.transport.getState().playheadFrame ?? -1,
        cameraTime: video?.currentTime ?? -1,
      };
    }, EDIT_CAMERA_VIDEO);
    samples.push(sample);
    await page.waitForTimeout(intervalMs);
  }

  return samples;
}

function countDistinct(values: Array<number | null>, tolerance: number): number {
  const distinct: number[] = [];

  for (const value of values) {
    if (value == null || value < 0) continue;
    if (!distinct.some((candidate) => Math.abs(candidate - value) <= tolerance)) {
      distinct.push(value);
    }
  }

  return distinct.length;
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
