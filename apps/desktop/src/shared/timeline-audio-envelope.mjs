export const DEFAULT_TIMELINE_JOIN_FADE_FRAMES = 2;

export function timelineJoinFadeFrames(
  segments,
  index,
  requestedFadeFrames = DEFAULT_TIMELINE_JOIN_FADE_FRAMES,
) {
  const segment = segments[index];
  if (!segment) return { fadeInFrames: 0, fadeOutFrames: 0 };
  const fadeFrames = Math.max(
    0,
    Math.min(
      Math.round(requestedFadeFrames),
      Math.floor((segment.timelineOut - segment.timelineIn) / 2),
    ),
  );
  const previous = segments[index - 1];
  const next = segments[index + 1];
  return {
    fadeInFrames:
      fadeFrames > 0 &&
      sameTrack(previous, segment) &&
      previous?.timelineOut === segment.timelineIn &&
      previous.sourceOut !== segment.sourceIn
        ? fadeFrames
        : 0,
    fadeOutFrames:
      fadeFrames > 0 &&
      sameTrack(segment, next) &&
      next?.timelineIn === segment.timelineOut &&
      segment.sourceOut !== next.sourceIn
        ? fadeFrames
        : 0,
  };
}

function sameTrack(left, right) {
  if (!left || !right) return false;
  return (
    left.trackIndex === undefined ||
    right.trackIndex === undefined ||
    left.trackIndex === right.trackIndex
  );
}

export function timelineJoinGain(
  segments,
  segment,
  timelineFrame,
  requestedFadeFrames = DEFAULT_TIMELINE_JOIN_FADE_FRAMES,
) {
  const index = segments.findIndex(
    (candidate) =>
      candidate === segment ||
      (candidate.timelineIn === segment.timelineIn &&
        candidate.timelineOut === segment.timelineOut &&
        candidate.sourceIn === segment.sourceIn &&
        candidate.sourceOut === segment.sourceOut),
  );
  if (index < 0) return 1;
  const { fadeInFrames, fadeOutFrames } = timelineJoinFadeFrames(
    segments,
    index,
    requestedFadeFrames,
  );
  const fadeInGain =
    fadeInFrames > 0
      ? clamp01((timelineFrame - segment.timelineIn) / fadeInFrames)
      : 1;
  const fadeOutGain =
    fadeOutFrames > 0
      ? clamp01((segment.timelineOut - timelineFrame) / fadeOutFrames)
      : 1;
  return Math.min(fadeInGain, fadeOutGain);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
