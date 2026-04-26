import { describe, expect, it } from 'vitest';
import type { CursorEvent } from '@rough-cut/project-model';
import { buildClickFrameTimeline } from './use-click-sound-playback.js';

describe('buildClickFrameTimeline', () => {
  it('maps down events into project frames and ignores non-click events', () => {
    const events: CursorEvent[] = [
      { frame: 10, x: 0, y: 0, type: 'move', button: 0 },
      { frame: 20, x: 0, y: 0, type: 'down', button: 0 },
      { frame: 30, x: 0, y: 0, type: 'up', button: 0 },
      { frame: 40, x: 0, y: 0, type: 'down', button: 2 },
    ];

    expect(buildClickFrameTimeline(events, 60, 30, 100)).toEqual([110, 120]);
  });

  it('returns a sorted timeline when events arrive out of order', () => {
    const events: CursorEvent[] = [
      { frame: 45, x: 0, y: 0, type: 'down', button: 0 },
      { frame: 15, x: 0, y: 0, type: 'down', button: 0 },
      { frame: 30, x: 0, y: 0, type: 'down', button: 1 },
    ];

    expect(buildClickFrameTimeline(events, 60, 30, 0)).toEqual([8, 15, 23]);
  });

  it('returns empty when fps inputs are invalid or there are no events', () => {
    expect(buildClickFrameTimeline(null, 60, 30, 0)).toEqual([]);
    expect(buildClickFrameTimeline([], 60, 30, 0)).toEqual([]);
    expect(buildClickFrameTimeline([{ frame: 10, x: 0, y: 0, type: 'down', button: 0 }], 0, 30, 0)).toEqual([]);
    expect(buildClickFrameTimeline([{ frame: 10, x: 0, y: 0, type: 'down', button: 0 }], 60, 0, 0)).toEqual([]);
  });
});
