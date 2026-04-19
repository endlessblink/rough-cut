import { test, expect, navigateToTab } from './fixtures/electron-app.js';

const RECORDED_PROJECT_PATH =
  process.env.ROUGH_CUT_SESSION_PATH ??
  '/home/endlessblink/Documents/Rough Cut/Recording Apr 14 2026 - 1825.roughcut';

test.describe('Record zoom rendering', () => {
  test('active zoom markers visibly change the rendered frame', async ({ appPage }) => {
    await loadRecordedProject(appPage);

    await appPage.evaluate(() => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      stores?.transport.getState().seekToFrame(220);
    });
    await appPage.waitForTimeout(300);

    const before = hashBytes(
      await appPage.locator('[data-testid="record-screen-frame"]').screenshot({ timeout: 5_000 }),
    );

    await appPage.evaluate(() => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      const projectStore = stores?.project;
      const state = projectStore?.getState();
      const activeAssetId = state?.activeAssetId;
      if (!activeAssetId) return;

      projectStore.getState().updateProject((doc: any) => ({
        ...doc,
        assets: doc.assets.map((asset: any) =>
          asset.id === activeAssetId
            ? {
                ...asset,
                presentation: {
                  ...(asset.presentation ?? {}),
                  zoom: {
                    ...(asset.presentation?.zoom ?? {}),
                    autoIntensity: 0,
                    markers: [],
                  },
                },
              }
            : asset,
        ),
      }));
    });
    await appPage.waitForTimeout(300);

    const after = hashBytes(
      await appPage.locator('[data-testid="record-screen-frame"]').screenshot({ timeout: 5_000 }),
    );

    expect(before).not.toBe(after);
  });
});

async function loadRecordedProject(page: import('@playwright/test').Page): Promise<void> {
  await navigateToTab(page, 'record');

  const project = (await page.evaluate((projectPath) => {
    return (
      window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
    ).roughcut.projectOpenPath(projectPath);
  }, RECORDED_PROJECT_PATH)) as Record<string, any>;

  const recording = project.assets.find((asset: any) => asset.type === 'recording');
  expect(recording).toBeTruthy();

  await page.evaluate(
    ({ nextProject, projectPath, activeAssetId }) => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      stores?.project.getState().setProject(nextProject);
      stores?.project.getState().setProjectFilePath(projectPath);
      stores?.project.getState().setActiveAssetId(activeAssetId);
      stores?.transport.getState().seekToFrame(0);
    },
    {
      nextProject: project,
      projectPath: RECORDED_PROJECT_PATH,
      activeAssetId: recording?.id ?? null,
    },
  );

  await page.waitForFunction((selector) => {
    const video = document.querySelector(selector) as HTMLVideoElement | null;
    return video?.getAttribute('data-ready') === 'true';
  }, '[data-testid="recording-playback-video"]');

  await expect(page.locator('[data-testid="record-screen-frame"]')).toBeVisible();
}

function hashBytes(buffer: Buffer): number {
  let hash = 0;

  for (const value of buffer.values()) {
    hash = (hash * 33 + value) % 2147483647;
  }

  return hash;
}
