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
});
