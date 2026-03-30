import { describe, it, expect } from 'vitest';
import { generateAutoZoomMarkers } from './auto-zoom.js';
import type { CursorEvent } from '@rough-cut/project-model';

function click(frame: number, x: number, y: number): CursorEvent {
  return { frame, x, y, type: 'down', button: 0 };
}

function move(frame: number, x: number, y: number): CursorEvent {
  return { frame, x, y, type: 'move', button: 0 };
}

describe('generateAutoZoomMarkers', () => {
  it('returns [] when intensity is 0', () => {
    const events: CursorEvent[] = [click(10, 100, 100)];
    expect(generateAutoZoomMarkers(events, 0, 30, 1920, 1080)).toEqual([]);
  });

  it('returns [] with empty cursor events', () => {
    expect(generateAutoZoomMarkers([], 0.5, 30, 1920, 1080)).toEqual([]);
  });

  it('produces one marker for one click', () => {
    const events: CursorEvent[] = [click(60, 960, 540)];
    const markers = generateAutoZoomMarkers(events, 0.5, 30, 1920, 1080);
    expect(markers).toHaveLength(1);
    expect(markers[0].kind).toBe('auto');
    expect(markers[0].startFrame).toBeLessThan(60);
    expect(markers[0].endFrame).toBeGreaterThan(60);
    expect(markers[0].focalPoint.x).toBeCloseTo(0.5, 2);
    expect(markers[0].focalPoint.y).toBeCloseTo(0.5, 2);
  });

  it('clusters nearby clicks into a single marker', () => {
    const events: CursorEvent[] = [
      click(60, 500, 400),
      click(75, 520, 410),
    ];
    const markers = generateAutoZoomMarkers(events, 0.5, 30, 1920, 1080);
    expect(markers).toHaveLength(1);
  });

  it('produces two markers for clicks far apart', () => {
    const events: CursorEvent[] = [
      click(30, 100, 100),
      click(300, 1800, 900),
    ];
    const markers = generateAutoZoomMarkers(events, 0.5, 30, 1920, 1080);
    expect(markers).toHaveLength(2);
  });

  it('markers never overlap after merging', () => {
    const events: CursorEvent[] = [30, 40, 50].map((f) =>
      click(f, 960, 540),
    );
    const markers = generateAutoZoomMarkers(events, 0.9, 30, 1920, 1080);
    for (let i = 1; i < markers.length; i++) {
      expect(markers[i].startFrame).toBeGreaterThanOrEqual(
        markers[i - 1].endFrame,
      );
    }
  });

  it('computes correct focal point centroid', () => {
    const events: CursorEvent[] = [
      click(60, 0, 0),
      click(70, 1920, 1080),
    ];
    const markers = generateAutoZoomMarkers(events, 0.5, 30, 1920, 1080);
    expect(markers[0].focalPoint.x).toBeCloseTo(0.5, 2);
    expect(markers[0].focalPoint.y).toBeCloseTo(0.5, 2);
  });

  it('scales frame counts for 60fps', () => {
    const ev: CursorEvent[] = [click(120, 960, 540)];
    const m30 = generateAutoZoomMarkers(ev, 0.5, 30, 1920, 1080);
    const m60 = generateAutoZoomMarkers(ev, 0.5, 60, 1920, 1080);
    const span30 = m30[0].endFrame - m30[0].startFrame;
    const span60 = m60[0].endFrame - m60[0].startFrame;
    expect(span60).toBeCloseTo(span30 * 2, -1); // roughly 2x
  });

  it('intense produces higher strength than subtle', () => {
    const ev: CursorEvent[] = [click(60, 960, 540)];
    const subtle = generateAutoZoomMarkers(ev, 0.15, 30, 1920, 1080);
    const intense = generateAutoZoomMarkers(ev, 0.85, 30, 1920, 1080);
    expect(intense[0].strength).toBeGreaterThan(subtle[0].strength);
  });

  it('falls back to teleport detection when no clicks', () => {
    const moves: CursorEvent[] = [
      move(10, 0, 0),
      move(11, 1800, 900), // big teleport
    ];
    const markers = generateAutoZoomMarkers(moves, 0.5, 30, 1920, 1080);
    expect(markers.length).toBeGreaterThan(0);
  });

  it('all markers have kind auto', () => {
    const events: CursorEvent[] = [
      click(30, 100, 100),
      click(200, 1000, 500),
      click(400, 1800, 900),
    ];
    const markers = generateAutoZoomMarkers(events, 0.5, 30, 1920, 1080);
    for (const m of markers) {
      expect(m.kind).toBe('auto');
    }
  });

  it('all markers have valid zoom durations', () => {
    const events: CursorEvent[] = [click(100, 500, 500)];
    const markers = generateAutoZoomMarkers(events, 0.5, 30, 1920, 1080);
    for (const m of markers) {
      expect(m.zoomInDuration).toBeGreaterThan(0);
      expect(m.zoomOutDuration).toBeGreaterThan(0);
      expect(m.endFrame - m.startFrame).toBeGreaterThan(
        m.zoomInDuration + m.zoomOutDuration,
      );
    }
  });
});
