/**
 * Closed-form damped-spring solver.
 *
 * Solves mx'' + cx' + kx = 0 analytically for each step so motion is exact
 * for any dt — no Forward-Euler drift even at low frame rates. Three damping
 * regimes (underdamped / critically damped / overdamped) share the same call
 * signature so callers don't need to know which one their config selects.
 *
 * Algorithm derived from textbook damped harmonic oscillator math; pattern
 * inspired by Recordly (AGPL-3.0) — implementation written fresh.
 *
 * All time inputs are milliseconds. Internally converted to seconds.
 */

export interface SpringState {
  value: number;
  velocity: number;
  initialized: boolean;
}

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
  /** Position threshold to consider "at rest". Default 0.0005. */
  restDelta?: number;
  /** Velocity threshold (units per second) to consider "at rest". Default 0.02. */
  restSpeed?: number;
}

export function createSpringState(initialValue = 0): SpringState {
  return { value: initialValue, velocity: 0, initialized: false };
}

export function resetSpringState(state: SpringState, initialValue?: number): void {
  if (typeof initialValue === 'number') state.value = initialValue;
  state.velocity = 0;
  state.initialized = false;
}

/**
 * Clamp deltaMs to a sane integration window. A stalled rAF can produce a
 * 500 ms tick that would catapult the spring well past its target. Floor at
 * 1 ms to avoid divide-by-zero edge cases.
 */
export function clampDeltaMs(deltaMs: number, fallbackMs = 1000 / 60): number {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return fallbackMs;
  return Math.min(80, Math.max(1, deltaMs));
}

function msToSec(ms: number): number {
  return ms / 1000;
}

/**
 * Closed-form position of a damped spring after time `t` (seconds) given:
 *   target          — equilibrium position
 *   initialDelta    — (target - currentValue)
 *   initialVelocity — (-currentVelocity), sign convention from the textbook
 *                     transform x → (target - value)
 *   zeta            — damping ratio = c / (2 sqrt(km))
 *   omega0          — undamped angular frequency = sqrt(k/m)
 */
function solvePosition(
  t: number,
  target: number,
  initialDelta: number,
  initialVelocity: number,
  zeta: number,
  omega0: number,
): number {
  if (zeta < 1) {
    // Underdamped
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    const envelope = Math.exp(-zeta * omega0 * t);
    const cosTerm = initialDelta * Math.cos(omegaD * t);
    const sinTerm =
      ((initialVelocity + zeta * omega0 * initialDelta) / omegaD) *
      Math.sin(omegaD * t);
    return target - envelope * (cosTerm + sinTerm);
  }

  if (zeta === 1) {
    // Critically damped
    const envelope = Math.exp(-omega0 * t);
    return (
      target -
      envelope * (initialDelta + (initialVelocity + omega0 * initialDelta) * t)
    );
  }

  // Overdamped — cap the hyperbolic argument to keep cosh/sinh finite
  const omegaD = omega0 * Math.sqrt(zeta * zeta - 1);
  const envelope = Math.exp(-zeta * omega0 * t);
  const arg = Math.min(omegaD * t, 300);
  const coshTerm = omegaD * initialDelta * Math.cosh(arg);
  const sinhTerm = (initialVelocity + zeta * omega0 * initialDelta) * Math.sinh(arg);
  return target - (envelope * (coshTerm + sinhTerm)) / omegaD;
}

/**
 * Advance `state` toward `target` by `deltaMs` using the analytic solver.
 * Mutates `state` in place; returns the new value.
 *
 * The first call snaps to target (initializes); subsequent calls integrate.
 * When a spring is at-rest (within restDelta / restSpeed) it snaps to target
 * and zeroes velocity. For ζ ≥ 1 we additionally clamp on target-crossing —
 * a moving target (e.g. a per-frame easing curve) can carry velocity that
 * pushes an overdamped spring past the new target, producing visible wobble.
 */
export function stepSpring(
  state: SpringState,
  target: number,
  deltaMs: number,
  config: SpringConfig,
): number {
  if (!state.initialized || !Number.isFinite(state.value)) {
    state.value = target;
    state.velocity = 0;
    state.initialized = true;
    return state.value;
  }

  const restDelta = config.restDelta ?? 0.0005;
  const restSpeed = config.restSpeed ?? 0.02;

  if (
    Math.abs(target - state.value) <= restDelta &&
    Math.abs(state.velocity) <= restSpeed
  ) {
    state.value = target;
    state.velocity = 0;
    return state.value;
  }

  const dt = msToSec(clampDeltaMs(deltaMs));
  const omega0 = Math.sqrt(config.stiffness / config.mass);
  const zeta = config.damping / (2 * Math.sqrt(config.stiffness * config.mass));
  const initialDelta = target - state.value;
  const initialVelocity = -state.velocity;

  const newValue = solvePosition(dt, target, initialDelta, initialVelocity, zeta, omega0);

  // Overshoot clamp on critical / overdamped springs when target shifts each step.
  if (zeta >= 1) {
    const crossed =
      (state.value <= target && newValue > target) ||
      (state.value >= target && newValue < target);
    if (crossed) {
      state.value = target;
      state.velocity = 0;
      return state.value;
    }
  }

  // Velocity via forward-difference on the closed-form solution.
  const epsilon = 0.0001;
  const ahead = solvePosition(
    dt + epsilon,
    target,
    initialDelta,
    initialVelocity,
    zeta,
    omega0,
  );
  const newVelocity = (ahead - newValue) / epsilon;

  if (
    Math.abs(target - newValue) <= restDelta &&
    Math.abs(newVelocity) <= restSpeed
  ) {
    state.value = target;
    state.velocity = 0;
  } else {
    state.value = newValue;
    state.velocity = newVelocity;
  }
  return state.value;
}

/**
 * Cursor-follow spring config. `smoothing` ∈ [0, 2]:
 *   0   → very stiff, near-instant tracking
 *   0.6 → default, comfortable follow
 *   2   → very floaty, glides into position
 */
export function getCursorSpringConfig(smoothing: number): SpringConfig {
  const s = Math.max(0, Math.min(2, smoothing));
  if (s <= 0) {
    return { stiffness: 1000, damping: 100, mass: 1, restDelta: 0.0001, restSpeed: 0.001 };
  }
  // Two-segment curve: 0..0.5 stays snappy (legacy range), 0.5..2 gets floatier.
  const LEGACY = 0.5;
  if (s <= LEGACY) {
    const n = s / LEGACY; // 0..1
    return {
      stiffness: 760 - n * 420,
      damping: 34 + n * 24,
      mass: 0.85 + n * 0.55,
      restDelta: 0.0002,
      restSpeed: 0.01,
    };
  }
  const n = (s - LEGACY) / (2 - LEGACY); // 0..1
  return {
    stiffness: 340 - n * 180,
    damping: 58 + n * 22,
    mass: 1.35 + n * 0.45,
    restDelta: 0.0002,
    restSpeed: 0.01,
  };
}

/**
 * Zoom-scale spring config. `smoothness` ∈ [0, 1]:
 *   0 → near-instant snap to target scale
 *   0.5 → default, settles in ~0.4 s
 *   1 → floaty, ~0.8 s settle
 *
 * Damping ratio sits just above critical so the overshoot-clamp in
 * stepSpring keeps the curve monotonic without dragging the motion out.
 */
export function getZoomSpringConfig(smoothness = 0.5): SpringConfig {
  const s = Math.max(0, Math.min(1, smoothness));
  if (s <= 0) {
    return { stiffness: 1000, damping: 100, mass: 1, restDelta: 0.0001, restSpeed: 0.001 };
  }
  const scaled = s * 2; // map to internal 0..2 range
  return {
    stiffness: 100 / scaled,
    damping: 21,
    mass: 1.0 * scaled,
    restDelta: 0.0005,
    restSpeed: 0.015,
  };
}
