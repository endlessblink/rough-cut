import { test, expect, navigateToTab } from './fixtures/electron-app.js';

const VOLUME_GROUP = '[data-testid="record-timeline-volume"]';
const VOLUME_SLIDER = '[data-testid="record-timeline-volume-slider"]';
const VOLUME_MUTE = '[data-testid="record-timeline-volume-mute"]';

/**
 * Inject a minimal project with a single 'recording' asset so the Record tab
 * renders the timeline (which holds the volume slider). hasRecordedTake gates
 * the timeline render on `assets.some(a => a.type === 'recording' && filePath)`.
 */
async function seedRecordedTake(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    if (!stores) throw new Error('__roughcutStores not available');
    const projectState = stores.project.getState();
    const current = projectState.project;
    const recordingAssetId = 'test-recording-asset';
    const next = {
      ...current,
      assets: [
        ...current.assets.filter((a: any) => a.id !== recordingAssetId),
        {
          id: recordingAssetId,
          type: 'recording',
          filePath: '/tmp/fake-test-recording.webm',
          duration: 300,
          metadata: { width: 1920, height: 1080, frameRate: 30 },
        },
      ],
      composition: {
        ...current.composition,
        tracks: current.composition.tracks.map((track: any, idx: number) =>
          idx === 0 && track.type === 'video'
            ? {
                ...track,
                clips: [
                  {
                    id: 'test-recording-clip',
                    assetId: recordingAssetId,
                    timelineIn: 0,
                    timelineOut: 300,
                    sourceIn: 0,
                    sourceOut: 300,
                    transform: {
                      x: 0,
                      y: 0,
                      scaleX: 1,
                      scaleY: 1,
                      rotation: 0,
                      anchorX: 0.5,
                      anchorY: 0.5,
                      opacity: 1,
                    },
                    effects: [],
                    keyframes: [],
                  },
                ],
              }
            : track,
        ),
      },
    };
    projectState.setProject(next);
    projectState.setActiveAssetId(recordingAssetId);
  });
}

test.describe('record-tab volume slider', () => {
  test('slider reflects and updates transport.previewVolume; mute toggles previewMuted', async ({
    appPage,
  }) => {
    test.setTimeout(45_000);

    await navigateToTab(appPage, 'record');
    await seedRecordedTake(appPage);

    await appPage.waitForSelector(VOLUME_GROUP, { timeout: 15_000 });

    // Default state: volume = 1, muted = false
    const initial = await appPage.evaluate(() => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      const t = stores?.transport.getState();
      return { previewVolume: t?.previewVolume, previewMuted: t?.previewMuted };
    });
    expect(initial).toMatchObject({ previewVolume: 1, previewMuted: false });

    // Slider input reflects 1
    const initialValue = await appPage.locator(VOLUME_SLIDER).inputValue();
    expect(Number(initialValue)).toBeCloseTo(1, 2);

    // Drag-set the slider to 0.4 by directly setting input value + firing change.
    // Playwright's locator.fill() works on type=range in modern versions.
    await appPage.locator(VOLUME_SLIDER).fill('0.4');

    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
          return stores?.transport.getState().previewVolume;
        }),
      )
      .toBeCloseTo(0.4, 2);

    // Click mute button → previewMuted flips to true
    await appPage.locator(VOLUME_MUTE).click();
    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
          return stores?.transport.getState().previewMuted;
        }),
      )
      .toBe(true);

    // While muted, slider visually reads 0
    const mutedValue = await appPage.locator(VOLUME_SLIDER).inputValue();
    expect(Number(mutedValue)).toBe(0);

    // Click again → unmute, slider returns to last set value (0.4)
    await appPage.locator(VOLUME_MUTE).click();
    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
          return stores?.transport.getState().previewMuted;
        }),
      )
      .toBe(false);

    const restored = await appPage.locator(VOLUME_SLIDER).inputValue();
    expect(Number(restored)).toBeCloseTo(0.4, 2);

    // Dragging slider above 0 while muted should auto-unmute
    await appPage.evaluate(() => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      stores?.transport.getState().setPreviewMuted(true);
    });
    await appPage.locator(VOLUME_SLIDER).fill('0.7');
    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
          const t = stores?.transport.getState();
          return { previewVolume: t.previewVolume, previewMuted: t.previewMuted };
        }),
      )
      .toMatchObject({ previewVolume: expect.closeTo(0.7, 2), previewMuted: false });
  });
});
