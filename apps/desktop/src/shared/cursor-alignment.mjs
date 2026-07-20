// Cursor telemetry ↔ video clock alignment.
//
// Cursor samples are stamped on the telemetry clock: elapsed ms since the
// segment's `currentSegmentStartedAtMs`. The captured video's frame 0 is
// ffmpeg's first captured frame (`firstFrameMs`), which is a DIFFERENT wall
// moment. The gap between the two clocks varies by capture path:
//   - screen-only capture spawns ffmpeg asynchronously, so the telemetry
//     clock starts BEFORE the first video frame (cursor would trail video);
//   - unified camera capture awaits the ffmpeg spawn (retry loop) before the
//     segment clock is stamped, so telemetry starts AFTER the first video
//     frame (cursor runs ahead of video — measured +1107 ms on 2026-07-14).
//
// The recorder keeps sidecar/stop() events RAW on the telemetry clock
// (regression-guarded in recording-session.test.mjs) and reports the signed
// per-segment gap as `cursorAnchors`. Alignment onto the video clock happens
// exactly once, when events are ingested into a project document
// (createProjectForRecording, or the openProjectFile migration for legacy
// projects). Consumers read `metadata.cursorEvents` already aligned and must
// never shift again — `metadata.cursorEventsAligned` marks ingested assets.

const DEFAULT_FPS = 30;

/**
 * Shift raw telemetry events onto the video clock.
 *
 * `anchors` is one entry per recorded segment:
 *   { baseTimeMs, anchorOffsetMs }
 * where `baseTimeMs` is the accumulated recorded duration at the segment's
 * start (0 for the first segment) and `anchorOffsetMs` is the SIGNED gap
 * `firstFrameMs - segmentStartedAtMs`. Aligned time subtracts the cumulative
 * gap of every segment up to and including the event's own segment.
 *
 * Events that land before their segment's first video frame have no video to
 * align to and are dropped — clamping them to the segment start is the
 * regression from commit 4ef0aa3.
 */
export function alignCursorEvents(events, anchors, fps) {
  if (!Array.isArray(events) || events.length === 0) return [];
  const rate = Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_FPS;
  const valid = (Array.isArray(anchors) ? anchors : [])
    .filter((anchor) => anchor
      && Number.isFinite(anchor.baseTimeMs)
      && Number.isFinite(anchor.anchorOffsetMs)
      && anchor.baseTimeMs >= 0)
    .sort((a, b) => a.baseTimeMs - b.baseTimeMs);
  if (valid.length === 0 || valid.every((anchor) => anchor.anchorOffsetMs === 0)) {
    return events.slice();
  }

  let cumulativeMs = 0;
  const segments = valid.map((anchor) => {
    const segmentStartAlignedMs = anchor.baseTimeMs - cumulativeMs;
    cumulativeMs += anchor.anchorOffsetMs;
    return { baseTimeMs: anchor.baseTimeMs, cumulativeOffsetMs: cumulativeMs, segmentStartAlignedMs };
  });

  const aligned = [];
  for (const event of events) {
    if (!event || !Number.isFinite(event.timeMs)) continue;
    let segment = segments[0];
    for (const candidate of segments) {
      if (candidate.baseTimeMs <= event.timeMs) segment = candidate;
      else break;
    }
    const timeMs = event.timeMs - segment.cumulativeOffsetMs;
    if (timeMs < segment.segmentStartAlignedMs) continue;
    aligned.push({ ...event, timeMs, frame: Math.round((timeMs / 1000) * rate) });
  }
  return aligned;
}

/**
 * Derive cursor anchors from a legacy `.events.log` diagnostic sidecar for
 * recordings made before the recorder reported `cursorAnchors`.
 *
 * The telemetry clock's zero (`segmentStartedAtMs`) is not logged directly,
 * but every `cursor-sample-end` entry carries both its wall-clock `t`
 * (epoch seconds) and its telemetry-clock `elapsedMs`, so the first sample
 * recovers it as `t * 1000 - elapsedMs`.
 *
 * Only single-segment recordings are supported: a log containing
 * `recording-resume` returns null (per-segment reconstruction from legacy
 * logs is not worth the complexity — those projects stay as-is).
 */
export function deriveCursorAnchorsFromEventsLog(logText) {
  if (typeof logText !== 'string' || logText.length === 0) return null;
  let firstFrameMs = null;
  let segmentStartMs = null;
  for (const line of logText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (entry.kind === 'recording-resume') return null;
    if (entry.kind === 'first-frame-anchor' && firstFrameMs === null && Number.isFinite(entry.firstFrameMs)) {
      firstFrameMs = entry.firstFrameMs;
    } else if (
      entry.kind === 'cursor-sample-end'
      && segmentStartMs === null
      && entry.ok === true
      && Number.isFinite(entry.t)
      && Number.isFinite(entry.elapsedMs)
    ) {
      segmentStartMs = entry.t * 1000 - entry.elapsedMs;
    }
  }
  if (!Number.isFinite(firstFrameMs) || !Number.isFinite(segmentStartMs)) return null;
  const anchorOffsetMs = Math.round(firstFrameMs - segmentStartMs);
  // Legacy logs recorded the -progress-based estimate, which is an UPPER
  // bound on the true first-frame time (loose by the encoder pipeline depth,
  // ~1.5 s measured for screen-only libx264). A NEGATIVE offset (unified
  // camera capture, telemetry clock stamped after the ffmpeg spawn wait) is
  // therefore a guaranteed improvement to apply; a POSITIVE offset is
  // dominated by that estimator error — the true offset is near zero for the
  // screen-only path — and applying it would overcorrect by seconds. Skip it.
  if (anchorOffsetMs >= 0) return null;
  return [{ baseTimeMs: 0, anchorOffsetMs }];
}
