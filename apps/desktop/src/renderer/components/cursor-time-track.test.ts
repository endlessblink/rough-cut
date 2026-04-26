import { describe, expect, it } from 'vitest';
import { buildCursorTimeTrack, getCursorAtTime } from './cursor-time-track.js';

describe('cursor timestamp track lookup', () => {
  it('interpolates by timestamp with binary-search lookup', () => {
    const track = buildCursorTimeTrack([
      { timeMs: 100, x: 0, y: 0, type: 'move' },
      { timeMs: 200, x: 10, y: 20, type: 'move' },
    ]);

    expect(getCursorAtTime(track, 150)).toEqual({ x: 5, y: 10, isClick: false });
  });

  it('uses nearest boundary samples outside the known range', () => {
    const track = buildCursorTimeTrack([
      { timeMs: 100, x: 2, y: 3, type: 'move' },
      { timeMs: 200, x: 8, y: 9, type: 'move' },
    ]);

    expect(getCursorAtTime(track, 0)).toEqual({ x: 2, y: 3, isClick: false });
    expect(getCursorAtTime(track, 300)).toEqual({ x: 8, y: 9, isClick: false });
  });

  it('keeps the latest position and any click for duplicate timestamps', () => {
    const track = buildCursorTimeTrack([
      { timeMs: 100, x: 1, y: 1, type: 'down' },
      { timeMs: 100, x: 4, y: 5, type: 'move' },
    ]);

    expect(getCursorAtTime(track, 100)).toEqual({ x: 4, y: 5, isClick: true });
  });

  it('does not interpolate across large cursor data gaps', () => {
    const track = buildCursorTimeTrack([
      { timeMs: 100, x: 0, y: 0, type: 'move' },
      { timeMs: 1_100, x: 10, y: 10, type: 'move' },
    ]);

    expect(getCursorAtTime(track, 600)).toEqual({ x: 0, y: 0, isClick: false });
  });

  it('returns null while cursor visibility is hidden', () => {
    const track = buildCursorTimeTrack([
      { timeMs: 100, x: 0, y: 0, type: 'move' },
      { timeMs: 200, x: 10, y: 10, type: 'move', visible: false },
      { timeMs: 300, x: 20, y: 20, type: 'move' },
    ]);

    expect(getCursorAtTime(track, 200)).toBeNull();
    expect(getCursorAtTime(track, 250)).toBeNull();
  });

  it('is stateless across seek-like lookup order changes', () => {
    const track = buildCursorTimeTrack([
      { timeMs: 0, x: 0, y: 0, type: 'move' },
      { timeMs: 100, x: 10, y: 0, type: 'move' },
      { timeMs: 200, x: 20, y: 0, type: 'move' },
    ]);

    expect(getCursorAtTime(track, 175)).toEqual({ x: 17.5, y: 0, isClick: false });
    expect(getCursorAtTime(track, 25)).toEqual({ x: 2.5, y: 0, isClick: false });
  });
});
