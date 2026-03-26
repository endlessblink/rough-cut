import type { KeyframeTrack } from '@rough-cut/project-model';
import { resolveEasing } from './easing.js';
import type { ResolvedParams } from './types.js';

export function interpolateNumber(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

export function evaluateSingleTrack(
  track: KeyframeTrack,
  frame: number,
  defaultValue: number | string | boolean,
): number | string | boolean {
  const { keyframes } = track;

  if (keyframes.length === 0) {
    return defaultValue;
  }

  // Sort keyframes by frame (defensive, should already be sorted)
  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (first === undefined || last === undefined) {
    return defaultValue;
  }

  // Before first keyframe — hold
  if (frame <= first.frame) {
    return first.value;
  }

  // After last keyframe — hold
  if (frame >= last.frame) {
    return last.value;
  }

  // Find surrounding keyframes
  let prevIndex = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i];
    const next = sorted[i + 1];
    if (curr !== undefined && next !== undefined && frame >= curr.frame && frame <= next.frame) {
      prevIndex = i;
      break;
    }
  }

  const kf0 = sorted[prevIndex];
  const kf1 = sorted[prevIndex + 1];

  if (kf0 === undefined || kf1 === undefined) {
    return defaultValue;
  }

  // Exactly on a keyframe
  if (frame === kf0.frame) return kf0.value;
  if (frame === kf1.frame) return kf1.value;

  const span = kf1.frame - kf0.frame;
  const rawT = (frame - kf0.frame) / span;

  const v0 = kf0.value;
  const v1 = kf1.value;

  // String values — snap to nearest (use first keyframe's value until midpoint)
  if (typeof v0 === 'string' || typeof v1 === 'string') {
    return rawT < 0.5 ? v0 : v1;
  }

  // Numeric interpolation with easing from the first keyframe
  const easingFn = resolveEasing(kf0.easing, kf0.tangent);
  const easedT = easingFn(rawT);
  return interpolateNumber(v0 as number, v1 as number, easedT);
}

export function evaluateKeyframeTracks(
  tracks: readonly KeyframeTrack[],
  frame: number,
  defaults: Record<string, number | string | boolean>,
): ResolvedParams {
  const result: ResolvedParams = { ...defaults };

  for (const track of tracks) {
    const defaultValue = defaults[track.property] ?? 0;
    result[track.property] = evaluateSingleTrack(track, frame, defaultValue);
  }

  return result;
}
