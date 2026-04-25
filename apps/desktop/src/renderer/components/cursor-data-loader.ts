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
 * @param totalFrames  Total frame count of the recording (in project fps)
 * @param sourceWidth  Recording width in pixels
 * @param sourceHeight  Recording height in pixels
 * @param eventsFps  Frame rate the events were sampled at. Defaults to projectFps.
 * @param projectFps  Frame rate the timeline plays at. Defaults to eventsFps.
 * @param eventsLeadFrames  Frames to subtract from each event before indexing.
 *   Compensates for the FFmpeg startup gap: the cursor recorder begins
 *   sampling before the file's first captured frame, so cursor[0] really
 *   represents wall-clock time `leadFrames/eventsFps` BEFORE file frame 0.
 *   Subtracting shifts cursor[0] forward to align with file frame 0.
 *   Defaults to 0.
 * @returns Frame-indexed cursor data for the overlay
 *
 * When `eventsFps` and `projectFps` differ, each event's frame is rescaled
 * by `projectFps / eventsFps` so cursor[playheadFrame] returns the cursor
 * sample from the same wall-clock moment the video frame represents. Without
 * this, takes recorded at one cadence and replayed at another (e.g. 60Hz
 * cursor sampling against a 30fps timeline) drift linearly with playback.
 */
export function buildCursorFrameData(
  events: readonly RawCursorEvent[],
  totalFrames: number,
  sourceWidth: number,
  sourceHeight: number,
  eventsFps?: number,
  projectFps?: number,
  eventsLeadFrames?: number,
): CursorFrameData {
  // 3 values per frame: normalizedX, normalizedY, isClick (0 or 1)
  const frames = new Float32Array(totalFrames * 3);
  // Initialize all to -1 (no data)
  frames.fill(-1);

  const scale =
    Number.isFinite(eventsFps) &&
    Number.isFinite(projectFps) &&
    (eventsFps as number) > 0 &&
    (projectFps as number) > 0 &&
    eventsFps !== projectFps
      ? (projectFps as number) / (eventsFps as number)
      : 1;

  const lead =
    Number.isFinite(eventsLeadFrames) && (eventsLeadFrames as number) > 0
      ? Math.round(eventsLeadFrames as number)
      : 0;

  // Sort events by frame (after rescaling and lead-shift so frame ordering
  // and any negative-frame drops happen on the final indexing values).
  const sorted = [...events]
    .map((e) =>
      lead === 0 && scale === 1
        ? e
        : { ...e, frame: Math.round((e.frame - lead) * scale) },
    )
    .sort((a, b) => a.frame - b.frame);

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
