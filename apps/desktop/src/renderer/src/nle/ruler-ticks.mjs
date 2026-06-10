// A "00:00:00" label in the ruler's monospace 0.62rem font is ~48px wide;
// labels closer than that collide into an unreadable wall (reproduced on a
// 29-minute recording at fit zoom). Keep at least a label-width of air.
const MIN_LABEL_PX = 56;
// Minor ticks closer than this merge into a solid stripe — drop them.
const MIN_MINOR_TICK_PX = 7;
const SHORT_TIMELINE_SECONDS = 60;
const LONG_TIMELINE_SECONDS = 300;
const CANDIDATE_INTERVALS = Object.freeze([1, 5, 10, 15, 30, 60, 120, 300]);

export function pickTickInterval(durationSeconds, pixelsPerSecond) {
  const duration = Number(durationSeconds);
  const pxPerSecond = Number(pixelsPerSecond);
  if (!Number.isFinite(duration) || duration <= 0) return 1;
  const floor = duration < SHORT_TIMELINE_SECONDS ? 1 : duration < LONG_TIMELINE_SECONDS ? 5 : 30;
  if (!Number.isFinite(pxPerSecond) || pxPerSecond <= 0) return floor;
  return CANDIDATE_INTERVALS.find((interval) => interval >= floor && interval * pxPerSecond >= MIN_LABEL_PX) ?? 300;
}

export function formatRulerLabel(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const mm = Math.floor(safeSeconds / 60);
  const ss = safeSeconds % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}:00`;
}

// Densest sub-interval of the major that still leaves MIN_MINOR_TICK_PX
// between minor ticks. Returns null when even the coarsest divisor is too
// dense (previously minors were emitted every second unconditionally —
// ~1,700 overlapping ticks on a 29-minute timeline).
export function pickMinorInterval(majorInterval, pixelsPerSecond) {
  const major = Number(majorInterval);
  const pxPerSecond = Number(pixelsPerSecond);
  if (!Number.isFinite(major) || major <= 1 || !Number.isFinite(pxPerSecond) || pxPerSecond <= 0) return null;
  return CANDIDATE_INTERVALS.find((interval) =>
    interval < major && major % interval === 0 && interval * pxPerSecond >= MIN_MINOR_TICK_PX) ?? null;
}

export function buildRulerTicks(durationFrames, fps, widthPx) {
  const totalFrames = Math.max(0, Math.round(Number(durationFrames) || 0));
  const frameRate = Number(fps);
  if (totalFrames <= 0 || !Number.isFinite(frameRate) || frameRate <= 0) return [];
  const durationSeconds = totalFrames / frameRate;
  const pxPerSecond = Number(widthPx) / durationSeconds;
  const majorInterval = pickTickInterval(durationSeconds, pxPerSecond);
  const minorInterval = pickMinorInterval(majorInterval, pxPerSecond);
  const ticks = [];

  if (minorInterval) {
    for (let seconds = 0; seconds <= durationSeconds; seconds += minorInterval) {
      if (seconds % majorInterval !== 0) {
        ticks.push(makeTick(seconds, durationSeconds, frameRate, false));
      }
    }
  }

  for (let seconds = 0; seconds <= durationSeconds; seconds += majorInterval) {
    ticks.push(makeTick(seconds, durationSeconds, frameRate, true));
  }

  if (!ticks.some((tick) => tick.frame === totalFrames)) {
    ticks.push(makeTick(durationSeconds, durationSeconds, frameRate, true));
  }

  return ticks.sort((a, b) => a.frame - b.frame || Number(a.major) - Number(b.major));
}

function makeTick(seconds, durationSeconds, fps, major) {
  const clampedSeconds = Math.max(0, Math.min(durationSeconds, seconds));
  return {
    frame: Math.round(clampedSeconds * fps),
    leftPct: durationSeconds > 0 ? (clampedSeconds / durationSeconds) * 100 : 0,
    major,
    label: major ? formatRulerLabel(clampedSeconds) : null,
  };
}
