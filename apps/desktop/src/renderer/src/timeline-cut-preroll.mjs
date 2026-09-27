// A cut that removes source (the next clip does not continue where this one
// stopped) cannot be crossed by one <video>: seeking it while it plays freezes
// the picture for the decode (~150 ms at 1080p, 1 s keyframes) and restarts the
// audio sink (~200 ms more). Instead a second, silent decoder is parked on the
// next clip ahead of time and started early, so the preview only switches which
// element it draws from when the cut arrives.

// When the standby decoder is seeked onto the next clip: just enough ahead of
// the lead for the seek to settle. Earlier, on short clips it would seek right
// after the previous handover and compete with the element that just started.
export const CUT_PREROLL_PREPARE_SEC = 1.6;
// How long before the cut it starts playing. 0.4 s measured too short for the
// decoder and audio pipeline to settle; 1 s crossed cuts with one held frame.
export const CUT_PREROLL_LEAD_SEC = 1;
// How far the standby may be from the next clip's first frame when the cut
// arrives and still take over. Early frames are held (never drawn); anything
// further out falls back to a seek.
export const CUT_PREROLL_EARLY_FRAMES = 12;
export const CUT_PREROLL_LATE_FRAMES = 2;

export function isPrerollableCut(active, next) {
  return Boolean(
    active &&
      next &&
      next.timelineIn === active.timelineOut &&
      next.sourceIn !== active.sourceOut &&
      next.sourceOut > next.sourceIn,
  );
}

export function cutPrerollKey(active, next) {
  return `${active.sourceOut}->${next.timelineIn}:${next.sourceIn}:${next.trackIndex ?? 0}`;
}

export function planCutPreroll({
  active,
  next,
  sourceFrame,
  fps,
  rate = 1,
  prepareSec = CUT_PREROLL_PREPARE_SEC,
  leadSec = CUT_PREROLL_LEAD_SEC,
}) {
  if (!isPrerollableCut(active, next) || !(fps > 0)) return { phase: 'none' };
  const playbackRate = rate > 0 ? rate : 1;
  const remainingWallSec = Math.max(0, (active.sourceOut - sourceFrame) / fps) / playbackRate;
  if (remainingWallSec > prepareSec) return { phase: 'idle' };
  // The standby cannot start before its media begins.
  const leadWallSec = Math.min(leadSec, next.sourceIn / fps / playbackRate);
  // Playback that starts inside the lead parks the standby only as far back as
  // the time actually left, so it can still arrive at the cut.
  const parkWallSec = Math.min(leadWallSec, remainingWallSec);
  return {
    phase: remainingWallSec <= leadWallSec ? 'play' : 'prepare',
    key: cutPrerollKey(active, next),
    seekSourceSec: Math.max(0, next.sourceIn / fps - parkWallSec * playbackRate),
    remainingWallSec,
  };
}

export function standbyAlignedForCut(
  standbySourceSec,
  next,
  fps,
  { earlyFrames = CUT_PREROLL_EARLY_FRAMES, lateFrames = CUT_PREROLL_LATE_FRAMES } = {},
) {
  if (!next || !(fps > 0) || !Number.isFinite(standbySourceSec)) return false;
  const frame = standbySourceSec * fps;
  return frame >= next.sourceIn - earlyFrames && frame <= next.sourceIn + lateFrames;
}
