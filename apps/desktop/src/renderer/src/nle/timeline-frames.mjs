// Frame-accurate timeline math for the NLE Editor.
// Convention: all ranges are HALF-OPEN — [timelineIn, timelineOut), where
// timelineOut is the first frame NOT in the clip. This matches Remotion,
// OTIO, and most NLE conventions; it lets `left.timelineOut === right.timelineIn`
// after a split with no overlap and no gap.
//
// Reasoning: full-closed intervals [In, Out] introduce a perpetual ±1-frame
// fight over who "owns" the boundary frame. Half-open intervals reduce that
// to subtraction: duration = out - in, and adjacency just means "the next
// clip starts where this one ends."

// Map a timeline frame to the source frame inside the clip's media file.
// Returns null if the frame is outside the clip.
export function timelineFrameToSourceFrame(clip, timelineFrame) {
  if (!clip || typeof clip !== 'object') return null;
  const tIn = Number(clip.timelineIn);
  const tOut = Number(clip.timelineOut);
  const sIn = Number(clip.sourceIn);
  const sOut = Number(clip.sourceOut);
  const t = Number(timelineFrame);
  if (![tIn, tOut, sIn, sOut, t].every(Number.isFinite)) return null;
  if (t < tIn || t >= tOut) return null;
  const sourceFrame = sIn + (t - tIn);
  // Belt-and-suspenders: if source duration doesn't match timeline duration
  // (no retime support yet), clamp inside [sIn, sOut).
  if (sourceFrame >= sOut) return sOut - 1;
  if (sourceFrame < sIn) return sIn;
  return sourceFrame;
}

// Find the active clip on a given track at a timeline frame, or null for gaps.
export function activeClipAt(track, timelineFrame) {
  if (!track || !Array.isArray(track.clips)) return null;
  const t = Number(timelineFrame);
  if (!Number.isFinite(t)) return null;
  for (const clip of track.clips) {
    const tIn = Number(clip?.timelineIn);
    const tOut = Number(clip?.timelineOut);
    if (Number.isFinite(tIn) && Number.isFinite(tOut) && t >= tIn && t < tOut) {
      return clip;
    }
  }
  return null;
}

// Split a clip at the given timeline frame. Returns { left, right } that
// together cover the original range exactly (no overlap, no gap), or null
// if the split is a no-op (frame at or outside an edge — splitting at the
// boundary would create a zero-length clip).
//
// Invariant after split:
//   left.timelineIn  === original.timelineIn
//   left.timelineOut === splitFrame === right.timelineIn
//   right.timelineOut === original.timelineOut
//   left.sourceIn  === original.sourceIn
//   left.sourceOut === right.sourceIn
//   right.sourceOut === original.sourceOut
//   (left.timelineOut - left.timelineIn) + (right.timelineOut - right.timelineIn)
//     === original.timelineOut - original.timelineIn
export function splitClipAtFrame(clip, splitFrame) {
  if (!clip || typeof clip !== 'object') return null;
  const tIn = Number(clip.timelineIn);
  const tOut = Number(clip.timelineOut);
  const sIn = Number(clip.sourceIn);
  const sOut = Number(clip.sourceOut);
  const p = Math.round(Number(splitFrame));
  if (![tIn, tOut, sIn, sOut].every(Number.isFinite) || !Number.isFinite(p)) return null;
  // No-op at edges or outside.
  if (p <= tIn || p >= tOut) return null;
  const splitInSource = sIn + (p - tIn);
  // If source ranges don't align with timeline (retime), bail rather than
  // produce wrong frames. v13 doesn't support retime yet.
  if (sOut - sIn !== tOut - tIn) return null;
  const left = { ...clip, timelineOut: p, sourceOut: splitInSource };
  const right = { ...clip, timelineIn: p, sourceIn: splitInSource };
  return { left, right };
}

// Replace a clip with its split result on the given track. Returns a new
// track object (immutable update). Caller's responsibility to merge back
// into the project document.
export function applySplitOnTrack(track, originalClipId, left, right) {
  if (!track || !Array.isArray(track.clips)) return track;
  const next = [];
  let replaced = false;
  for (const clip of track.clips) {
    if (!replaced && clip?.id === originalClipId) {
      next.push(left, right);
      replaced = true;
    } else {
      next.push(clip);
    }
  }
  if (!replaced) return track;
  return { ...track, clips: next };
}
