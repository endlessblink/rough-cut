import { describe, expect, it } from 'vitest';
import { createZoomMarker } from '@rough-cut/project-model';
import {
  getMarkerMoveBounds,
  moveZoomMarker,
  resizeZoomMarkerEnd,
  resizeZoomMarkerStart,
} from './zoom-segment-edit.js';

describe('zoom segment editing', () => {
  it('moves a marker by a frame delta while preserving its span and metadata', () => {
    const marker = createZoomMarker(30, 90, { strength: 0.75, kind: 'auto' });
    const [moved] = moveZoomMarker([marker], marker.id, 12, { durationFrames: 180 });

    expect(moved.startFrame).toBe(42);
    expect(moved.endFrame).toBe(102);
    expect(moved.strength).toBe(0.75);
    expect(moved.kind).toBe('auto');
  });

  it('clamps movement to the timeline start and end', () => {
    const marker = createZoomMarker(30, 90);

    expect(moveZoomMarker([marker], marker.id, -100, { durationFrames: 120 })[0]).toMatchObject({
      startFrame: 0,
      endFrame: 60,
    });
    expect(moveZoomMarker([marker], marker.id, 100, { durationFrames: 120 })[0]).toMatchObject({
      startFrame: 60,
      endFrame: 120,
    });
  });

  it('prevents movement from overlapping neighboring markers', () => {
    const before = createZoomMarker(0, 30);
    const marker = createZoomMarker(40, 70);
    const after = createZoomMarker(90, 120);

    expect(moveZoomMarker([before, marker, after], marker.id, -50, { durationFrames: 180 })[1]).toMatchObject({
      startFrame: 30,
      endFrame: 60,
    });
    expect(moveZoomMarker([before, marker, after], marker.id, 50, { durationFrames: 180 })[1]).toMatchObject({
      startFrame: 60,
      endFrame: 90,
    });
  });

  it('resizes the start edge with min duration and previous-marker bounds', () => {
    const before = createZoomMarker(0, 30);
    const marker = createZoomMarker(40, 90);

    expect(resizeZoomMarkerStart([before, marker], marker.id, -20, { durationFrames: 160 })[1]).toMatchObject({
      startFrame: 30,
      endFrame: 90,
    });
    expect(resizeZoomMarkerStart([before, marker], marker.id, 45, { durationFrames: 160, minDurationFrames: 20 })[1]).toMatchObject({
      startFrame: 70,
      endFrame: 90,
    });
  });

  it('resizes the end edge with min duration and next-marker bounds', () => {
    const marker = createZoomMarker(40, 90);
    const after = createZoomMarker(120, 150);

    expect(resizeZoomMarkerEnd([marker, after], marker.id, 80, { durationFrames: 200 })[0]).toMatchObject({
      startFrame: 40,
      endFrame: 120,
    });
    expect(resizeZoomMarkerEnd([marker, after], marker.id, -45, { durationFrames: 200, minDurationFrames: 20 })[0]).toMatchObject({
      startFrame: 40,
      endFrame: 60,
    });
  });

  it('returns the original marker list when the marker is missing', () => {
    const marker = createZoomMarker(40, 90);
    const result = moveZoomMarker([marker], 'missing' as typeof marker.id, 10, { durationFrames: 200 });

    expect(result).toBeInstanceOf(Array);
    expect(result[0]).toBe(marker);
  });

  it('reports available move bounds for a marker', () => {
    const before = createZoomMarker(0, 30);
    const marker = createZoomMarker(40, 70);
    const after = createZoomMarker(90, 120);

    expect(getMarkerMoveBounds([before, marker, after], marker.id, 200)).toEqual({
      minStart: 30,
      maxStart: 60,
    });
  });
});
