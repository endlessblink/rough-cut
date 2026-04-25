import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test, navigateToTab } from './fixtures/electron-app.js';
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

      await appPage.evaluate(
        ({ nextProject, projectPath, activeAssetId }) => {
          const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
          stores?.project.getState().setProject(nextProject);
          stores?.project.getState().setProjectFilePath(projectPath);
          stores?.project.getState().setActiveAssetId(activeAssetId);
          stores?.transport.getState().seekToFrame(5);
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

      await appPage.waitForFunction(() => {
        const canvas = document.querySelector('canvas[data-source-frame]') as HTMLCanvasElement | null;
        if (!canvas) return false;
        if (canvas.dataset.cursorVisible !== 'true') return false;
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        const sample = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < sample.length; i += 4) {
          if (sample[i] > 0) return true;
        }
        return false;
      }, undefined, { timeout: 10000 });

      const diag = await appPage.evaluate(() => {
        const canvas = document.querySelector('canvas[data-source-frame]') as HTMLCanvasElement | null;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return null;

        const sample = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let nonTransparentPixels = 0;
        for (let i = 3; i < sample.length; i += 4) {
          if (sample[i] > 0) nonTransparentPixels += 1;
        }

        return {
          nonTransparentPixels,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
        };
      });

      expect(diag).not.toBeNull();
      expect(diag?.nonTransparentPixels ?? 0).toBeGreaterThan(20);
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
