/**
 * useClickSoundPlayback — fire a click sound effect on each `'down'` cursor
 * event whose timestamp falls between the previous and current playhead frame.
 *
 * The hook is idempotent: it tracks the last played event by index so a single
 * click only fires once per playthrough, even when the playhead emits
 * multiple ticks per video frame.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { CursorEvent } from '@rough-cut/project-model';
import { playClickSound } from '../audio/click-sound.js';

/**
 * Convert raw cursor events into the project's frame domain and keep only
 * the click-down events. The frames are sorted ascending so we can advance
 * a single index pointer as the playhead moves.
 */
export function buildClickFrameTimeline(
  events: readonly CursorEvent[] | null,
  cursorEventsFps: number,
  projectFps: number,
  clipTimelineIn: number,
): readonly number[] {
  if (!events || events.length === 0 || cursorEventsFps <= 0 || projectFps <= 0) return [];
  const ratio = projectFps / cursorEventsFps;
  const result: number[] = [];
  for (const event of events) {
    if (event.type !== 'down') continue;
    // Match export-side and visual click-effect behavior: fire on any
    // mouse button. The cursor frame data the export consumes drops
    // button info, so filtering here would diverge the two paths.
    const projectFrame = Math.round(event.frame * ratio) + clipTimelineIn;
    result.push(projectFrame);
  }
  result.sort((a, b) => a - b);
  return result;
}

interface UseClickSoundPlaybackArgs {
  cursorEvents: readonly CursorEvent[] | null;
  cursorEventsFps: number;
  projectFps: number;
  clipTimelineIn: number;
  playheadFrame: number;
  isPlaying: boolean;
  enabled: boolean;
}

/**
 * Subscribe a side-effect: emit a click SFX whenever the playhead crosses
 * a `'down'` event during forward playback. Becomes a no-op when `enabled`
 * is false, when the recording has no cursor events, or while paused.
 */
export function useClickSoundPlayback({
  cursorEvents,
  cursorEventsFps,
  projectFps,
  clipTimelineIn,
  playheadFrame,
  isPlaying,
  enabled,
}: UseClickSoundPlaybackArgs): void {
  const clickFrames = useMemo(
    () => buildClickFrameTimeline(cursorEvents, cursorEventsFps, projectFps, clipTimelineIn),
    [cursorEvents, cursorEventsFps, projectFps, clipTimelineIn],
  );

  // Track the previous playhead frame so we can detect crossings without
  // depending on continuous monotonic ticks (the transport may skip frames).
  const lastFrameRef = useRef<number>(playheadFrame);

  useEffect(() => {
    // Reset crossing tracker on pause, scrub, or feature toggle so a resume
    // doesn't replay every click between 0 and the current playhead.
    lastFrameRef.current = playheadFrame;
  }, [enabled, isPlaying, clickFrames, playheadFrame]);
  // ^ depending on playheadFrame here is intentional: after pause/scrub we
  //   want to "anchor" the tracker at wherever the user landed before the
  //   next frame-advance during playback.

  useEffect(() => {
    if (!enabled || !isPlaying) return;
    const prev = lastFrameRef.current;
    const curr = playheadFrame;
    if (curr <= prev) {
      lastFrameRef.current = curr;
      return;
    }
    // Find click events strictly after `prev` and at or before `curr`.
    // Linear scan is fine — clickFrames is small (<200 typical).
    for (const frame of clickFrames) {
      if (frame > prev && frame <= curr) {
        playClickSound();
      } else if (frame > curr) {
        break;
      }
    }
    lastFrameRef.current = curr;
  }, [enabled, isPlaying, playheadFrame, clickFrames]);
}
