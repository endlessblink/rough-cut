import { describe, it, expect } from 'vitest';
import { generateAutoZoomMarkers, filterAutoMarkersAgainstManual } from './auto-zoom.js';
import type { CursorEvent, ZoomMarker } from '@rough-cut/project-model';
import { createZoomMarker } from '@rough-cut/project-model';

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

describe('filterAutoMarkersAgainstManual', () => {
  it('returns all candidates when there are no existing markers', () => {
    const events: CursorEvent[] = [click(60, 960, 540)];
    const candidates = generateAutoZoomMarkers(events, 0.5, 30, 1920, 1080);
    expect(filterAutoMarkersAgainstManual(candidates, [])).toHaveLength(candidates.length);
  });

  it('single isolated click → 1 marker, centroid matches click pos', () => {
    const events: CursorEvent[] = [click(60, 960, 540)];
    const markers = generateAutoZoomMarkers(events, 0.5, 30, 1920, 1080);
    const filtered = filterAutoMarkersAgainstManual(markers, []);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].focalPoint.x).toBeCloseTo(0.5, 2);
    expect(filtered[0].focalPoint.y).toBeCloseTo(0.5, 2);
  });

  it('two clicks 0.5 s apart → 1 merged marker', () => {
    // 0.5s × 30fps = 15 frames apart
    const events: CursorEvent[] = [
      click(60, 500, 400),
      click(75, 520, 410),
    ];
    const candidates = generateAutoZoomMarkers(events, 0.5, 30, 1920, 1080);
    const filtered = filterAutoMarkersAgainstManual(candidates, []);
    expect(filtered).toHaveLength(1);
  });

  it('two clicks 3 s apart → 2 markers', () => {
    // 3s × 30fps = 90 frames apart (> clusterGapFrames at intensity 0.5 = 30)
    const events: CursorEvent[] = [
      click(30, 100, 100),
      click(300, 1800, 900),
    ];
    const candidates = generateAutoZoomMarkers(events, 0.5, 30, 1920, 1080);
    const filtered = filterAutoMarkersAgainstManual(candidates, []);
    expect(filtered).toHaveLength(2);
  });

  it('cluster with clicks at varying positions → centroid is the mean', () => {
    const events: CursorEvent[] = [
      click(60, 0, 0),
      click(70, 1920, 1080),
    ];
    const candidates = generateAutoZoomMarkers(events, 0.5, 30, 1920, 1080);
    const filtered = filterAutoMarkersAgainstManual(candidates, []);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].focalPoint.x).toBeCloseTo(0.5, 2);
    expect(filtered[0].focalPoint.y).toBeCloseTo(0.5, 2);
  });

  it('manual marker overlapping cluster → auto marker is skipped', () => {
    const events: CursorEvent[] = [click(60, 960, 540)];
    const autoMarkers = generateAutoZoomMarkers(events, 0.5, 30, 1920, 1080);
    expect(autoMarkers).toHaveLength(1);
    const { startFrame, endFrame } = autoMarkers[0];

    // Create a manual marker spanning the same range
    const manualMarker = createZoomMarker(startFrame, endFrame, { kind: 'manual' });
    const filtered = filterAutoMarkersAgainstManual(autoMarkers, [manualMarker]);
    expect(filtered).toHaveLength(0);
  });

  it('manual marker non-overlapping → auto marker is kept', () => {
    const events: CursorEvent[] = [click(60, 960, 540)];
    const autoMarkers = generateAutoZoomMarkers(events, 0.5, 30, 1920, 1080);
    expect(autoMarkers).toHaveLength(1);
    const { endFrame } = autoMarkers[0];

    // Place manual marker far after the auto marker
    const manualMarker = createZoomMarker(endFrame + 100, endFrame + 200, { kind: 'manual' });
    const filtered = filterAutoMarkersAgainstManual(autoMarkers, [manualMarker]);
    expect(filtered).toHaveLength(1);
  });

  it('auto markers in existing list are not treated as blockers', () => {
    const events: CursorEvent[] = [click(60, 960, 540)];
    const candidates = generateAutoZoomMarkers(events, 0.5, 30, 1920, 1080);
    expect(candidates).toHaveLength(1);
    const { startFrame, endFrame } = candidates[0];

    // An existing auto marker in the same range should NOT block the new candidate
    const existingAuto = createZoomMarker(startFrame, endFrame, { kind: 'auto' });
    const filtered = filterAutoMarkersAgainstManual(candidates, [existingAuto]);
    expect(filtered).toHaveLength(1);
  });
});
