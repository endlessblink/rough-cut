import type { CursorEvent, ZoomMarker, Frame } from '@rough-cut/project-model';
import { createZoomMarker } from '@rough-cut/project-model';

// ---------------------------------------------------------------------------
// Config derived from intensity
// ---------------------------------------------------------------------------

interface ZoomConfig {
  clusterGapFrames: number;
  zoomScale: number;
  zoomInFrames: number;
  holdPaddingFrames: number;
  zoomOutFrames: number;
  teleportThreshold: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

function deriveConfig(intensity: number, frameRate: number): ZoomConfig {
  const s = frameRate / 30;

  if (intensity <= 0.3) {
    const t = intensity / 0.3;
    return {
      clusterGapFrames: Math.round(lerp(90, 60, t) * s),
      zoomScale: lerp(1.3, 1.5, t),
      zoomInFrames: Math.round(lerp(30, 27, t) * s),
      holdPaddingFrames: Math.round(lerp(40, 30, t) * s),
      zoomOutFrames: Math.round(lerp(36, 33, t) * s),
      teleportThreshold: 0.4,
    };
  } else if (intensity <= 0.7) {
    const t = (intensity - 0.3) / 0.4;
    return {
      clusterGapFrames: Math.round(lerp(60, 30, t) * s),
      zoomScale: lerp(1.5, 2.0, t),
      zoomInFrames: Math.round(lerp(27, 21, t) * s),
      holdPaddingFrames: Math.round(lerp(30, 20, t) * s),
      zoomOutFrames: Math.round(lerp(33, 27, t) * s),
      teleportThreshold: 0.3,
    };
  } else {
    const t = (intensity - 0.7) / 0.3;
    return {
      clusterGapFrames: Math.round(lerp(30, 15, t) * s),
      zoomScale: lerp(2.0, 3.0, t),
      zoomInFrames: Math.round(lerp(21, 15, t) * s),
      holdPaddingFrames: Math.round(lerp(20, 10, t) * s),
      zoomOutFrames: Math.round(lerp(27, 21, t) * s),
      teleportThreshold: 0.2,
    };
  }
}

// ---------------------------------------------------------------------------
// Step 1: Extract trigger events (clicks, or teleports as fallback)
// ---------------------------------------------------------------------------

// Minimum drag duration in frames before we treat a button-down/up pair as a
// drag rather than a click. Below this we already have the click event itself
// as a trigger, so emitting a separate drag trigger would be redundant.
const MIN_DRAG_DURATION_FRAMES = 6;

function extractTriggerEvents(
  cursorEvents: readonly CursorEvent[],
  config: ZoomConfig,
  sourceWidth: number,
  sourceHeight: number,
): CursorEvent[] {
  const clicks = cursorEvents.filter(
    (e) => e.type === 'down' && e.button === 0,
  );

  if (clicks.length > 0) {
    const drags = extractDragTriggers(cursorEvents, config, sourceWidth, sourceHeight);
    if (drags.length === 0) return clicks;
    // Combine and sort so downstream clustering treats them as one stream.
    return [...clicks, ...drags].sort((a, b) => a.frame - b.frame);
  }

  // Fallback when the recording predates click capture: detect large cursor
  // teleports as a proxy for "user moved attention here."
  const moves = cursorEvents.filter((e) => e.type === 'move');
  const teleports: CursorEvent[] = [];

  for (let i = 1; i < moves.length; i++) {
    const prev = moves[i - 1]!;
    const curr = moves[i]!;
    const dx = Math.abs(curr.x - prev.x) / sourceWidth;
    const dy = Math.abs(curr.y - prev.y) / sourceHeight;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > config.teleportThreshold) {
      teleports.push(curr);
    }
  }

  return teleports;
}

// Pair button-down with the following button-up of the same button and emit a
// synthetic trigger at the drag's midpoint when the displacement and duration
// both exceed thresholds. Captures click-and-drag plus text highlights (which
// look identical at the input layer).
function extractDragTriggers(
  cursorEvents: readonly CursorEvent[],
  config: ZoomConfig,
  sourceWidth: number,
  sourceHeight: number,
): CursorEvent[] {
  const drags: CursorEvent[] = [];
  const openDowns = new Map<number, CursorEvent>();

  for (const ev of cursorEvents) {
    if (ev.type === 'down') {
      openDowns.set(ev.button, ev);
      continue;
    }
    if (ev.type !== 'up') continue;
    const down = openDowns.get(ev.button);
    if (!down) continue;
    openDowns.delete(ev.button);
    const durationFrames = ev.frame - down.frame;
    if (durationFrames < MIN_DRAG_DURATION_FRAMES) continue;
    const dx = (ev.x - down.x) / sourceWidth;
    const dy = (ev.y - down.y) / sourceHeight;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= config.teleportThreshold) continue;
    drags.push({
      frame: Math.round((down.frame + ev.frame) / 2),
      x: (down.x + ev.x) / 2,
      y: (down.y + ev.y) / 2,
      type: 'move',
      button: ev.button,
    });
  }

  return drags;
}

// ---------------------------------------------------------------------------
// Step 2: Cluster nearby triggers into activity sessions
// ---------------------------------------------------------------------------

interface ActivitySession {
  events: CursorEvent[];
  firstFrame: Frame;
  lastFrame: Frame;
}

function clusterIntoSessions(
  triggers: readonly CursorEvent[],
  config: ZoomConfig,
): ActivitySession[] {
  if (triggers.length === 0) return [];

  const sorted = [...triggers].sort((a, b) => a.frame - b.frame);
  const sessions: ActivitySession[] = [];
  let current: ActivitySession = {
    events: [sorted[0]!],
    firstFrame: sorted[0]!.frame,
    lastFrame: sorted[0]!.frame,
  };

  for (let i = 1; i < sorted.length; i++) {
    const ev = sorted[i]!;
    if (ev.frame - current.lastFrame <= config.clusterGapFrames) {
      current.events.push(ev);
      current.lastFrame = ev.frame;
    } else {
      sessions.push(current);
      current = { events: [ev], firstFrame: ev.frame, lastFrame: ev.frame };
    }
  }
  sessions.push(current);

  return sessions;
}

// ---------------------------------------------------------------------------
// Step 3: Compute focal point centroid for each session
// ---------------------------------------------------------------------------

function computeFocalPoint(
  session: ActivitySession,
  sourceWidth: number,
  sourceHeight: number,
): { focalX: number; focalY: number } {
  const n = session.events.length;
  const sumX = session.events.reduce((acc, e) => acc + e.x, 0);
  const sumY = session.events.reduce((acc, e) => acc + e.y, 0);
  return {
    focalX: Math.min(1, Math.max(0, sumX / n / sourceWidth)),
    focalY: Math.min(1, Math.max(0, sumY / n / sourceHeight)),
  };
}

// ---------------------------------------------------------------------------
// Step 4: Convert sessions to raw marker spans
// ---------------------------------------------------------------------------

interface RawMarker {
  startFrame: Frame;
  endFrame: Frame;
  focalX: number;
  focalY: number;
  zoomScale: number;
}

function sessionToRawMarker(
  session: ActivitySession,
  config: ZoomConfig,
): RawMarker {
  return {
    startFrame: Math.max(0, session.firstFrame - config.zoomInFrames),
    endFrame: session.lastFrame + config.holdPaddingFrames + config.zoomOutFrames,
    focalX: 0, // filled in by caller
    focalY: 0,
    zoomScale: config.zoomScale,
  };
}

// ---------------------------------------------------------------------------
// Step 5: Merge overlapping raw markers
// ---------------------------------------------------------------------------

function mergeOverlappingMarkers(markers: RawMarker[]): RawMarker[] {
  if (markers.length === 0) return [];

  const sorted = [...markers].sort((a, b) => a.startFrame - b.startFrame);
  const merged: RawMarker[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]!;
    const curr = sorted[i]!;

    if (curr.startFrame <= last.endFrame) {
      const spanA = last.endFrame - last.startFrame;
      const spanB = curr.endFrame - curr.startFrame;
      const total = spanA + spanB;
      merged[merged.length - 1] = {
        startFrame: last.startFrame,
        endFrame: Math.max(last.endFrame, curr.endFrame),
        focalX: (last.focalX * spanA + curr.focalX * spanB) / total,
        focalY: (last.focalY * spanA + curr.focalY * spanB) / total,
        zoomScale: Math.max(last.zoomScale, curr.zoomScale),
      };
    } else {
      merged.push(curr);
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if two frame ranges overlap (inclusive start, exclusive end convention).
 */
function rangesOverlap(
  aStart: Frame,
  aEnd: Frame,
  bStart: Frame,
  bEnd: Frame,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Filter auto-zoom marker candidates, dropping any that overlap an existing
 * marker (manual or auto). Applied auto-suggestions persist as kind='auto'
 * so cursor-follow can fire; the dedup must consider both kinds to avoid
 * surfacing duplicate suggestions over regions the user already accepted.
 *
 * @param candidates  Newly generated auto markers to check
 * @param existing    Already-saved markers (any kind)
 * @returns           Candidates with no overlap against any existing marker
 */
export function filterAutoMarkersAgainstExisting(
  candidates: readonly ZoomMarker[],
  existing: readonly ZoomMarker[],
): ZoomMarker[] {
  if (existing.length === 0) return [...candidates];

  return candidates.filter((candidate) =>
    !existing.some((other) =>
      rangesOverlap(
        candidate.startFrame,
        candidate.endFrame,
        other.startFrame,
        other.endFrame,
      ),
    ),
  );
}

/**
 * Generate auto-zoom markers from cursor event data.
 *
 * Pure function — no side effects, no IDs generated here (createZoomMarker handles that).
 *
 * @param cursorEvents  Ordered cursor events captured during recording
 * @param intensity     0–1 from ZoomPresentation.autoIntensity (0 = off)
 * @param frameRate     Project frame rate (24 | 30 | 60)
 * @param sourceWidth   Source recording width in pixels
 * @param sourceHeight  Source recording height in pixels
 * @returns             Array of ZoomMarker objects with kind='auto'
 */
export function generateAutoZoomMarkers(
  cursorEvents: readonly CursorEvent[],
  intensity: number,
  frameRate: number,
  sourceWidth: number,
  sourceHeight: number,
): ZoomMarker[] {
  const clampedIntensity = Math.min(1, Math.max(0, intensity));
  if (clampedIntensity === 0 || cursorEvents.length === 0) return [];

  const config = deriveConfig(clampedIntensity, frameRate);

  const triggers = extractTriggerEvents(
    cursorEvents,
    config,
    sourceWidth,
    sourceHeight,
  );
  if (triggers.length === 0) return [];

  const sessions = clusterIntoSessions(triggers, config);

  const rawMarkers = sessions.map((s) => {
    const focal = computeFocalPoint(s, sourceWidth, sourceHeight);
    const raw = sessionToRawMarker(s, config);
    raw.focalX = focal.focalX;
    raw.focalY = focal.focalY;
    return raw;
  });

  const merged = mergeOverlappingMarkers(rawMarkers);

  return merged.map((raw) =>
    createZoomMarker(raw.startFrame, raw.endFrame, {
      kind: 'auto',
      strength: Math.min(1, (raw.zoomScale - 1.0) / 1.5),
      focalPoint: { x: raw.focalX, y: raw.focalY },
      zoomInDuration: config.zoomInFrames,
      zoomOutDuration: config.zoomOutFrames,
    }),
  );
}
