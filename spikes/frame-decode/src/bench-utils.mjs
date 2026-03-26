/**
 * Shared benchmarking utilities for all spike approaches.
 */

/** Run a function N times and collect timing stats */
export async function benchmark(name, fn, iterations = 100) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn(i);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return {
    name,
    iterations,
    p50: times[Math.floor(times.length * 0.5)],
    p95: times[Math.floor(times.length * 0.95)],
    p99: times[Math.floor(times.length * 0.99)],
    min: times[0],
    max: times[times.length - 1],
    mean: times.reduce((s, t) => s + t, 0) / times.length,
  };
}

/** Format benchmark result as a table row */
export function formatResult(result) {
  return [
    result.name.padEnd(30),
    `p50=${result.p50.toFixed(2)}ms`,
    `p95=${result.p95.toFixed(2)}ms`,
    `p99=${result.p99.toFixed(2)}ms`,
    `min=${result.min.toFixed(2)}ms`,
    `max=${result.max.toFixed(2)}ms`,
  ].join('  ');
}

/** Read a specific pixel region to extract the burned-in frame number */
export function readFrameNumber(imageData, width, height) {
  // TODO: Implement pixel pattern matching or simple OCR
  // For the spike, we can use a simpler approach:
  // The frame number is rendered as white text on black background at center
  // We can sample pixels and do basic recognition
  return -1; // placeholder
}

/**
 * Verify frame accuracy: requested frame N, got frame M.
 * Returns { accurate: boolean, requested: number, actual: number, delta: number }
 */
export function verifyFrameAccuracy(requested, actual) {
  return {
    accurate: requested === actual,
    requested,
    actual,
    delta: Math.abs(requested - actual),
  };
}

/** Measure memory usage delta */
export function measureMemory() {
  if (typeof process !== 'undefined') {
    const usage = process.memoryUsage();
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      rss: usage.rss,
      external: usage.external,
    };
  }
  return null;
}
