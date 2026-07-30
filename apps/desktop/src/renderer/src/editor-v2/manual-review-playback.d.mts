export const REVIEW_PLAYBACK_RATES: readonly [1, 1.5, 2, 3];

export type JoinVerification = {
  readonly phase: 'verifying';
  readonly startFrame: number;
  readonly endFrame: number;
  readonly reviewRate: number;
};

export function normalizeReviewPlaybackRate(rate: number): number;

export function beginJoinVerification(input: {
  joinFrame: number;
  fps: number;
  durationFrames: number;
  reviewRate: number;
}): JoinVerification;

export function advanceJoinVerification(
  verification: JoinVerification | null,
  playheadFrame: number,
):
  | {
      verification: JoinVerification | null;
      completed: false;
    }
  | {
      verification: null;
      completed: true;
      resumeRate: number;
    };

export function cancelJoinVerification(
  verification: JoinVerification | null,
): null;
