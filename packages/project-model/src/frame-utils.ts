import { createDefaultRecordingVisibility } from './factories.js';
import type { Clip, RecordingVisibility, RecordingVisibilitySegment } from './types.js';

/**
 * Convert a frame number to seconds at the given FPS.
 */
export function frameToSeconds(frame: number, fps: number): number {
  return frame / fps;
}

/**
 * Convert seconds to a frame number at the given FPS.
 * Rounds to the nearest integer.
 */
export function secondsToFrame(seconds: number, fps: number): number {
  return Math.round(seconds * fps);
}

/**
 * Convert a frame number to a timecode string "HH:MM:SS:FF".
 */
export function framesToTimecode(frame: number, fps: number): string {
  const totalFrames = Math.max(0, Math.floor(frame));
  const ff = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const ss = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mm = totalMinutes % 60;
  const hh = Math.floor(totalMinutes / 60);

  return [
    String(hh).padStart(2, '0'),
    String(mm).padStart(2, '0'),
    String(ss).padStart(2, '0'),
    String(ff).padStart(2, '0'),
  ].join(':');
}

/**
 * Parse a timecode string "HH:MM:SS:FF" back to a frame number.
 */
export function timecodeToFrames(timecode: string, fps: number): number {
  const parts = timecode.split(':');
  if (parts.length !== 4) {
    throw new Error(`Invalid timecode format: "${timecode}" — expected "HH:MM:SS:FF"`);
  }
  const [hh, mm, ss, ff] = parts.map(Number) as [number, number, number, number];
  return hh * 3600 * fps + mm * 60 * fps + ss * fps + ff;
}

/**
 * Timeline duration of a clip in frames.
 */
export function clipDurationFrames(clip: Clip): number {
  return clip.timelineOut - clip.timelineIn;
}

/**
 * Source duration of a clip in frames.
 */
export function clipSourceDurationFrames(clip: Clip): number {
  return clip.sourceOut - clip.sourceIn;
}

export function getActiveRecordingVisibilitySegment(
  segments: readonly RecordingVisibilitySegment[] | undefined,
  sourceFrame: number,
): RecordingVisibilitySegment | undefined {
  if (!segments || segments.length === 0) return undefined;
  return [...segments]
    .filter((segment) => segment.frame <= sourceFrame)
    .sort((left, right) => right.frame - left.frame)[0];
}

export function resolveRecordingVisibility(
  segments: readonly RecordingVisibilitySegment[] | undefined,
  sourceFrame: number,
): RecordingVisibility {
  return getActiveRecordingVisibilitySegment(segments, sourceFrame) ?? createDefaultRecordingVisibility();
}
