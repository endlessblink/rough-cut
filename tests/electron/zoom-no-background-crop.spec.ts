import { test, expect } from './fixtures/electron-app.js';

/**
 * Regression test for the "screen cropped on the sides" bug.
 *
 * resolve-frame.ts used to apply a subtle center zoom (scale = 1 + autoIntensity*0.08)
 * on every frame that wasn't inside an explicit zoom marker. With the default
 * autoIntensity of 0.5 that was a 4% zoom, visibly cropping ~2% of each edge.
 *
 * This spec injects a recording asset with autoIntensity=0.5 and no markers,
 * then asks the running renderer to resolve the camera transform. The transform
 * must be identity (scale=1, offset=0) so the full source is shown edge-to-edge.
 */
test('resolveFrame returns identity transform outside zoom markers', async ({ appPage }) => {
  const result = await appPage.evaluate(async () => {
    // Renderer exposes packages at runtime via module resolution. Reach into
    // the store singleton to synthesize a minimal project and hand it to
    // resolveFrame from the same bundle.
    const { resolveFrame } = await import(
      '/@fs/media/endlessblink/data/my-projects/ai-development/content-creation/rough-cut/packages/frame-resolver/src/index.ts'
    );
    const { createProject, createAsset } = await import(
      '/@fs/media/endlessblink/data/my-projects/ai-development/content-creation/rough-cut/packages/project-model/src/index.ts'
    );

    const asset = createAsset('recording', '/fixture.webm', {
      presentation: {
        zoom: {
          autoIntensity: 0.5,
          followCursor: true,
          followAnimation: 'focused',
          followPadding: 0.18,
          markers: [],
          autoFromClicks: true,
        },
        cursor: {
          style: 'default',
          clickEffect: 'none',
          sizePercent: 100,
          clickSoundEnabled: false,
        },
        camera: {
          shape: 'rounded',
          aspectRatio: '16:9',
          position: 'corner-br',
          roundness: 50,
          size: 100,
          visible: false,
          padding: 0,
          inset: 0,
          insetColor: '#ffffff',
          shadowEnabled: false,
          shadowBlur: 0,
          shadowOpacity: 0,
        },
      },
    });
    const project = createProject({ assets: [asset] });
    const frame = resolveFrame(project, 0);
    return frame.cameraTransform;
  });

  expect(result.scale).toBeCloseTo(1, 5);
  expect(result.offsetX).toBe(0);
  expect(result.offsetY).toBe(0);
});
