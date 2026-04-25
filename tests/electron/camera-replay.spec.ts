import { test, expect, navigateToTab } from './fixtures/electron-app.js';

const TIMELINE_PLAY_BUTTON =
  '[data-testid="record-timeline"] button[title*="Play"], [data-testid="record-timeline"] button[title*="Pause"]';
const EDIT_TIMELINE_PLAY_BUTTON =
  '[data-testid="edit-timeline"] button[title*="Play"], [data-testid="edit-timeline"] button[title*="Pause"]';
const CAMERA_VIDEO = '[data-testid="camera-playback-video"]';
const EDIT_CAMERA_VIDEO = '[data-testid="edit-camera-playback-video"]';
const SCREEN_VIDEO = '[data-testid="recording-playback-video"]';
const RECORDED_PROJECT_PATH =
  process.env.ROUGH_CUT_SESSION_PATH ??
  '/home/endlessblink/Documents/Rough Cut/Recording Apr 23 2026 - 2303.roughcut';

type PlaybackSample = {
  playheadFrame: number;
  /** Camera <video>.currentTime in seconds — proxies "is the camera frame visibly progressing". */
  cameraTime: number;
};

test.describe('camera replay', () => {
  test('camera preview keeps advancing after replaying from the start', async ({ appPage }) => {
    test.setTimeout(45_000);

    await loadReplayFixture(appPage);

    const durationFrames = await appPage.evaluate(() => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      return stores?.project.getState().project.composition.duration ?? 0;
    });

    expect(durationFrames).toBeGreaterThan(30);

    await appPage.evaluate(
      (frame) => {
        const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
        stores?.transport.getState().seekToFrame(frame);
      },
      Math.max(0, durationFrames - 20),
    );

    await appPage.evaluate((selector) => {
      const buttons = Array.from(document.querySelectorAll(selector)) as HTMLButtonElement[];
      buttons.at(-1)?.click();
    }, TIMELINE_PLAY_BUTTON);
    await expect
      .poll(
        async () =>
          appPage.evaluate(() => {
            const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
            return {
              isPlaying: stores?.transport.getState().isPlaying ?? null,
              playheadFrame: stores?.transport.getState().playheadFrame ?? -1,
            };
          }),
        { timeout: 5_000 },
      )
      .toMatchObject({
        isPlaying: true,
        playheadFrame: Math.max(0, durationFrames - 20),
      });

    await appPage.waitForTimeout(500);

    const stillPlayingAfterWait = await appPage.evaluate(() => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      return stores?.transport.getState().isPlaying ?? null;
    });

    if (stillPlayingAfterWait) {
      await appPage.locator(TIMELINE_PLAY_BUTTON).last().click();
      await expect
        .poll(
          async () =>
            appPage.evaluate(() => {
              const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
              return stores?.transport.getState().isPlaying ?? null;
            }),
          { timeout: 5_000 },
        )
        .toBe(false);
    }

    await appPage.evaluate(() => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      stores?.transport.getState().seekToFrame(0);
    });

    await expect
      .poll(
        async () =>
          appPage.evaluate(() => {
            const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;

            return {
              isPlaying: stores?.transport.getState().isPlaying ?? null,
              playheadFrame: stores?.transport.getState().playheadFrame ?? -1,
            };
          }),
        { timeout: 5_000 },
      )
      .toMatchObject({ isPlaying: false, playheadFrame: 0 });

    await appPage.locator(TIMELINE_PLAY_BUTTON).last().click();
    await expect
      .poll(
        async () =>
          appPage.evaluate(() => {
            const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
            return stores?.transport.getState().isPlaying ?? null;
          }),
        { timeout: 5_000 },
      )
      .toBe(true);

    const replaySamples = await samplePlayback(appPage, 1_600, 100, false);
    const distinctPlayheadFrames = countDistinct(
      replaySamples.map((sample) => sample.playheadFrame),
      1,
    );
    const distinctCameraTimes = countDistinct(
      replaySamples.map((sample) => sample.cameraTime),
      0.05,
    );

    expect(distinctPlayheadFrames).toBeGreaterThanOrEqual(3);
    expect(distinctCameraTimes).toBeGreaterThanOrEqual(3);
  });

  test('camera preview pauses, resumes, and seeks after replay starts', async ({ appPage }) => {
    test.setTimeout(45_000);

    await loadReplayFixture(appPage);

    await appPage.locator(TIMELINE_PLAY_BUTTON).last().click();
    await appPage.waitForTimeout(500);

    const beforePause = await captureCameraState(appPage);
    await appPage.locator(TIMELINE_PLAY_BUTTON).last().click();
    await appPage.waitForTimeout(250);

    const pausedA = await captureCameraState(appPage);
    await appPage.waitForTimeout(300);
    const pausedB = await captureCameraState(appPage);

    expect(pausedA.playheadFrame).toBe(pausedB.playheadFrame);
    expect(Math.abs(pausedA.cameraTime - pausedB.cameraTime)).toBeLessThanOrEqual(0.02);

    await appPage.locator(TIMELINE_PLAY_BUTTON).last().click();
    await appPage.waitForTimeout(500);
    const resumed = await captureCameraState(appPage);

    expect(resumed.playheadFrame).toBeGreaterThan(pausedB.playheadFrame);
    expect(resumed.cameraTime).toBeGreaterThan(pausedB.cameraTime + 0.05);
    expect(resumed.cameraTime).toBeGreaterThan(beforePause.cameraTime - 0.05);

    await appPage.locator(TIMELINE_PLAY_BUTTON).last().click();
    await appPage.waitForTimeout(200);

    await appPage.evaluate(() => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      stores?.transport.getState().seekToFrame(45);
    });
    await appPage.waitForTimeout(250);

    const sought = await captureCameraState(appPage);
    expect(Math.abs(sought.playheadFrame - 45)).toBeLessThanOrEqual(1);
    // Camera should have re-seeked back near frame 45 (≈1.5s @ 30fps).
    expect(Math.abs(sought.cameraTime - 45 / 30)).toBeLessThanOrEqual(0.2);
  });

  test('camera preview keeps updating while the playback clock advances', async ({ appPage }) => {
    test.setTimeout(45_000);

    await loadReplayFixture(appPage);
    await appPage.click(TIMELINE_PLAY_BUTTON);
    await appPage.waitForTimeout(1500);

    const samples = await samplePlayback(appPage, 1200, 100, false);
    const distinctPlayheadFrames = countDistinct(
      samples.map((sample) => sample.playheadFrame),
      1,
    );
    const distinctCameraTimes = countDistinct(
      samples.map((sample) => sample.cameraTime),
      0.05,
    );

    expect(distinctPlayheadFrames).toBeGreaterThanOrEqual(3);
    expect(distinctCameraTimes).toBeGreaterThanOrEqual(3);
  });

  test('edit preview renders camera playback and keeps it moving with the playhead', async ({
    appPage,
  }) => {
    test.setTimeout(45_000);

    await loadReplayFixture(appPage, 'edit');

    await appPage.locator(EDIT_TIMELINE_PLAY_BUTTON).last().click();
    await appPage.waitForFunction(
      () => {
        const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
        return (stores?.transport.getState().playheadFrame ?? 0) > 5;
      },
      { timeout: 5_000 },
    );

    const beforeSeek = await captureCameraState(appPage, EDIT_CAMERA_VIDEO);
    expect(beforeSeek.playheadFrame).toBeGreaterThan(5);

    await appPage.locator(EDIT_TIMELINE_PLAY_BUTTON).last().click();
    await appPage.waitForTimeout(200);

    await appPage.evaluate(() => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      stores?.transport.getState().seekToFrame(45);
    });
    await appPage.waitForTimeout(250);

    const afterSeek = await captureCameraState(appPage, EDIT_CAMERA_VIDEO);
    expect(Math.abs(afterSeek.playheadFrame - 45)).toBeLessThanOrEqual(1);
    // Camera <video> should have re-seeked back to near frame 45 (≈1.5s @ 30fps).
    expect(Math.abs(afterSeek.cameraTime - 45 / 30)).toBeLessThanOrEqual(0.2);
  });
});

async function loadReplayFixture(
  page: import('@playwright/test').Page,
  tab: 'record' | 'edit' = 'record',
): Promise<void> {
  await navigateToTab(page, 'record');

  const project = (await page.evaluate(
    (projectPath) =>
      (
        window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
      ).roughcut.projectOpenPath(projectPath),
    RECORDED_PROJECT_PATH,
  )) as Record<string, any>;
  const recordingClipOwner = project.composition.tracks
    .flatMap((track: any) => track.clips)
    .find((clip: any) =>
      project.assets.some((asset: any) => asset.id === clip.assetId && asset.type === 'recording'),
    ) ?? null;
  const recording = recordingClipOwner
    ? (project.assets.find((asset: any) => asset.id === recordingClipOwner.assetId) ?? null)
    : (project.assets.find((asset: any) => asset.type === 'recording') ?? null);
  const cameraAsset = recording?.cameraAssetId
    ? (project.assets.find((asset: any) => asset.id === recording.cameraAssetId) ?? null)
    : (project.assets.find((asset: any) => asset.metadata?.isCamera === true) ?? null);
  const recordingClip =
    project.composition.tracks
      .flatMap((track: any) => track.clips.map((clip: any) => ({ ...clip, trackId: track.id, trackType: track.type })))
      .find((clip: any) => clip.assetId === recording?.id) ?? null;
  const existingCameraClip =
    project.composition.tracks
      .flatMap((track: any) => track.clips.map((clip: any) => ({ ...clip, trackId: track.id, trackType: track.type })))
      .find((clip: any) => clip.assetId === cameraAsset?.id) ?? null;

  const patchedProject = {
    ...project,
    assets: project.assets.map((asset: any) =>
      asset.id === recording?.id
        ? {
            ...asset,
            cameraAssetId: asset.cameraAssetId ?? cameraAsset?.id ?? null,
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
    composition: {
      ...project.composition,
      tracks: project.composition.tracks.map((track: any) => {
        if (
          existingCameraClip ||
          !cameraAsset ||
          !recordingClip ||
          track.type !== 'video' ||
          track.id === recordingClip.trackId
        ) {
          return track;
        }

        return {
          ...track,
          clips: [
            ...track.clips,
            {
              id: `camera-replay-${cameraAsset.id}`,
              assetId: cameraAsset.id,
              timelineIn: recordingClip.timelineIn,
              timelineOut: recordingClip.timelineOut,
              sourceIn: 0,
              sourceOut: Math.max(0, recordingClip.timelineOut - recordingClip.timelineIn),
              transform: {
                x: 0.78,
                y: 0.78,
                scaleX: 0.2,
                scaleY: 0.2,
                rotation: 0,
                anchorX: 0.5,
                anchorY: 0.5,
                opacity: 1,
              },
            },
          ],
        };
      }),
    },
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

  await page.waitForFunction(() => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    const project = stores?.project.getState().project;
    if (!project) return false;

    const recording = project.assets.find((asset: any) => asset.type === 'recording');
    const camera = project.assets.find((asset: any) => asset.metadata?.isCamera);
    return Boolean(recording?.filePath && camera?.filePath);
  });

  if (tab === 'edit') {
    await navigateToTab(page, 'edit');
  } else {
    await page.waitForFunction((selector) => {
      const surface = document.querySelector(selector) as HTMLElement | null;
      return surface?.getAttribute('data-ready') === 'true';
    }, SCREEN_VIDEO);
  }

  const cameraSelector = tab === 'edit' ? EDIT_CAMERA_VIDEO : CAMERA_VIDEO;

  await page.waitForFunction((selector) => {
    const video = selector ? document.querySelector(selector) : null;
    return video?.getAttribute('data-ready') === 'true';
  }, cameraSelector);

  const layoutState = await page.evaluate((selector) => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    const project = stores?.project.getState().project;
    const recordingClipOwner = project?.composition.tracks
      .flatMap((track: any) => track.clips)
      .find((clip: any) =>
        project.assets.some(
          (asset: any) => asset.id === clip.assetId && asset.type === 'recording',
        ),
      ) ?? null;
    const recording = recordingClipOwner
      ? (project?.assets.find((asset: any) => asset.id === recordingClipOwner.assetId) ?? null)
      : (project?.assets.find((asset: any) => asset.type === 'recording') ?? null);
    const cameraAsset = recording?.cameraAssetId
      ? (project?.assets.find((asset: any) => asset.id === recording.cameraAssetId) ?? null)
      : null;
    const cameraClip =
      project?.composition.tracks
        .flatMap((track: any) =>
          track.clips.map((clip: any) => ({ ...clip, trackId: track.id, trackName: track.name })),
        )
        .find((clip: any) => clip.assetId === recording?.cameraAssetId) ?? null;
    const cameraVideo = document.querySelector(selector) as HTMLVideoElement | null;
    const rect = cameraVideo?.getBoundingClientRect();

    return {
      recordingCameraAssetId: recording?.cameraAssetId ?? null,
      hasCameraAsset: Boolean(cameraAsset),
      hasCameraClip: Boolean(cameraClip),
      cameraClipTrack: cameraClip?.trackName ?? null,
      cameraRect: rect
        ? {
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            x: Math.round(rect.x),
            y: Math.round(rect.y),
          }
        : null,
      cameraVideoSize: cameraVideo
        ? {
            width: cameraVideo.videoWidth,
            height: cameraVideo.videoHeight,
            currentTime: cameraVideo.currentTime,
          }
        : null,
    };
  }, cameraSelector);

  expect(layoutState.recordingCameraAssetId).toBeTruthy();
  expect(layoutState.hasCameraAsset).toBe(true);
  expect(layoutState.hasCameraClip).toBe(true);
  expect(layoutState.cameraRect?.width ?? 0).toBeGreaterThan(20);
  expect(layoutState.cameraRect?.height ?? 0).toBeGreaterThan(20);
}

async function captureCameraState(
  page: import('@playwright/test').Page,
  cameraSelector = CAMERA_VIDEO,
): Promise<PlaybackSample> {
  return page.evaluate((selector) => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    const video = document.querySelector(selector) as HTMLVideoElement | null;
    return {
      playheadFrame: stores?.transport.getState().playheadFrame ?? -1,
      cameraTime: video?.currentTime ?? -1,
    };
  }, cameraSelector);
}

async function samplePlayback(
  page: import('@playwright/test').Page,
  durationMs: number,
  intervalMs: number,
  autoStart = true,
  cameraSelector = CAMERA_VIDEO,
): Promise<PlaybackSample[]> {
  await page.locator(cameraSelector).first().waitFor({ state: 'visible', timeout: 5_000 });

  if (autoStart) {
    await page.locator(TIMELINE_PLAY_BUTTON).last().click();
    await page.waitForTimeout(150);
  }

  const samples: PlaybackSample[] = [];
  const startedAt = Date.now();

  while (Date.now() - startedAt < durationMs) {
    samples.push(await captureCameraState(page, cameraSelector));
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
