import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCanvas } from 'canvas';
import {
  buildCursorFrameData,
  loadCursorFrameData,
  renderCursorOverlay,
  type CursorFrameData,
} from './cursor-render.js';

afterEach(() => {
  vi.restoreAllMocks();
});

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
        motionBlur: 0,
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
        motionBlur: 0,
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

  it('rescales cursor frames when eventsFps and projectFps differ', () => {
    // Today's broken take had cursor sampled at 60Hz wall-clock with the
    // project running at 30 fps. Cursor[playheadFrame=30] (= 1 s of timeline)
    // must return the event recorded at wall-clock t=1s — i.e., recording
    // frame 60 — not frame 30 (which is half a second of actual content).
    const data = buildCursorFrameData(
      [
        { frame: 60, x: 960, y: 540, type: 'move', button: 0 },
        // A second event later in time so frame 60 is unambiguous.
        { frame: 120, x: 1500, y: 700, type: 'move', button: 0 },
      ],
      210,
      1920,
      1080,
      60,
      30,
    );

    // Frame 60 in recording units → frame 30 in project units (60 * 30/60).
    const idx = 30 * 3;
    expect(data.frames[idx]).toBeCloseTo(960 / 1920, 5);
    expect(data.frames[idx + 1]).toBeCloseTo(540 / 1080, 5);
  });

  it('passes events through unchanged when fps params match', () => {
    const data = buildCursorFrameData(
      [{ frame: 30, x: 960, y: 540, type: 'move', button: 0 }],
      210,
      1920,
      1080,
      30,
      30,
    );
    const idx = 30 * 3;
    expect(data.frames[idx]).toBeCloseTo(960 / 1920, 5);
  });

  it('passes events through unchanged when fps params are omitted', () => {
    const data = buildCursorFrameData(
      [{ frame: 30, x: 960, y: 540, type: 'move', button: 0 }],
      210,
      1920,
      1080,
    );
    const idx = 30 * 3;
    expect(data.frames[idx]).toBeCloseTo(960 / 1920, 5);
  });

  it('falls back to inferred cursor sidecar during export loading', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'media:///tmp/example.cursor.ndjson') {
        return {
          ok: true,
          text: async () => '{"frame":0,"x":100,"y":50,"type":"move","button":0}\n',
        };
      }

      return { ok: false, text: async () => '' };
    });

    vi.stubGlobal('fetch', fetchMock);

    const data = await loadCursorFrameData(null, 30, 1920, 1080, '/tmp/example.webm');

    expect(data).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('media:///tmp/example.cursor.ndjson');
  });
});
