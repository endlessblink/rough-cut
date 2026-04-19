/**
 * Loads cursor event data from an NDJSON file and converts it
 * to a frame-indexed Float32Array for efficient per-frame lookup.
 */
import type { CursorFrameData } from './CursorOverlay.js';

interface RawCursorEvent {
  frame: number;
  x: number;
  y: number;
  type: string;
  button: number;
}

/**
 * Build a CursorFrameData from raw cursor events.
 *
 * @param events  Raw cursor events from the NDJSON sidecar
 * @param totalFrames  Total frame count of the recording
 * @param sourceWidth  Recording width in pixels
 * @param sourceHeight  Recording height in pixels
 * @returns Frame-indexed cursor data for the overlay
 */
export function buildCursorFrameData(
  events: readonly RawCursorEvent[],
  totalFrames: number,
  sourceWidth: number,
  sourceHeight: number,
): CursorFrameData {
  // 3 values per frame: normalizedX, normalizedY, isClick (0 or 1)
  const frames = new Float32Array(totalFrames * 3);
  // Initialize all to -1 (no data)
  frames.fill(-1);

  // Sort events by frame
  const sorted = [...events].sort((a, b) => a.frame - b.frame);

  // Assign positions and click flags at exact frames
  for (const e of sorted) {
    if (e.frame < 0 || e.frame >= totalFrames) continue;
    const idx = e.frame * 3;
    // Normalize coordinates to 0-1
    frames[idx] = e.x / sourceWidth;
    frames[idx + 1] = e.y / sourceHeight;
    if (e.type === 'down') {
      frames[idx + 2] = 1;
    } else if (frames[idx + 2]! < 0) {
      frames[idx + 2] = 0;
    }
  }

  // Fill gaps via linear interpolation between known positions
  let lastKnownFrame = -1;
  for (let f = 0; f < totalFrames; f++) {
    const idx = f * 3;
    if (frames[idx]! >= 0) {
      // This frame has data — interpolate the gap if there was one
      if (lastKnownFrame >= 0 && f - lastKnownFrame > 1) {
        const startIdx = lastKnownFrame * 3;
        const endIdx = idx;
        const gap = f - lastKnownFrame;
        for (let g = 1; g < gap; g++) {
          const t = g / gap;
          const gIdx = (lastKnownFrame + g) * 3;
          frames[gIdx] = frames[startIdx]! + (frames[endIdx]! - frames[startIdx]!) * t;
          frames[gIdx + 1] = frames[startIdx + 1]! + (frames[endIdx + 1]! - frames[startIdx + 1]!) * t;
          frames[gIdx + 2] = 0; // no click during interpolated frames
        }
      }
      lastKnownFrame = f;
    }
  }

  // Fill frames before first event and after last event with nearest known position
  if (lastKnownFrame >= 0) {
    // Find first known frame
    let firstKnown = 0;
    while (firstKnown < totalFrames && frames[firstKnown * 3]! < 0) firstKnown++;

    // Fill before first known
    if (firstKnown > 0 && firstKnown < totalFrames) {
      const srcIdx = firstKnown * 3;
      for (let f = 0; f < firstKnown; f++) {
        const idx = f * 3;
        frames[idx] = frames[srcIdx]!;
        frames[idx + 1] = frames[srcIdx + 1]!;
        frames[idx + 2] = 0;
      }
    }

    // Fill after last known
    if (lastKnownFrame < totalFrames - 1) {
      const srcIdx = lastKnownFrame * 3;
      for (let f = lastKnownFrame + 1; f < totalFrames; f++) {
        const idx = f * 3;
        frames[idx] = frames[srcIdx]!;
        frames[idx + 1] = frames[srcIdx + 1]!;
        frames[idx + 2] = 0;
      }
    }
  }

  return { frames, frameCount: totalFrames, sourceWidth, sourceHeight };
}

/**
 * Parse NDJSON content string into raw cursor events.
 */
export function parseNdjsonCursorEvents(ndjson: string): RawCursorEvent[] {
  return ndjson
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as RawCursorEvent);
}
