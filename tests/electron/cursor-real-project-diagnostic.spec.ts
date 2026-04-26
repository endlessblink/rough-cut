import { expect, test, navigateToTab } from './fixtures/electron-app.js';
import { existsSync } from 'node:fs';
import { loadZoomFixture } from './fixtures/zoom-fixture.js';

const DEFAULT_REAL_PROJECT_PATH = '/home/endlessblink/Documents/Rough Cut/Recording Apr 17 2026 - 1347.roughcut';
const REAL_PROJECT_PATH =
  process.env.ROUGH_CUT_REAL_PROJECT_PATH ??
  (existsSync(DEFAULT_REAL_PROJECT_PATH) ? DEFAULT_REAL_PROJECT_PATH : null);
const REAL_PROJECT_FRAME = Number(process.env.ROUGH_CUT_REAL_PROJECT_FRAME ?? '120');

test('diagnose real project cursor overlay', async ({ appPage }) => {
  test.setTimeout(60_000);
  await navigateToTab(appPage, 'record');

  if (!REAL_PROJECT_PATH) {
    await loadZoomFixture(appPage, { preserveCursorEvents: true });
    await appPage.evaluate((frame) => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      stores?.transport.getState().seekToFrame(frame);
    }, REAL_PROJECT_FRAME);
  } else {
    const project = (await appPage.evaluate((projectPath) => {
      return window.roughcut.projectOpenPath(projectPath);
    }, REAL_PROJECT_PATH)) as Record<string, any>;

    const recording = project.assets.find((asset: any) => asset.type === 'recording');
    expect(recording).toBeTruthy();

    await appPage.evaluate(
      ({ nextProject, projectPath, activeAssetId, frame }) => {
        const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
        stores?.project.getState().setProject(nextProject);
        stores?.project.getState().setProjectFilePath(projectPath);
        stores?.project.getState().setActiveAssetId(activeAssetId);
        stores?.transport.getState().seekToFrame(frame);
      },
      {
        nextProject: project,
        projectPath: REAL_PROJECT_PATH,
        activeAssetId: recording?.id ?? null,
        frame: REAL_PROJECT_FRAME,
      },
    );
  }

  await appPage.waitForFunction((selector) => {
    const video = document.querySelector(selector) as HTMLVideoElement | null;
    return video?.getAttribute('data-ready') === 'true';
  }, '[data-testid="recording-playback-video"]');

  const diag = await appPage.evaluate(async () => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    const projectState = stores?.project.getState();
    const activeAssetId = projectState?.activeAssetId;
    const asset = projectState?.project?.assets?.find((entry: any) => entry.id === activeAssetId) ?? null;
    const cursorPath = asset?.metadata?.cursorEventsPath ?? null;
    const text = cursorPath ? await window.roughcut.readTextFile(cursorPath) : null;
    const eventCount = text ? text.trim().split('\n').filter(Boolean).length : 0;

    const canvas = document.querySelector(
      '[data-testid="zoom-host"]',
    )?.parentElement?.querySelector(':scope > div > canvas') as HTMLCanvasElement | null;
    const ctx = canvas?.getContext('2d');
    let nonTransparentPixels = 0;
    if (canvas && ctx) {
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) nonTransparentPixels += 1;
      }
    }

    return {
      activeAssetId,
      cursorPath,
      eventCount,
      playhead: stores?.transport.getState().playheadFrame ?? null,
      nonTransparentPixels,
      screenCrop: asset?.presentation?.screenCrop ?? null,
      cursorPresentation: asset?.presentation?.cursor ?? null,
      assetWidth: asset?.metadata?.width ?? null,
      assetHeight: asset?.metadata?.height ?? null,
      canvasWidth: canvas?.width ?? null,
      canvasHeight: canvas?.height ?? null,
    };
  });

  console.log(JSON.stringify(diag, null, 2));
  expect(diag.cursorPath).toBeTruthy();
});
