import { test, expect, navigateToTab } from './fixtures/electron-app.js';

const PROJECT_PATH = '/home/endlessblink/Documents/Rough Cut/Recording Apr 25 2026 - 1559.roughcut';
const FIRST_TAKE_BASENAME = 'recording-2026-04-25T12-59-22-046Z.webm';
const SECOND_TAKE_BASENAME = 'recording-2026-04-25T13-11-48-174Z.webm';

test('Record preview switches to the selected saved take', async ({ appPage }) => {
  test.setTimeout(60_000);

  const project = (await appPage.evaluate((projectPath) => {
    return window.roughcut.projectOpenPath(projectPath);
  }, PROJECT_PATH)) as Record<string, any>;

  const firstRecording =
    project.assets.find(
      (asset: any) => asset.type === 'recording' && asset.filePath.includes(FIRST_TAKE_BASENAME),
    ) ?? null;
  const secondRecording =
    project.assets.find(
      (asset: any) => asset.type === 'recording' && asset.filePath.includes(SECOND_TAKE_BASENAME),
    ) ?? null;

  expect(firstRecording).toBeTruthy();
  expect(secondRecording).toBeTruthy();

  await appPage.evaluate(
    ({ nextProject, projectPath, activeAssetId }) => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      stores?.project.getState().setProject(nextProject);
      stores?.project.getState().setProjectFilePath(projectPath);
      stores?.project.getState().setActiveAssetId(activeAssetId);
      stores?.transport.getState().seekToFrame(90);
      stores?.transport.getState().pause();
    },
    {
      nextProject: project,
      projectPath: PROJECT_PATH,
      activeAssetId: firstRecording.id,
    },
  );

  await navigateToTab(appPage, 'record');
  await waitForScreenPlayback(appPage, firstRecording.filePath);

  const screenFrame = appPage.locator('[data-testid="record-screen-frame"]');
  const firstHash = hashBytes(await screenFrame.screenshot({ timeout: 10_000 }));

  await appPage.evaluate((activeAssetId) => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    stores?.project.getState().setActiveAssetId(activeAssetId);
    stores?.transport.getState().seekToFrame(90);
    stores?.transport.getState().pause();
  }, secondRecording.id);

  await waitForScreenPlayback(appPage, secondRecording.filePath);
  await appPage.waitForTimeout(300);

  const secondHash = hashBytes(await screenFrame.screenshot({ timeout: 10_000 }));

  expect(secondHash).not.toBe(firstHash);
});

async function waitForScreenPlayback(
  page: import('@playwright/test').Page,
  expectedFilePath: string,
): Promise<void> {
  await page.waitForFunction(
    (filePath) => {
      const ready = document.querySelector('[data-testid="recording-playback-video"]');
      return (
        ready?.getAttribute('data-ready') === 'true' &&
        ready?.getAttribute('data-file-path') === filePath
      );
    },
    expectedFilePath,
    { timeout: 30_000 },
  );
}

function hashBytes(buffer: Buffer): number {
  let hash = 0;

  for (const value of buffer.values()) {
    hash = (hash * 33 + value) % 2147483647;
  }

  return hash;
}
