import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test, navigateToTab } from './fixtures/electron-app.js';
import {
  readCursorOverlayPixelStats,
  waitForCursorOverlayVisible,
} from './fixtures/cursor-overlay.js';
import { ZOOM_FIXTURE_PROJECT_PATH } from './fixtures/zoom-fixture.js';

test.describe('Retroactive cursor repair', () => {
  test('rebases old absolute cursor coordinates into the recorded display', async ({ appPage }) => {
    test.setTimeout(60_000);
    const tempDir = await mkdtemp(join(tmpdir(), 'rough-cut-cursor-repair-'));
    const sidecarPath = join(tempDir, 'legacy.cursor.ndjson');

    try {
      await navigateToTab(appPage, 'record');

      const fixture = JSON.parse(await readFile(ZOOM_FIXTURE_PROJECT_PATH, 'utf-8')) as {
        assets: Array<Record<string, any>>;
      };
      const recording = fixture.assets.find((asset) => asset.type === 'recording');
      expect(recording).toBeTruthy();

      const width = Number(recording?.metadata?.width ?? 1920);
      const height = Number(recording?.metadata?.height ?? 1080);
      const fakeDisplay = { x: 1920, y: 120, width, height, scaleFactor: 1 };

      await writeFile(
        sidecarPath,
        [
          JSON.stringify({ frame: 0, x: fakeDisplay.x + 120, y: fakeDisplay.y + 80, type: 'move', button: 0 }),
          JSON.stringify({ frame: 1, x: fakeDisplay.x + 122, y: fakeDisplay.y + 82, type: 'down', button: 1 }),
        ].join('\n') + '\n',
        'utf-8',
      );

      await appPage.evaluate(async (display) => {
        await window.roughcut.debugSetDisplayBounds([display]);
      }, fakeDisplay);

      const project = (await appPage.evaluate((projectPath) => {
        return window.roughcut.projectOpenPath(projectPath);
      }, ZOOM_FIXTURE_PROJECT_PATH)) as Record<string, any>;

      const activeRecording = project.assets.find((asset: any) => asset.type === 'recording');
      expect(activeRecording).toBeTruthy();

      activeRecording.metadata = {
        ...activeRecording.metadata,
        cursorEventsPath: sidecarPath,
        width,
        height,
      };
      activeRecording.presentation = {
        ...activeRecording.presentation,
        visibilitySegments: [],
        screenCrop: {
          ...(activeRecording.presentation?.screenCrop ?? {}),
          enabled: false,
        },
      };

      await appPage.evaluate(
        ({ nextProject, projectPath, activeAssetId }) => {
          const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
          stores?.project.getState().setProject(nextProject);
          stores?.project.getState().setProjectFilePath(projectPath);
          stores?.project.getState().setActiveAssetId(activeAssetId);
          stores?.transport.getState().seekToFrame(1);
        },
        {
          nextProject: project,
          projectPath: ZOOM_FIXTURE_PROJECT_PATH,
          activeAssetId: activeRecording?.id ?? null,
        },
      );

      await appPage.waitForFunction((selector) => {
        const video = document.querySelector(selector) as HTMLVideoElement | null;
        return video?.getAttribute('data-ready') === 'true';
      }, '[data-testid="recording-playback-video"]');

      await waitForCursorOverlayVisible(appPage);
      const diag = await readCursorOverlayPixelStats(appPage);

      expect(diag.found).toBe(true);
      expect(diag.nonTransparentPixels).toBeGreaterThan(20);
    } finally {
      await appPage
        .evaluate(async () => {
          await window.roughcut.debugSetDisplayBounds(null);
        })
        .catch(() => {});
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
