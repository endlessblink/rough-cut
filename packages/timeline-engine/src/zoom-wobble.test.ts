import { describe, it, expect } from 'vitest';
import { getZoomTransformForMarker } from './zoom-transform.js';
import { createZoomMarker } from '@rough-cut/project-model';

/**
 * Wobble regression: asserts the focal trajectory during a marker is
 * MONOTONIC for a STATIC cursor. Any oscillation in focal.x or focal.y
 * across consecutive frames implies a scale-dependent clamp is pulling
 * the focal toward 0.5 mid-ramp and releasing it as scale grows back.
 *
 * "Wobble" here = focal direction reverses during the ramp.
 */

function focalFromTransform(t: { scale: number; translateX: number; translateY: number }) {
  const denom = 1 - t.scale;
  if (Math.abs(denom) < 1e-9) return { x: 0.5, y: 0.5 };
  return { x: t.translateX / denom + 0.5, y: t.translateY / denom + 0.5 };
}

const baseOptions = {
  followCursor: true,
  followAnimation: 'smooth' as const,
  followPadding: 0.25,
  fps: 30,
};

function sampleTrajectory(
  marker: ReturnType<typeof createZoomMarker>,
  cursor: { x: number; y: number },
) {
  const samples: Array<{ frame: number; focalX: number; focalY: number; scale: number }> = [];
  const opts = { ...baseOptions, getCursorPosition: () => cursor };
  for (let f = marker.startFrame; f < marker.endFrame; f += 1) {
    const t = getZoomTransformForMarker(f, marker, opts);
    if (t === null) continue;
    const focal = focalFromTransform(t);
    samples.push({ frame: f, focalX: focal.x, focalY: focal.y, scale: t.scale });
  }
  return samples;
}

function isMonotonic(values: number[], tolerance = 1e-4): { ok: boolean; details: string } {
  if (values.length < 2) return { ok: true, details: 'too short' };
  // Determine direction from first non-zero delta
  let dir: -1 | 0 | 1 = 0;
  for (let i = 1; i < values.length; i += 1) {
    const d = values[i] - values[i - 1];
    if (Math.abs(d) < tolerance) continue;
    dir = d > 0 ? 1 : -1;
    break;
  }
  if (dir === 0) return { ok: true, details: 'all values within tolerance' };
  for (let i = 1; i < values.length; i += 1) {
    const d = values[i] - values[i - 1];
    if (dir === 1 && d < -tolerance) {
      return { ok: false, details: `direction reversal at i=${i}: ${values[i - 1].toFixed(4)} → ${values[i].toFixed(4)}` };
    }
    if (dir === -1 && d > tolerance) {
      return { ok: false, details: `direction reversal at i=${i}: ${values[i - 1].toFixed(4)} → ${values[i].toFixed(4)}` };
    }
  }
  return { ok: true, details: `monotonic ${dir > 0 ? 'increasing' : 'decreasing'}` };
}

describe('wobble — focal must not reverse direction during ramp for static cursor', () => {
  it('static cursor near top edge (y=0.15): focalY monotonic across whole marker', () => {
    const marker = createZoomMarker(0, 60, {
      kind: 'manual',
      strength: 1,
      zoomInDuration: 18,
      zoomOutDuration: 0,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const samples = sampleTrajectory(marker, { x: 0.5, y: 0.15 });
    const result = isMonotonic(samples.map((s) => s.focalY));
    expect(result.ok, `focalY trajectory wobbled: ${result.details}\n${samples.map((s) => `f=${s.frame} y=${s.focalY.toFixed(3)} scale=${s.scale.toFixed(2)}`).join('\n')}`).toBe(true);
  });

  it('static cursor near bottom edge (y=0.85): focalY monotonic', () => {
    const marker = createZoomMarker(0, 60, {
      kind: 'manual',
      strength: 1,
      zoomInDuration: 18,
      zoomOutDuration: 0,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const samples = sampleTrajectory(marker, { x: 0.5, y: 0.85 });
    const result = isMonotonic(samples.map((s) => s.focalY));
    expect(result.ok, `focalY trajectory wobbled: ${result.details}`).toBe(true);
  });

  it('static cursor near right edge (x=0.85): focalX monotonic', () => {
    const marker = createZoomMarker(0, 60, {
      kind: 'manual',
      strength: 1,
      zoomInDuration: 18,
      zoomOutDuration: 0,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const samples = sampleTrajectory(marker, { x: 0.85, y: 0.5 });
    const result = isMonotonic(samples.map((s) => s.focalX));
    expect(result.ok, `focalX trajectory wobbled: ${result.details}`).toBe(true);
  });

  it('static cursor diagonally off-center (x=0.85, y=0.15): both focal axes monotonic', () => {
    const marker = createZoomMarker(0, 60, {
      kind: 'manual',
      strength: 1,
      zoomInDuration: 18,
      zoomOutDuration: 0,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const samples = sampleTrajectory(marker, { x: 0.85, y: 0.15 });
    const xResult = isMonotonic(samples.map((s) => s.focalX));
    const yResult = isMonotonic(samples.map((s) => s.focalY));
    expect(xResult.ok, `focalX wobbled: ${xResult.details}`).toBe(true);
    expect(yResult.ok, `focalY wobbled: ${yResult.details}`).toBe(true);
  });

  it('static cursor diagonally off-center: also through ramp-out (zoomOut=18)', () => {
    const marker = createZoomMarker(0, 90, {
      kind: 'manual',
      strength: 1,
      zoomInDuration: 18,
      zoomOutDuration: 18,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const samples = sampleTrajectory(marker, { x: 0.85, y: 0.15 });
    // During ramp-out, focal CAN shift back as the clamp tightens (geometric).
    // But it must not oscillate — direction reversal indicates wobble.
    // We split into ramp-in [0..18) and ramp-out [72..90) and check each is monotonic.
    const rampIn = samples.filter((s) => s.frame < 18);
    const rampOut = samples.filter((s) => s.frame >= 72);
    const xRampIn = isMonotonic(rampIn.map((s) => s.focalX));
    const yRampIn = isMonotonic(rampIn.map((s) => s.focalY));
    const xRampOut = isMonotonic(rampOut.map((s) => s.focalX));
    const yRampOut = isMonotonic(rampOut.map((s) => s.focalY));
    expect(xRampIn.ok, `ramp-in focalX wobbled: ${xRampIn.details}`).toBe(true);
    expect(yRampIn.ok, `ramp-in focalY wobbled: ${yRampIn.details}`).toBe(true);
    expect(xRampOut.ok, `ramp-out focalX wobbled: ${xRampOut.details}`).toBe(true);
    expect(yRampOut.ok, `ramp-out focalY wobbled: ${yRampOut.details}`).toBe(true);
  });

  it('auto-kind marker shows identical trajectory to manual-kind', () => {
    const opts = { kind: 'manual' as const, strength: 1, zoomInDuration: 18, zoomOutDuration: 0, focalPoint: { x: 0.5, y: 0.5 } };
    const manual = createZoomMarker(0, 60, opts);
    const auto = createZoomMarker(0, 60, { ...opts, kind: 'auto' });
    const cursor = { x: 0.85, y: 0.15 };
    const mSamples = sampleTrajectory(manual, cursor);
    const aSamples = sampleTrajectory(auto, cursor);
    expect(mSamples.length).toBe(aSamples.length);
    for (let i = 0; i < mSamples.length; i += 1) {
      expect(mSamples[i].focalX).toBeCloseTo(aSamples[i].focalX, 6);
      expect(mSamples[i].focalY).toBeCloseTo(aSamples[i].focalY, 6);
      expect(mSamples[i].scale).toBeCloseTo(aSamples[i].scale, 6);
    }
  });
});

describe('wobble — screen-position smoothness (geometric correctness)', () => {
  it('Mode A: static cursor near edge stays at its screen position throughout the ramp', () => {
    // In zoom-around-cursor mode, the cursor's rendered screen position should
    // remain essentially constant throughout the zoom — content magnifies
    // around it. The total cursor drift across all frames must be tiny (no
    // visible slide).
    //
    // Screen position formula (Mode A):
    //   screen_p = (cursor - 0.5) * scale + 0.5 + (focal - 0.5) * (1 - scale)
    // When focal = cursor exactly, screen_p = cursor (constant).
    const marker = createZoomMarker(0, 60, {
      kind: 'manual',
      strength: 1,
      zoomInDuration: 18,
      zoomOutDuration: 0,
      focalPoint: { x: 0.5, y: 0.5 },
    });
    const cursor = { x: 0.85, y: 0.15 };
    const samples = sampleTrajectory(marker, cursor);
    const screenX = samples.map((s) => (cursor.x - 0.5) * s.scale + 0.5 + (s.focalX - 0.5) * (1 - s.scale));
    const screenY = samples.map((s) => (cursor.y - 0.5) * s.scale + 0.5 + (s.focalY - 0.5) * (1 - s.scale));
    // Total drift across the entire marker must be < 0.02 (≈ 20 pixels on a 1080p canvas).
    const driftX = Math.max(...screenX) - Math.min(...screenX);
    const driftY = Math.max(...screenY) - Math.min(...screenY);
    expect(driftX, `cursor X drifted ${driftX.toFixed(4)} on screen during zoom`).toBeLessThan(0.02);
    expect(driftY, `cursor Y drifted ${driftY.toFixed(4)} on screen during zoom`).toBeLessThan(0.02);
  });
});
