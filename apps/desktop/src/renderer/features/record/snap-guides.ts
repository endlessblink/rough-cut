/**
 * snap-guides.ts
 *
 * Pure functions for snap-to-guide behavior during drag operations
 * and alignment toolbar actions. Zero React/DOM dependencies.
 */

import type { Rect } from './template-layout/types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SnapLine {
  axis: 'x' | 'y';
  position: number;
  label?: string;
}

export interface AxisSnap {
  delta: number;
  guides: SnapLine[];
}

export interface SnapResult {
  x: AxisSnap;
  y: AxisSnap;
}

export type Alignment =
  | 'left'
  | 'center-h'
  | 'right'
  | 'top'
  | 'center-v'
  | 'bottom';

// ─── Snap target generation ──────────────────────────────────────────────────

/**
 * Build snap target lines from the container bounds and an optional second element.
 * Returns up to 12 targets: 3 container (edges + center) per axis, plus
 * 3 per axis for the other element if provided.
 */
export function buildSnapTargets(
  containerW: number,
  containerH: number,
  otherRect: Rect | null,
): SnapLine[] {
  const targets: SnapLine[] = [
    // Container x-axis targets (vertical lines)
    { axis: 'x', position: 0, label: 'container-left' },
    { axis: 'x', position: containerW / 2, label: 'container-center-x' },
    { axis: 'x', position: containerW, label: 'container-right' },
    // Container y-axis targets (horizontal lines)
    { axis: 'y', position: 0, label: 'container-top' },
    { axis: 'y', position: containerH / 2, label: 'container-center-y' },
    { axis: 'y', position: containerH, label: 'container-bottom' },
  ];

  if (otherRect) {
    const cx = otherRect.x + otherRect.width / 2;
    const cy = otherRect.y + otherRect.height / 2;
    targets.push(
      { axis: 'x', position: otherRect.x, label: 'other-left' },
      { axis: 'x', position: cx, label: 'other-center-x' },
      { axis: 'x', position: otherRect.x + otherRect.width, label: 'other-right' },
      { axis: 'y', position: otherRect.y, label: 'other-top' },
      { axis: 'y', position: cy, label: 'other-center-y' },
      { axis: 'y', position: otherRect.y + otherRect.height, label: 'other-bottom' },
    );
  }

  return targets;
}

// ─── Snap computation ────────────────────────────────────────────────────────

/**
 * For the moving rect, compute the smallest snap delta per axis.
 *
 * Each axis tests 3 anchor points of the moving rect (start, center, end)
 * against all matching-axis targets. The closest match within threshold wins.
 * Axes are independent — snapping on X does not affect Y.
 */
export function computeSnap(
  movingRect: Rect,
  targets: SnapLine[],
  threshold: number,
): SnapResult {
  const xAnchors = [
    movingRect.x,
    movingRect.x + movingRect.width / 2,
    movingRect.x + movingRect.width,
  ];
  const yAnchors = [
    movingRect.y,
    movingRect.y + movingRect.height / 2,
    movingRect.y + movingRect.height,
  ];

  const xTargets = targets.filter((t) => t.axis === 'x');
  const yTargets = targets.filter((t) => t.axis === 'y');

  const xSnap = findClosestSnap(xAnchors, xTargets, threshold, 'x');
  const ySnap = findClosestSnap(yAnchors, yTargets, threshold, 'y');

  return { x: xSnap, y: ySnap };
}

function findClosestSnap(
  anchors: number[],
  targets: SnapLine[],
  threshold: number,
  axis: 'x' | 'y',
): AxisSnap {
  let bestDelta = Infinity;
  let bestGuides: SnapLine[] = [];

  for (const anchor of anchors) {
    for (const target of targets) {
      const delta = target.position - anchor;
      const absDelta = Math.abs(delta);
      if (absDelta <= threshold) {
        if (absDelta < Math.abs(bestDelta)) {
          bestDelta = delta;
          bestGuides = [{ axis, position: target.position, label: target.label }];
        } else if (absDelta === Math.abs(bestDelta) && delta === bestDelta) {
          // Same distance, same direction — collect both guides
          bestGuides.push({ axis, position: target.position, label: target.label });
        }
      }
    }
  }

  if (!isFinite(bestDelta)) {
    return { delta: 0, guides: [] };
  }

  return { delta: bestDelta, guides: bestGuides };
}

// ─── Alignment ───────────────────────────────────────────────────────────────

/**
 * Returns a new rect aligned within the container according to the given alignment.
 * Only position changes — size is preserved.
 */
export function alignRect(
  rect: Rect,
  container: Rect,
  alignment: Alignment,
): Rect {
  const result = { ...rect };

  switch (alignment) {
    case 'left':
      result.x = container.x;
      break;
    case 'center-h':
      result.x = container.x + (container.width - rect.width) / 2;
      break;
    case 'right':
      result.x = container.x + container.width - rect.width;
      break;
    case 'top':
      result.y = container.y;
      break;
    case 'center-v':
      result.y = container.y + (container.height - rect.height) / 2;
      break;
    case 'bottom':
      result.y = container.y + container.height - rect.height;
      break;
  }

  return result;
}
