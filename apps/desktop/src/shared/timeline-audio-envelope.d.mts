export interface TimelineAudioEnvelopeSegment {
  readonly timelineIn: number;
  readonly timelineOut: number;
  readonly sourceIn: number;
  readonly sourceOut: number;
  readonly trackIndex?: number;
}

export const DEFAULT_TIMELINE_JOIN_FADE_FRAMES: number;

export function timelineJoinFadeFrames(
  segments: readonly TimelineAudioEnvelopeSegment[],
  index: number,
  requestedFadeFrames?: number,
): {
  readonly fadeInFrames: number;
  readonly fadeOutFrames: number;
};

export function timelineJoinGain(
  segments: readonly TimelineAudioEnvelopeSegment[],
  segment: TimelineAudioEnvelopeSegment,
  timelineFrame: number,
  requestedFadeFrames?: number,
): number;
