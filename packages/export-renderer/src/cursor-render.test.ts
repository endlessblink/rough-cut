import { describe, expect, it } from 'vitest';
import { createCanvas } from 'canvas';
import { buildCursorFrameData, renderCursorOverlay, type CursorFrameData } from './cursor-render.js';

describe('renderCursorOverlay', () => {
  it('draws a cursor and click effect onto the canvas', () => {
    const canvas = createCanvas(200, 100);
    const ctx = canvas.getContext('2d');
    const frames = new Float32Array(30 * 3).fill(-1);
    frames[0] = 0.5;
    frames[1] = 0.5;
    frames[2] = 1;
    const cursorData: CursorFrameData = { frames, frameCount: 30, sourceWidth: 200, sourceHeight: 100 };

    renderCursorOverlay(
      ctx,
      cursorData,
      0,
      200,
      100,
      {
        style: 'default',
        clickEffect: 'ring',
        sizePercent: 100,
        clickSoundEnabled: false,
      },
      1,
      0,
      0,
      30,
      undefined,
    );

    const pixel = ctx.getImageData(100, 50, 1, 1).data;
    expect(pixel[3]).toBeGreaterThan(0);
  });

  it('repairs legacy absolute coordinates during frame-data build', () => {
    const data = buildCursorFrameData(
      [
        { frame: 0, x: 1560, y: 200, type: 'move', button: 0 },
        { frame: 1, x: 1562, y: 202, type: 'down', button: 1 },
      ],
      30,
      1920,
      1080,
    );

    expect(data.frames[0]).toBeGreaterThanOrEqual(0);
    expect(data.frames[0]).toBeLessThanOrEqual(1);
    expect(data.frames[1]).toBeGreaterThanOrEqual(0);
    expect(data.frames[1]).toBeLessThanOrEqual(1);
  });

  it('maps cursor into the cropped viewport', () => {
    const canvas = createCanvas(200, 100);
    const ctx = canvas.getContext('2d');
    const data = buildCursorFrameData(
      [{ frame: 0, x: 1000, y: 200, type: 'move', button: 0 }],
      30,
      1920,
      1080,
    );

    renderCursorOverlay(
      ctx,
      data,
      0,
      200,
      100,
      {
        style: 'default',
        clickEffect: 'none',
        sizePercent: 100,
        clickSoundEnabled: false,
      },
      1,
      0,
      0,
      30,
      { enabled: true, x: 960, y: 100, width: 480, height: 240 },
    );

    const sampleWindow = (x: number, y: number, radius: number) => {
      const data = ctx.getImageData(x - radius, y - radius, radius * 2, radius * 2).data;
      let pixels = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) pixels += 1;
      }
      return pixels;
    };

    expect(sampleWindow(20, 42, 12)).toBeGreaterThan(10);
    expect(sampleWindow(104, 18, 8)).toBe(0);
  });
});
