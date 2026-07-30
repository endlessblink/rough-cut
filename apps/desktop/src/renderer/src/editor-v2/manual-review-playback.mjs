export const REVIEW_PLAYBACK_RATES = Object.freeze([1, 1.5, 2, 3]);

export function normalizeReviewPlaybackRate(rate) {
  return REVIEW_PLAYBACK_RATES.includes(rate) ? rate : 1;
}

export function beginJoinVerification({
  joinFrame,
  fps,
  durationFrames,
  reviewRate,
}) {
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 30;
  const safeDuration = Math.max(1, Math.round(durationFrames));
  const safeJoinFrame = Math.max(
    0,
    Math.min(safeDuration, Math.round(joinFrame)),
  );
  const halfWindowFrames = safeFps * 0.75;
  return {
    phase: 'verifying',
    startFrame: Math.max(0, safeJoinFrame - Math.floor(halfWindowFrames)),
    endFrame: Math.min(
      safeDuration,
      safeJoinFrame + Math.ceil(halfWindowFrames),
    ),
    reviewRate: normalizeReviewPlaybackRate(reviewRate),
  };
}

export function advanceJoinVerification(verification, playheadFrame) {
  if (!verification || playheadFrame < verification.endFrame) {
    return { verification, completed: false };
  }
  return {
    verification: null,
    completed: true,
    resumeRate: verification.reviewRate,
  };
}

export function cancelJoinVerification(_verification) {
  return null;
}
