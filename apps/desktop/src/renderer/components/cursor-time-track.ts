export interface TimestampCursorSample {
  readonly timeMs: number;
  readonly x: number;
  readonly y: number;
  readonly type?: string;
  readonly visible?: boolean;
}

export interface CursorTimeTrackSample {
  readonly timeMs: number;
  readonly x: number;
  readonly y: number;
  readonly isClick: boolean;
  readonly visible: boolean;
}

export interface CursorTimeLookupOptions {
  readonly maxGapMs?: number;
}

const DEFAULT_MAX_GAP_MS = 250;
const TIME_EPSILON_MS = 0.0001;

export function buildCursorTimeTrack(
  samples: readonly TimestampCursorSample[],
): readonly CursorTimeTrackSample[] {
  if (samples.length === 0) return [];

  const sorted = [...samples]
    .filter((sample) => Number.isFinite(sample.timeMs))
    .sort((a, b) => a.timeMs - b.timeMs);

  const track: CursorTimeTrackSample[] = [];
  for (const sample of sorted) {
    const previous = track[track.length - 1];
    if (previous && Math.abs(previous.timeMs - sample.timeMs) <= TIME_EPSILON_MS) {
      track[track.length - 1] = {
        timeMs: previous.timeMs,
        x: sample.x,
        y: sample.y,
        isClick: previous.isClick || sample.type === 'down',
        visible: sample.visible !== false,
      };
      continue;
    }

    track.push({
      timeMs: sample.timeMs,
      x: sample.x,
      y: sample.y,
      isClick: sample.type === 'down',
      visible: sample.visible !== false,
    });
  }

  return track;
}

export function getCursorAtTime(
  track: readonly CursorTimeTrackSample[],
  timeMs: number,
  options: CursorTimeLookupOptions = {},
): { x: number; y: number; isClick: boolean } | null {
  if (track.length === 0 || !Number.isFinite(timeMs)) return null;

  let low = 0;
  let high = track.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const sample = track[mid]!;
    if (Math.abs(sample.timeMs - timeMs) <= TIME_EPSILON_MS) {
      return sample.visible ? { x: sample.x, y: sample.y, isClick: sample.isClick } : null;
    }
    if (sample.timeMs < timeMs) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const next = track[low];
  const previous = track[low - 1];
  if (!previous) {
    return next?.visible ? { x: next.x, y: next.y, isClick: false } : null;
  }
  if (!next) {
    return previous.visible ? { x: previous.x, y: previous.y, isClick: false } : null;
  }
  if (!previous.visible || !next.visible) return null;

  const gapMs = next.timeMs - previous.timeMs;
  const maxGapMs = options.maxGapMs ?? DEFAULT_MAX_GAP_MS;
  if (gapMs <= 0 || gapMs > maxGapMs) {
    return timeMs - previous.timeMs <= next.timeMs - timeMs
      ? { x: previous.x, y: previous.y, isClick: false }
      : { x: next.x, y: next.y, isClick: false };
  }

  const t = (timeMs - previous.timeMs) / gapMs;
  return {
    x: previous.x + (next.x - previous.x) * t,
    y: previous.y + (next.y - previous.y) * t,
    isClick: false,
  };
}
