/**
 * Where the recording sits on the Editor's timeline, and how the two views agree
 * about it.
 *
 * The recording is a clip occupying a range, not a backdrop. Move it later, trim
 * it, or cut a hole in it, and the frames outside that range have no picture at
 * all — the timeline is empty there and must render empty, exactly as a gap does
 * in any NLE. Composing the recording at the raw playhead time ignored all of
 * that: it painted the recording over gaps, past its own end, and at the wrong
 * source frame after a trim.
 *
 * Kept as plain JS, and pure, so both the surface and the tests use exactly this
 * arithmetic rather than two copies that drift.
 */

/** The clip carrying Rough Cut's recording, if it is on this timeline. */
export function findRecordingLayer(layers) {
  return (layers ?? []).find((layer) => layer?.isRecording) ?? null;
}

/**
 * The recording's OWN time under the playhead, or null when the playhead is not
 * over it. Ranges are half-open, matching every other range in this codebase.
 */
export function resolveRecordingTimeSec(viewer) {
  if (!viewer || !(viewer.fps > 0)) return null;
  const recording = findRecordingLayer(viewer.layers);
  // No recording clip on this timeline: there is nothing of it to show.
  if (!recording) return null;
  const from = numberOr(recording.from, 0);
  const duration = numberOr(recording.durationInFrames, 0);
  const frame = numberOr(viewer.frame, 0);
  if (duration > 0 && (frame < from || frame >= from + duration)) return null;
  const sourceStart = numberOr(recording.sourceStart, 0);
  return (sourceStart + (frame - from)) / viewer.fps;
}

/**
 * Splits the Editor's layers by where they sit relative to the recording in the
 * track stack. Track order is z-order in any NLE, and the recording is just
 * another clip on a track — so layers above it must cover it and layers below it
 * must be covered by it. Nothing is unconditionally on top.
 */
export function splitLayersByRecordingTrack(viewer) {
  const empty = { above: [], below: [] };
  if (!viewer?.layers?.length) return empty;
  const orderOf = new Map((viewer.tracks ?? []).map((track, index) => [track.id, numberOr(track.order, index)]));
  const recording = findRecordingLayer(viewer.layers);
  // With no recording clip on this timeline there is nothing to be above or
  // below, so everything simply draws over the program. The sentinel has to be
  // +Infinity for that: with -Infinity every layer sorted *below* a recording
  // that is not there, and the empty-frame path draws only what is above, so a
  // title on a recording-less timeline was never drawn at all.
  const recordingOrder = recording ? numberOr(orderOf.get(recording.trackId), 0) : Infinity;
  const above = [];
  const below = [];
  for (const layer of viewer.layers) {
    if (layer.isRecording) continue;
    const order = numberOr(orderOf.get(layer.trackId), 0);
    // FreeCut defines "above" as a lower order number (see its source-edit
    // targeting rules). Keep that mapping explicit: V1/order 0 covers a
    // recording on order 1, while a larger order is below it.
    (order <= recordingOrder ? above : below).push(layer);
  }
  return { above, below };
}

/**
 * The Editor's stored timeline, in the shape its live bridge reports.
 *
 * Every view has to show what is on the timeline from the first frame after a
 * restart, not once the Editor happens to have loaded and reported in. The
 * project file already carries the Editor's tracks and items, so read them
 * directly and let the live report take over when it arrives.
 */
export function viewerFromStoredTimeline(document, { frame = 0, fps = 30 } = {}) {
  const stored = document?.freecutTimeline;
  if (!stored || !Array.isArray(stored.items) || stored.items.length === 0) return null;
  return {
    frame,
    fps: numberOr(document?.settings?.frameRate, fps),
    tracks: (stored.tracks ?? []).map((track, index) => ({
      id: track?.id,
      order: numberOr(track?.order, index),
    })),
    layers: stored.items.map((item) => ({
      id: item?.id,
      type: item?.type,
      // The clip carrying Rough Cut's recording is the one the compositor draws
      // itself; everything else is drawn as a layer around it.
      isRecording: String(item?.mediaId ?? '').endsWith('__program'),
      trackId: item?.trackId,
      from: item?.from,
      durationInFrames: item?.durationInFrames,
      mediaId: item?.mediaId,
      src: item?.src,
      text: item?.text,
      sourceStart: item?.sourceStart,
      transform: item?.transform,
      x: item?.x,
      y: item?.y,
      width: item?.width,
      height: item?.height,
    })),
  };
}

/**
 * The live media URL for a layer, addressed the same way the Editor addresses it.
 *
 * The Editor resolves a clip's video strictly by media id and its own `src` is
 * scoped to the embedded server, so it is not usable from the host as-is.
 */
export function resolveOverlayLayerSource(layer, freecutUrl, projectId) {
  if (!projectId || !layer?.mediaId || !freecutUrl) return layer;
  try {
    return {
      ...layer,
      src: new URL(
        `/__rough_cut__/media/${encodeURIComponent(projectId)}/${encodeURIComponent(layer.mediaId)}`,
        freecutUrl,
      ).href,
    };
  } catch {
    return layer;
  }
}

/** The split, with every layer's source resolved against the live media server. */
export function resolveOverlayLayers(viewer, freecutUrl, projectId) {
  const { above, below } = splitLayersByRecordingTrack(viewer);
  const resolve = (layer) => resolveOverlayLayerSource(layer, freecutUrl, projectId);
  return { above: above.map(resolve), below: below.map(resolve) };
}

function numberOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
