import { describe, expect, it } from 'vitest';
import { createCanvas } from 'canvas';
import type { RenderFrame } from '@rough-cut/frame-resolver';
import type { AssetId, ClipId, TrackId } from '@rough-cut/project-model';
import { renderFrameToCanvasAccurate } from './render-frame-core.js';

function makeFrame(): RenderFrame {
  return {
    frame: 0,
    width: 200,
    height: 100,
    backgroundColor: '#000000',
    layers: [
      {
        clipId: 'clip-camera' as ClipId,
        trackId: 'track-camera' as TrackId,
        trackIndex: 1,
        assetId: 'asset-camera' as AssetId,
        sourceFrame: 0,
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
        isCamera: true,
      },
    ],
    transitions: [],
    cameraTransform: { scale: 1, offsetX: 0, offsetY: 0 },
    cursor: {
      style: 'default',
      clickEffect: 'none',
      sizePercent: 100,
      clickSoundEnabled: false,
    },
    cameraPresentation: {
      shape: 'rounded',
      aspectRatio: '1:1',
      position: 'corner-br',
      roundness: 50,
      size: 100,
      visible: true,
      padding: 0,
      inset: 0,
      insetColor: '#ffffff',
      shadowEnabled: false,
      shadowBlur: 0,
      shadowOpacity: 0,
    },
  };
}

describe('renderFrameToCanvasAccurate', () => {
  it('renders camera video into the camera overlay region', async () => {
    const canvas = createCanvas(200, 100);
    const ctx = canvas.getContext('2d');
    const source = createCanvas(50, 50);
    const sourceCtx = source.getContext('2d');
    sourceCtx.fillStyle = '#ff0000';
    sourceCtx.fillRect(0, 0, 50, 50);

    await renderFrameToCanvasAccurate(
      canvas,
      ctx,
      makeFrame(),
      30,
      async () => source as unknown as CanvasImageSource,
    );

    const inside = ctx.getImageData(170, 70, 1, 1).data;
    const outside = ctx.getImageData(20, 20, 1, 1).data;
    expect(inside[0]).toBeGreaterThan(200);
    expect(outside[0]).toBe(0);
  });

  it('applies recording zoom to source media during accurate export rendering', async () => {
    const canvas = createCanvas(200, 100);
    const ctx = canvas.getContext('2d');
    const source = createCanvas(200, 100);
    const sourceCtx = source.getContext('2d');

    sourceCtx.fillStyle = '#000000';
    sourceCtx.fillRect(0, 0, 50, 100);
    sourceCtx.fillStyle = '#ff0000';
    sourceCtx.fillRect(50, 0, 50, 100);
    sourceCtx.fillStyle = '#00ff00';
    sourceCtx.fillRect(100, 0, 50, 100);
    sourceCtx.fillStyle = '#0000ff';
    sourceCtx.fillRect(150, 0, 50, 100);

    const frame: RenderFrame = {
      frame: 0,
      width: 200,
      height: 100,
      backgroundColor: '#000000',
      layers: [
        {
          clipId: 'clip-screen' as ClipId,
          trackId: 'track-screen' as TrackId,
          trackIndex: 0,
          assetId: 'asset-screen' as AssetId,
          sourceFrame: 0,
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
          isCamera: false,
        },
      ],
      transitions: [],
      cameraTransform: { scale: 2, offsetX: 0, offsetY: 0 },
      cursor: {
        style: 'default',
        clickEffect: 'none',
        sizePercent: 100,
        clickSoundEnabled: false,
      },
    };

    await renderFrameToCanvasAccurate(
      canvas,
      ctx,
      frame,
      30,
      async () => source as unknown as CanvasImageSource,
    );

    const left = ctx.getImageData(10, 50, 1, 1).data;
    const right = ctx.getImageData(190, 50, 1, 1).data;

    expect(left[0]).toBeGreaterThan(200);
    expect(left[1]).toBeLessThan(50);
    expect(right[1]).toBeGreaterThan(200);
    expect(right[0]).toBeLessThan(50);
  });

  it('renders screen media inside the persisted screen frame over the persisted background', async () => {
    const canvas = createCanvas(200, 100);
    const ctx = canvas.getContext('2d');
    const source = createCanvas(100, 50);
    const sourceCtx = source.getContext('2d');
    sourceCtx.fillStyle = '#ff0000';
    sourceCtx.fillRect(0, 0, 100, 50);

    const frame: RenderFrame = {
      frame: 0,
      width: 200,
      height: 100,
      backgroundColor: '#123456',
      background: {
        bgColor: '#123456',
        bgGradient: null,
        bgPadding: 10,
        bgCornerRadius: 0,
        bgInset: 0,
        bgInsetColor: '#ffffff',
        bgShadowEnabled: false,
        bgShadowBlur: 0,
        bgShadowOpacity: 0.25,
      },
      layers: [
        {
          clipId: 'clip-screen' as ClipId,
          trackId: 'track-screen' as TrackId,
          trackIndex: 0,
          assetId: 'asset-screen' as AssetId,
          sourceFrame: 0,
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
          isCamera: false,
        },
      ],
      transitions: [],
      cameraTransform: { scale: 1, offsetX: 0, offsetY: 0 },
      cursor: {
        style: 'default',
        clickEffect: 'none',
        sizePercent: 100,
        clickSoundEnabled: false,
        motionBlur: 0,
      },
      screenFrame: { x: 0.25, y: 0.2, w: 0.5, h: 0.5 },
    };

    await renderFrameToCanvasAccurate(
      canvas,
      ctx,
      frame,
      30,
      async () => source as unknown as CanvasImageSource,
    );

    const backgroundPixel = ctx.getImageData(10, 10, 1, 1).data;
    const framePixel = ctx.getImageData(60, 35, 1, 1).data;
    expect(backgroundPixel[0]).toBe(0x12);
    expect(backgroundPixel[1]).toBe(0x34);
    expect(backgroundPixel[2]).toBe(0x56);
    expect(framePixel[0]).toBeGreaterThan(200);
    expect(framePixel[1]).toBeLessThan(50);
    expect(framePixel[2]).toBeLessThan(50);
  });

  it('skips rendering camera layers when the camera is hidden', async () => {
    const canvas = createCanvas(200, 100);
    const ctx = canvas.getContext('2d');
    const source = createCanvas(50, 50);
    const sourceCtx = source.getContext('2d');
    sourceCtx.fillStyle = '#ff0000';
    sourceCtx.fillRect(0, 0, 50, 50);

    const frame = makeFrame();
    frame.cameraPresentation = {
      ...frame.cameraPresentation!,
      visible: false,
    };

    await renderFrameToCanvasAccurate(
      canvas,
      ctx,
      frame,
      30,
      async () => source as unknown as CanvasImageSource,
    );

    const inside = ctx.getImageData(170, 70, 1, 1).data;
    expect(inside[0]).toBe(0);
    expect(inside[1]).toBe(0);
    expect(inside[2]).toBe(0);
  });

  it('renders camera video inside the persisted camera frame instead of layout fallback', async () => {
    const canvas = createCanvas(200, 100);
    const ctx = canvas.getContext('2d');
    const source = createCanvas(40, 40);
    const sourceCtx = source.getContext('2d');
    sourceCtx.fillStyle = '#ff0000';
    sourceCtx.fillRect(0, 0, 40, 40);

    const frame = makeFrame();
    frame.cameraPresentation = {
      ...frame.cameraPresentation!,
      position: 'corner-br',
      size: 100,
    };
    frame.cameraFrame = { x: 0.05, y: 0.1, w: 0.2, h: 0.4 };

    await renderFrameToCanvasAccurate(
      canvas,
      ctx,
      frame,
      30,
      async () => source as unknown as CanvasImageSource,
    );

    const insidePersistedFrame = ctx.getImageData(20, 25, 1, 1).data;
    const insideLayoutFallback = ctx.getImageData(170, 70, 1, 1).data;

    expect(insidePersistedFrame[0]).toBeGreaterThan(200);
    expect(insidePersistedFrame[1]).toBeLessThan(50);
    expect(insidePersistedFrame[2]).toBeLessThan(50);

    expect(insideLayoutFallback[0]).toBe(0);
    expect(insideLayoutFallback[1]).toBe(0);
    expect(insideLayoutFallback[2]).toBe(0);
  });
});
