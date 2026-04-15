import { describe, expect, it } from 'vitest';
import { createCanvas } from 'canvas';
import { renderCursorOverlay, type CursorFrameData } from './cursor-render.js';

describe('renderCursorOverlay', () => {
  it('draws a cursor and click effect onto the canvas', () => {
    const canvas = createCanvas(200, 100);
    const ctx = canvas.getContext('2d');
    const frames = new Float32Array(30 * 3).fill(-1);
    frames[0] = 0.5;
    frames[1] = 0.5;
    frames[2] = 1;
    const cursorData: CursorFrameData = { frames, frameCount: 30 };

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
    );

    const pixel = ctx.getImageData(100, 50, 1, 1).data;
    expect(pixel[3]).toBeGreaterThan(0);
  });
});
