import { describe, it, expect } from 'vitest';
import { createRenderCanvas, renderFrameToBuffer } from './frame-renderer.js';
import type { RenderFrame } from '@rough-cut/frame-resolver';

function makeEmptyRenderFrame(width = 320, height = 180): RenderFrame {
  return {
    frame: 0,
    width,
    height,
    backgroundColor: '#000000',
    layers: [],
    transitions: [],
  };
}

describe('createRenderCanvas', () => {
  it('returns a canvas with the requested dimensions', () => {
    const canvas = createRenderCanvas(320, 180);
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(180);
  });
});

describe('renderFrameToBuffer', () => {
  it('buffer size is width * height * 4 (RGBA)', () => {
    const width = 320;
    const height = 180;
    const canvas = createRenderCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const frame = makeEmptyRenderFrame(width, height);
    const buffer = renderFrameToBuffer(canvas, ctx, frame);
    expect(buffer.byteLength).toBe(width * height * 4);
  });

  it('empty frame renders all pixels as background color', () => {
    const canvas = createRenderCanvas(4, 4);
    const ctx = canvas.getContext('2d');
    const frame: RenderFrame = {
      ...makeEmptyRenderFrame(4, 4),
      backgroundColor: '#ff0000', // pure red
    };
    const buffer = renderFrameToBuffer(canvas, ctx, frame);
    // Every pixel should be R=255 G=0 B=0 A=255
    for (let i = 0; i < buffer.byteLength; i += 4) {
      expect(buffer[i]).toBe(255);     // R
      expect(buffer[i + 1]).toBe(0);   // G
      expect(buffer[i + 2]).toBe(0);   // B
      expect(buffer[i + 3]).toBe(255); // A
    }
  });

  it('frame with one layer draws something on the canvas', () => {
    const width = 64;
    const height = 64;
    const canvas = createRenderCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const frame: RenderFrame = {
      frame: 0,
      width,
      height,
      backgroundColor: '#ffffff',
      layers: [
        {
          clipId: 'clip-test-0001' as import('@rough-cut/project-model').ClipId,
          trackId: 'track-test-0001' as import('@rough-cut/project-model').TrackId,
          trackIndex: 0,
          assetId: 'asset-test-0001' as import('@rough-cut/project-model').AssetId,
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
        },
      ],
      transitions: [],
    };

    const buffer = renderFrameToBuffer(canvas, ctx, frame);

    // Not all pixels should be background white (255,255,255)
    let nonWhiteCount = 0;
    for (let i = 0; i < buffer.byteLength; i += 4) {
      const r = buffer[i]!;
      const g = buffer[i + 1]!;
      const b = buffer[i + 2]!;
      if (r !== 255 || g !== 255 || b !== 255) {
        nonWhiteCount++;
      }
    }
    expect(nonWhiteCount).toBeGreaterThan(0);
  });

  it('second layer (higher trackIndex) overlaps first where they share space', () => {
    const width = 64;
    const height = 64;
    const canvas = createRenderCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const baseLayer = {
      clipId: 'clip-a' as import('@rough-cut/project-model').ClipId,
      trackId: 'track-a' as import('@rough-cut/project-model').TrackId,
      assetId: 'asset-a' as import('@rough-cut/project-model').AssetId,
      sourceFrame: 0,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
      effects: [],
    };

    // Render only bottom layer first
    const frame1: RenderFrame = {
      frame: 0, width, height,
      backgroundColor: '#000000',
      layers: [{ ...baseLayer, trackIndex: 0 }],
      transitions: [],
    };
    const buf1 = renderFrameToBuffer(canvas, ctx, frame1);
    // Sample center pixel
    const cx = Math.floor(width / 2) * 4 + Math.floor(height / 2) * width * 4;
    const r1 = buf1[cx]!;
    const g1 = buf1[cx + 1]!;
    const b1 = buf1[cx + 2]!;

    // Render with two layers — second should paint over the same area
    const frame2: RenderFrame = {
      frame: 0, width, height,
      backgroundColor: '#000000',
      layers: [
        { ...baseLayer, trackIndex: 0, clipId: 'clip-a' as import('@rough-cut/project-model').ClipId },
        { ...baseLayer, trackIndex: 1, clipId: 'clip-b' as import('@rough-cut/project-model').ClipId },
      ],
      transitions: [],
    };
    const buf2 = renderFrameToBuffer(canvas, ctx, frame2);
    const r2 = buf2[cx]!;
    const g2 = buf2[cx + 1]!;
    const b2 = buf2[cx + 2]!;

    // The two layers use different colors (different trackIndex), so center pixels differ
    // (trackIndex 0 → LAYER_COLORS[0], trackIndex 1 → LAYER_COLORS[1])
    expect([r2, g2, b2]).not.toEqual([r1, g1, b1]);
  });
});
