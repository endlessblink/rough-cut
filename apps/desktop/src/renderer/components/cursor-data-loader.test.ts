import { describe, expect, it } from 'vitest';
import { buildCursorFrameData } from './cursor-data-loader.js';

describe('buildCursorFrameData fps rescaling', () => {
  it('rescales 60Hz events into a 30fps timeline', () => {
    // Reproduces the Apr 25 0924 take: cursor sampled at 60Hz, project rate
    // 30fps, asset duration 210 frames. The click that lands on a highlighted
    // button at recording frame 60 (= wall-clock t=1s) must end up in
    // cursor[30] so playhead at 30/30 = t=1s shows the right position.
    const data = buildCursorFrameData(
      [
        { frame: 60, x: 1623, y: 527, type: 'down', button: 1 },
        { frame: 120, x: 800, y: 400, type: 'move', button: 0 },
      ],
      210,
      1920,
      1080,
      60,
      30,
    );

    const idx = 30 * 3;
    expect(data.frames[idx]).toBeCloseTo(1623 / 1920, 5);
    expect(data.frames[idx + 1]).toBeCloseTo(527 / 1080, 5);
    // Click flag preserved through rescale
    expect(data.frames[idx + 2]).toBe(1);
  });

  it('drops events whose rescaled frame falls outside totalFrames', () => {
    // Recording frame 600 → project frame 300, beyond totalFrames 210.
    const data = buildCursorFrameData(
      [
        { frame: 60, x: 100, y: 200, type: 'move', button: 0 },
        { frame: 600, x: 1700, y: 900, type: 'move', button: 0 },
      ],
      210,
      1920,
      1080,
      60,
      30,
    );
    // Frame 30 has data; frame 209 (last) is filled by extrapolation from
    // the last known sample (also frame 30).
    expect(data.frames[30 * 3]).toBeCloseTo(100 / 1920, 5);
    expect(data.frames[(210 - 1) * 3]).toBeCloseTo(100 / 1920, 5);
  });

  it('passes events through unchanged when fps matches', () => {
    const data = buildCursorFrameData(
      [{ frame: 30, x: 960, y: 540, type: 'move', button: 0 }],
      210,
      1920,
      1080,
      30,
      30,
    );
    expect(data.frames[30 * 3]).toBeCloseTo(960 / 1920, 5);
  });

  it('passes events through unchanged when fps params are omitted', () => {
    const data = buildCursorFrameData(
      [{ frame: 30, x: 960, y: 540, type: 'move', button: 0 }],
      210,
      1920,
      1080,
    );
    expect(data.frames[30 * 3]).toBeCloseTo(960 / 1920, 5);
  });

  it('subtracts eventsLeadFrames so cursor[0] aligns with file frame 0', () => {
    // Linux/X11 case: cursor recorder ran 200 ms before FFmpeg's first
    // captured frame. At fps=60 that's 12 lead frames. An event recorded at
    // wall-clock t=200ms (frame 12) was actually captured at file-time t=0,
    // so it must end up in cursor[0] — not cursor[12].
    const data = buildCursorFrameData(
      [
        { frame: 12, x: 100, y: 200, type: 'move', button: 0 },
        { frame: 72, x: 300, y: 400, type: 'move', button: 0 },
      ],
      120,
      1920,
      1080,
      60,
      60,
      12,
    );
    expect(data.frames[0]).toBeCloseTo(100 / 1920, 5);
    expect(data.frames[1]).toBeCloseTo(200 / 1080, 5);
    // The frame-72 event lands at frame 60 after the 12-frame shift.
    expect(data.frames[60 * 3]).toBeCloseTo(300 / 1920, 5);
  });

  it('drops events whose original frame falls inside the lead window', () => {
    // Events captured during the FFmpeg-startup gap correspond to wall-clock
    // moments BEFORE the file's first frame — they should not render at all.
    const data = buildCursorFrameData(
      [
        { frame: 5, x: 100, y: 200, type: 'down', button: 1 }, // dropped (inside lead)
        { frame: 30, x: 500, y: 600, type: 'move', button: 0 },
      ],
      120,
      1920,
      1080,
      60,
      60,
      10,
    );
    // frame 30 - 10 = 20 ⇒ position written at index 20.
    expect(data.frames[20 * 3]).toBeCloseTo(500 / 1920, 5);
    // The dropped down-click event's click flag must NOT appear at frame -5
    // (it's negative) and must NOT appear at the only known frame either.
    expect(data.frames[20 * 3 + 2]).toBe(0);
  });

  it('combines lead-shift and fps rescale correctly', () => {
    // 60Hz cursor sampling, 30fps project, 200ms lead (12 cursor frames).
    // Event at recording frame 72 → after shift -12 = 60 → after rescale
    // *0.5 = project frame 30.
    const data = buildCursorFrameData(
      [{ frame: 72, x: 800, y: 400, type: 'move', button: 0 }],
      120,
      1920,
      1080,
      60,
      30,
      12,
    );
    expect(data.frames[30 * 3]).toBeCloseTo(800 / 1920, 5);
  });
});
