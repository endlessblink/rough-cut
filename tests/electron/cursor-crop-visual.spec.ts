import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test, navigateToTab } from './fixtures/electron-app.js';
import { ZOOM_FIXTURE_PROJECT_PATH } from './fixtures/zoom-fixture.js';

test.describe('Cursor overlay with crop', () => {
  test('keeps the cursor visible inside the cropped viewport', async ({ appPage }) => {
    test.setTimeout(60_000);
    const tempDir = await mkdtemp(join(tmpdir(), 'rough-cut-cursor-crop-'));
    const sidecarPath = join(tempDir, 'crop.cursor.ndjson');

    try {
      await navigateToTab(appPage, 'record');

      const fixture = JSON.parse(await readFile(ZOOM_FIXTURE_PROJECT_PATH, 'utf-8')) as {
        assets: Array<Record<string, any>>;
      };
      const recording = fixture.assets.find((asset) => asset.type === 'recording');
      expect(recording).toBeTruthy();

      const width = Number(recording?.metadata?.width ?? 1920);
      const height = Number(recording?.metadata?.height ?? 1080);
      const crop = { enabled: true, x: 960, y: 100, width: 480, height: 240, aspectRatio: 'free' };
      const cursorX = 1000;
      const cursorY = 200;

      await writeFile(
        sidecarPath,
        [JSON.stringify({ frame: 0, x: cursorX, y: cursorY, type: 'move', button: 0 })].join('\n') +
          '\n',
        'utf-8',
      );

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
        screenCrop: crop,
      };

      await appPage.evaluate(
        ({ nextProject, projectPath, activeAssetId }) => {
          const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
          stores?.project.getState().setProject(nextProject);
          stores?.project.getState().setProjectFilePath(projectPath);
          stores?.project.getState().setActiveAssetId(activeAssetId);
          stores?.transport.getState().seekToFrame(0);
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

      const diag = await appPage.evaluate(
        ({ cursorX, cursorY, crop, sourceWidth, sourceHeight }) => {
          const canvas = document.querySelector(
            '[data-testid="zoom-host"]',
          )?.parentElement?.querySelector(':scope > div > canvas') as HTMLCanvasElement | null;
          const ctx = canvas?.getContext('2d');
          if (!canvas || !ctx) return null;

          const expectedX = ((cursorX - crop.x) / crop.width) * canvas.width;
          const expectedY = ((cursorY - crop.y) / crop.height) * canvas.height;
          const uncroppedX = (cursorX / sourceWidth) * canvas.width;
          const uncroppedY = (cursorY / sourceHeight) * canvas.height;

          const sampleWindow = (x: number, y: number, radius: number) => {
            const left = Math.max(0, Math.floor(x - radius));
            const top = Math.max(0, Math.floor(y - radius));
            const width = Math.min(canvas.width - left, radius * 2);
            const height = Math.min(canvas.height - top, radius * 2);
            const data = ctx.getImageData(left, top, width, height).data;
            let pixels = 0;
            for (let i = 3; i < data.length; i += 4) {
              if (data[i] > 0) pixels += 1;
            }
            return pixels;
          };

          return {
            expectedPixels: sampleWindow(expectedX, expectedY, 24),
            uncroppedPixels: sampleWindow(uncroppedX, uncroppedY, 16),
          };
        },
        { cursorX, cursorY, crop, sourceWidth: width, sourceHeight: height },
      );

      expect(diag).not.toBeNull();
      expect(diag?.expectedPixels ?? 0).toBeGreaterThan(20);
      expect(diag?.expectedPixels ?? 0).toBeGreaterThan(diag?.uncroppedPixels ?? 0);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
