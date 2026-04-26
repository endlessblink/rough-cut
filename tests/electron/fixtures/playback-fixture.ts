import { expect, navigateToTab } from './electron-app.js';

export const PLAYBACK_PROJECT_PATH =
  process.env.ROUGH_CUT_PLAYBACK_PROJECT_PATH ??
  '/home/endlessblink/Documents/Rough Cut/Recording Apr 16 2026 - 2159.roughcut';
export const PLAYBACK_RECORDING_BASENAME = 'recording-2026-04-16T18-59-17-986Z.webm';

/**
 * Loads a real on-disk playback project and normalizes it to one screen clip.
 * The older Apr 14 fixture now points at a missing /tmp recording, which only
 * exercises the placeholder compositor path and makes playback-canvas hashing meaningless.
 * The Apr 16 21:59 project below resolves to on-disk media in Documents/Rough Cut/recordings.
 */
export async function loadPlaybackFixture(
  page: import('@playwright/test').Page,
  tab: 'record' | 'edit' = 'record',
): Promise<void> {
  const project = (await page.evaluate((projectPath) => {
    return (
      window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
    ).roughcut.projectOpenPath(projectPath);
  }, PLAYBACK_PROJECT_PATH)) as Record<string, any>;

  const recording =
    project.assets.find(
      (asset: any) =>
        asset.type === 'recording' &&
        typeof asset.filePath === 'string' &&
        asset.filePath.includes(PLAYBACK_RECORDING_BASENAME),
    ) ?? null;
  expect(recording).toBeTruthy();

  const normalizedProject = {
    ...project,
    composition: {
      ...project.composition,
      duration: recording?.duration ?? project.composition.duration,
      tracks: project.composition.tracks.map((track: any, index: number) => {
        if (track.type !== 'video') return track;
        if (index !== 0) {
          return { ...track, clips: [] };
        }

        const baseClip = track.clips[0] ?? null;
        if (!baseClip) {
          return {
            ...track,
            clips: [],
          };
        }

        const clipDuration = recording?.duration ?? Math.max(0, baseClip.timelineOut - baseClip.timelineIn);
        return {
          ...track,
          clips: [
            {
              ...baseClip,
              assetId: recording.id,
              timelineIn: 0,
              timelineOut: clipDuration,
              sourceIn: 0,
              sourceOut: clipDuration,
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
      nextProject: normalizedProject,
      projectPath: PLAYBACK_PROJECT_PATH,
      activeAssetId: recording.id,
    },
  );

  await navigateToTab(page, tab);

  await expect(page.locator('[data-testid="recording-playback-canvas"]')).toBeVisible();
  await page.waitForSelector('[data-testid="recording-playback-video"]', {
    timeout: 30_000,
    state: 'attached',
  });
  await expect
    .poll(
      async () =>
        page.evaluate((selector) => {
          const video = document.querySelector(selector) as HTMLElement | null;
          return video?.getAttribute('data-ready') ?? null;
        }, '[data-testid="recording-playback-video"]'),
      { timeout: 10_000 },
    )
    .toBe('true');

  if (tab === 'record') {
    await expect
      .poll(
        async () => {
          return page.evaluate(() => ({
            hasSetupSelectors: Boolean(document.querySelector('[data-testid="record-device-selectors"]')),
            hasSourceGuard: Boolean(document.querySelector('[data-testid="record-start-guard-banner"]')),
            hasConfidenceBanner: Boolean(document.querySelector('[data-testid="record-confidence-banner"]')),
            hasScreenFrame: Boolean(document.querySelector('[data-testid="record-screen-frame"]')),
          }));
        },
        { timeout: 15_000 },
      )
      .toEqual({
        hasSetupSelectors: false,
        hasSourceGuard: false,
        hasConfidenceBanner: false,
        hasScreenFrame: true,
      });
  }
}
