// Track and clip volume for the live preview. The recording's sound runs
// through per-slot gain nodes (one per screen decoder: program and pre-rolled
// standby) into one master gain. A clip's volume rides on its slot gain,
// multiplied into the cut-join fade the slot already carries; the track volume
// (and the pickup mute switch) is the master. Pure helpers here, so the rules
// are testable without Web Audio.
import { audioLevelGain } from '@rough-cut/project-model';
import { clampGain, combineGains, needsBoostLimiter } from '../../shared/audio-gain.mjs';

/** A timeline clip's own gain (0 when muted, 1 when it has no level). */
export function clipAudioGain(clip) {
  return audioLevelGain(clip?.audio);
}

/**
 * The gain a playback segment plays at: its saved clip gain, or the value of a
 * slider being dragged for that clip right now.
 */
export function segmentAudioGain(segment, override = null) {
  if (!segment) return 1;
  if (override && Array.isArray(override.clipIds) && override.clipIds.includes(segment.clipId)) return clampGain(override.gain);
  return clampGain(segment.audioGain ?? 1);
}

/** Slot level = cut-join fade x clip volume. */
export function slotGain(joinGain, segment, override = null) {
  return combineGains(joinGain, segmentAudioGain(segment, override));
}

/** The clip volume heard at a timeline frame (the top segment covering it), 1 in a gap. */
export function clipGainAtFrame(segments, frame, override = null) {
  const target = Math.max(0, Math.round(Number(frame) || 0));
  const covering = (Array.isArray(segments) ? segments : [])
    .filter((segment) => target >= segment.timelineIn && target < segment.timelineOut)
    .sort((left, right) => (right.trackIndex ?? 0) - (left.trackIndex ?? 0))[0];
  return covering ? segmentAudioGain(covering, override) : 1;
}

/** Master level: silent while the pickup mute is on, else the track volume. */
export function masterGain({ audioMuted = false, trackGain = 1 } = {}) {
  return audioMuted ? 0 : clampGain(trackGain);
}

/** True when anything plays above 100% and the preview needs its peak limiter. */
export function previewNeedsLimiter({ trackGain = 1, segments = [], override = null } = {}) {
  const track = clampGain(trackGain);
  const clipGains = (Array.isArray(segments) ? segments : []).map((segment) => segmentAudioGain(segment, override));
  if (override) clipGains.push(clampGain(override.gain));
  if (clipGains.length === 0) clipGains.push(1);
  return needsBoostLimiter(clipGains.map((gain) => gain * track));
}
