import { existsSync } from 'node:fs';
import { expect, test, navigateToTab } from './fixtures/electron-app.js';

/**
 * Live-data regression check: load the take that originally surfaced the
 * cursor-sync bug (Apr 25 0924 — cursor sampled at 60Hz against a 30fps
 * project) and confirm the fps rescaling lands the click event on the
 * highlighted button.
 *
 * The take's click was recorded at frame 363 of the cursor stream → expected
 * to render at project frame 182 (363 * 30/60) at normalized position
 * (0.846, 0.488). Without the fix, cursor[182] indexes into recording frame
 * 182, which falls in the off-screen first half of the cursor stream and
 * renders nothing.
 *
 * The fixture lives outside the repo (it's a real user recording), so this
 * test skips on machines where the file is absent. The unit tests in
 * `apps/desktop/src/renderer/components/cursor-data-loader.test.ts` and
 * `packages/export-renderer/src/cursor-render.test.ts` cover the math
 * portably; this spec is the end-to-end signal on a known-broken artifact.
 *
 * Override the file path with `ROUGH_CUT_CURSOR_FIX_PROJECT_PATH=...` if the
 * take has been moved.
 */
const PROJECT_PATH =
  process.env.ROUGH_CUT_CURSOR_FIX_PROJECT_PATH ??
  '/home/endlessblink/Documents/Rough Cut/Recording Apr 25 2026 - 0924.roughcut';

test('Apr 25 0924 cursor lands on click target after fps rescaling', async ({ appPage }) => {
  test.skip(
    !existsSync(PROJECT_PATH),
    `Live-data regression fixture not present at ${PROJECT_PATH}. ` +
      `Set ROUGH_CUT_CURSOR_FIX_PROJECT_PATH to a project whose recording asset has cursor data ` +
      `sampled at a different fps than its settings.frameRate, or skip on this machine.`,
  );

  test.setTimeout(60_000);
  await navigateToTab(appPage, 'record');

  const project = (await appPage.evaluate((projectPath) => {
    return window.roughcut.projectOpenPath(projectPath);
  }, PROJECT_PATH)) as Record<string, unknown>;

  const recording = (project.assets as Array<Record<string, unknown>>).find(
    (asset) => asset.type === 'recording',
  );
  expect(recording).toBeTruthy();
  if (recording) {
    recording.presentation = {
      ...(recording.presentation as Record<string, unknown> | undefined),
      visibilitySegments: [],
      screenCrop: {
        ...(((recording.presentation as Record<string, any> | undefined)?.screenCrop ?? {}) as Record<string, unknown>),
        enabled: false,
      },
    };
  }

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
      projectPath: PROJECT_PATH,
      activeAssetId: (recording?.id as string) ?? null,
      frame: 182,
    },
  );

  // Wait for the dedicated cursor overlay canvas to have non-empty pixels.
  await appPage.waitForFunction(
    () => {
      const canvas = document.querySelector('[data-testid="cursor-overlay-canvas"]') as HTMLCanvasElement | null;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return false;
      try {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
      } catch {
        /* ignore */
      }
      return false;
    },
    null,
    { timeout: 10_000 },
  );

  const result = await appPage.evaluate(() => {
    const canvas = document.querySelector('[data-testid="cursor-overlay-canvas"]') as HTMLCanvasElement | null;
    if (!canvas) return { found: false } as const;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { found: false } as const;
    const w = canvas.width;
    const h = canvas.height;
    const data = ctx.getImageData(0, 0, w, h).data;
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4 + 3;
        if (data[i] > 0) {
          sumX += x;
          sumY += y;
          count += 1;
        }
      }
    }
    if (count === 0) return { found: false } as const;
    return {
      found: true as const,
      cx: sumX / count,
      cy: sumY / count,
      pixels: count,
      width: w,
      height: h,
    };
  });

  expect(result.found).toBe(true);
  // Expected normalized position from the cursor click event: (0.846, 0.488).
  // Allow generous tolerance — the canvas is responsive and the cursor sprite
  // has a measurable spatial extent so the centroid drifts slightly from the
  // hotspot.
  if (result.found) {
    const nx = result.cx / result.width;
    const ny = result.cy / result.height;
    console.log('cursor centroid (normalized):', nx.toFixed(3), ny.toFixed(3), 'pixels:', result.pixels);
    expect(nx).toBeGreaterThan(0.7);
    expect(nx).toBeLessThan(0.95);
    expect(ny).toBeGreaterThan(0.35);
    expect(ny).toBeLessThan(0.65);
  }
});
