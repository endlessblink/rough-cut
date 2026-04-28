import type { EasingType, Tangent } from '@rough-cut/project-model';

/**
 * Solve cubic bezier: given control points (0,0), (p1x,p1y), (p2x,p2y), (1,1)
 * return y for a given x using Newton's method / binary search.
 */
function cubicBezierY(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  x: number,
): number {
  // Edge cases
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Coefficients for x(t) = 3*p1x*t*(1-t)^2 + 3*p2x*t^2*(1-t) + t^3
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;

  function sampleX(t: number): number {
    return ((ax * t + bx) * t + cx) * t;
  }

  function sampleY(t: number): number {
    return ((ay * t + by) * t + cy) * t;
  }

  function sampleDerivativeX(t: number): number {
    return (3 * ax * t + 2 * bx) * t + cx;
  }

  // Newton's method to solve for t given x
  let t = x;
  for (let i = 0; i < 8; i++) {
    const currentX = sampleX(t) - x;
    if (Math.abs(currentX) < 1e-7) break;
    const d = sampleDerivativeX(t);
    if (Math.abs(d) < 1e-6) break;
    t -= currentX / d;
  }

  // Clamp t
  t = Math.max(0, Math.min(1, t));

  return sampleY(t);
}

export function resolveEasing(
  type: EasingType,
  tangent?: Tangent,
): (t: number) => number {
  switch (type) {
    case 'linear':
      return (t) => t;

    case 'ease-in':
      // cubic-bezier(0.42, 0, 1, 1)
      return (t) => cubicBezierY(0.42, 0, 1, 1, t);

    case 'ease-out':
      // cubic-bezier(0, 0, 0.58, 1)
      return (t) => cubicBezierY(0, 0, 0.58, 1, t);

    case 'ease-in-out':
      // cubic-bezier(0.42, 0, 0.58, 1)
      return (t) => cubicBezierY(0.42, 0, 0.58, 1, t);

    case 'cubic-bezier': {
      if (tangent) {
        const { inX, inY, outX, outY } = tangent;
        return (t) => cubicBezierY(inX, inY, outX, outY, t);
      }
      // fallback to ease-in-out if no tangent provided
      return (t) => cubicBezierY(0.42, 0, 0.58, 1, t);
    }

    default:
      return (t) => t;
  }
}
