import { test, expect, navigateToTab } from './fixtures/electron-app.js';

const PROJECT_PATH =
  '/home/endlessblink/Documents/Rough Cut/Recording Apr 25 2026 - 1559.roughcut';

test('diagnose old recording saved-take artifact', async ({ appPage }) => {
  test.setTimeout(60_000);
  await navigateToTab(appPage, 'record');

  const project = (await appPage.evaluate((projectPath) => {
    return window.roughcut.projectOpenPath(projectPath);
  }, PROJECT_PATH)) as Record<string, any>;

  const recording =
    project.assets.find((asset: any) => asset.type === 'recording' && asset.filePath.includes('2026-04-25T13-11-48-174Z.webm')) ?? null;
  expect(recording).toBeTruthy();

  await appPage.evaluate(
    ({ nextProject, projectPath, activeAssetId }) => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      stores?.project.getState().setProject(nextProject);
      stores?.project.getState().setProjectFilePath(projectPath);
      stores?.project.getState().setActiveAssetId(activeAssetId);
      stores?.transport.getState().seekToFrame(0);
      stores?.transport.getState().pause();
    },
    {
      nextProject: project,
      projectPath: PROJECT_PATH,
      activeAssetId: recording.id,
    },
  );

  await appPage.waitForFunction(() => {
    const root = document.querySelector('[data-testid="record-screen-frame"]');
    const ready = document.querySelector('[data-testid="recording-playback-video"]');
    return root && ready?.getAttribute('data-ready') === 'true';
  });
  await appPage.waitForTimeout(1000);

  await appPage.locator('[data-testid="record-screen-frame"]').screenshot({
    path: 'test-results/old-recording-screen-frame.png',
    timeout: 10_000,
  });

  await appPage.evaluate(() => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    stores?.transport.getState().seekToFrame(150);
    stores?.transport.getState().pause();
  });
  await appPage.waitForTimeout(1000);

  await appPage.locator('[data-testid="record-screen-frame"]').screenshot({
    path: 'test-results/old-recording-screen-frame-150.png',
    timeout: 10_000,
  });

  await appPage.evaluate(() => {
    const pm = (window as unknown as { __roughcutPlaybackManager?: any }).__roughcutPlaybackManager;
    pm?.play();
  });
  await appPage.waitForTimeout(3500);
  await appPage.evaluate(() => {
    const pm = (window as unknown as { __roughcutPlaybackManager?: any }).__roughcutPlaybackManager;
    pm?.pause();
  });
  await appPage.waitForTimeout(300);

  await appPage.locator('[data-testid="record-screen-frame"]').screenshot({
    path: 'test-results/old-recording-screen-frame-after-play.png',
    timeout: 10_000,
  });
});
