// Zooms and captions placed ON an added clip (dev-only "Add clip at playhead").
//
// The recording's zooms and captions live in recording frames, so an added clip, which
// has no recording frames, could not hold any. These live with the added clip instead:
// on its asset (`metadata.clipZooms`, `metadata.clipCaptions`), in that file's own
// frames, so they stay on their moment when the clip is moved, trimmed or rippled, the
// same way the recording's own zooms follow the recording.
//
// Shared by the timeline, the preview and the export so all three read one model.

import { getZoomTransformAtFrame } from '@rough-cut/timeline-engine';

export const CLIP_ZOOMS_KEY = 'clipZooms';
export const CLIP_CAPTIONS_KEY = 'clipCaptions';
const CAMERA_TAKES_TRACK_ID = 'track:camera-takes';

function insertedKind(asset) {
  const info = asset?.metadata?.insertedMedia;
  return info && typeof info === 'object' ? info.kind : null;
}

/** Added picture clips (not camera takes, not sound-only files). */
export function isAddedPictureAsset(asset) {
  return insertedKind(asset) === 'clip';
}

/** Where an added clip sits on the timeline: its picture clips, in timeline order. */
export function clipScreenSections(document, assetId) {
  const mediaId = `source:${assetId}`;
  return (document?.timeline?.tracks ?? [])
    .filter((track) => track.kind === 'video' && track.id !== CAMERA_TAKES_TRACK_ID)
    .flatMap((track) => track.clips.filter((clip) => clip.mediaId === mediaId))
    .map((clip) => ({ clipId: clip.id, timelineIn: clip.timelineIn, timelineOut: clip.timelineOut, sourceIn: clip.sourceIn, sourceOut: clip.sourceOut }))
    .sort((left, right) => left.timelineIn - right.timelineIn);
}

/** The added clip showing at a timeline frame, and the frame of its file shown there. */
export function addedClipAtFrame(document, timelineFrame) {
  const frame = Math.round(Number(timelineFrame));
  if (!Number.isFinite(frame)) return null;
  for (const asset of document?.assets ?? []) {
    if (!isAddedPictureAsset(asset)) continue;
    const section = clipScreenSections(document, asset.id).find((item) => frame >= item.timelineIn && frame < item.timelineOut);
    if (section) return { assetId: asset.id, asset, section, sourceFrame: section.sourceIn + (frame - section.timelineIn) };
  }
  return null;
}

function metadataList(asset, key) {
  const list = asset?.metadata?.[key];
  return Array.isArray(list) ? list : [];
}

function withAssetList(document, assetId, key, list) {
  return {
    ...document,
    assets: document.assets.map((asset) => (asset.id === assetId ? { ...asset, metadata: { ...asset.metadata, [key]: list } } : asset)),
  };
}

export function clipZooms(document, assetId) {
  return metadataList(document?.assets?.find((asset) => asset.id === assetId), CLIP_ZOOMS_KEY);
}

export function withClipZooms(document, assetId, markers) {
  return withAssetList(document, assetId, CLIP_ZOOMS_KEY, [...markers].sort((a, b) => a.startFrame - b.startFrame));
}

/** Every zoom on every added clip: [{ assetId, marker }]. */
export function listClipZooms(document) {
  return (document?.assets ?? []).filter(isAddedPictureAsset).flatMap((asset) => metadataList(asset, CLIP_ZOOMS_KEY).map((marker) => ({ assetId: asset.id, marker })));
}

/** The added clip a zoom belongs to, or null when it is one of the recording's zooms. */
export function clipZoomOwner(document, markerId) {
  return listClipZooms(document).find((item) => item.marker.id === markerId)?.assetId ?? null;
}

export function clipCaptions(document, assetId) {
  return metadataList(document?.assets?.find((asset) => asset.id === assetId), CLIP_CAPTIONS_KEY);
}

export function withClipCaptions(document, assetId, cues) {
  return withAssetList(document, assetId, CLIP_CAPTIONS_KEY, [...cues].sort((a, b) => a.startFrame - b.startFrame));
}

/**
 * A stand-in project whose captions are one added clip's lines, so every caption tool
 * (add, move, trim, split, retype, delete) works on them unchanged. The look (size,
 * colour, position, on/off) is the project's. Write the result back with commitClipCaptionView.
 */
export function clipCaptionView(document, assetId) {
  const current = document?.captions && typeof document.captions === 'object' ? document.captions : {};
  const { cues: _cues, edits: _edits, tracks: _tracks, activeTrack: _active, ...look } = current;
  return { captions: { ...look, cues: clipCaptions(document, assetId) } };
}

/**
 * A clip's line ids carry the clip's id, so they never clash with the recording's lines
 * (one selection is shared by every caption on the lane).
 */
export function clipCaptionId(assetId, id) {
  const prefix = `${assetId}:`;
  return String(id).startsWith(prefix) ? String(id) : `${prefix}${id}`;
}

export function commitClipCaptionView(document, assetId, view) {
  const cues = Array.isArray(view?.captions?.cues) ? view.captions.cues : [];
  // Lines added in the stand-in get the clip's id in front; a clash (after a delete) gets a suffix.
  const taken = new Set(cues.map((cue) => String(cue.id)).filter((id) => id.startsWith(`${assetId}:`)));
  return withClipCaptions(document, assetId, cues.map((cue) => {
    if (String(cue.id).startsWith(`${assetId}:`)) return cue;
    let id = clipCaptionId(assetId, cue.id);
    for (let n = 2; taken.has(id); n += 1) id = clipCaptionId(assetId, `${cue.id}_${n}`);
    taken.add(id);
    return { ...cue, id };
  }));
}

/**
 * The part of an added clip's picture shown at one of its own frames, in its pixels.
 * The zoom math is the recording's (same ramps, strength and focal point); the window
 * is then fitted whole where the clip would sit, so a zoom fills the clip's own frame.
 * Preview and export both call this, so they show the same window.
 */
export function clipZoomCropAt(markers, sourceFrame, sourceWidth, sourceHeight) {
  const full = { x: 0, y: 0, w: sourceWidth, h: sourceHeight };
  if (!Array.isArray(markers) || markers.length === 0 || !(sourceWidth > 0) || !(sourceHeight > 0)) return full;
  const transform = getZoomTransformAtFrame(sourceFrame, markers);
  const scale = transform.scale;
  if (!Number.isFinite(scale) || scale <= 1.0001) return full;
  const w = sourceWidth / scale;
  const h = sourceHeight / scale;
  const rawX = sourceWidth / 2 - sourceWidth / (2 * scale) - (transform.translateX * sourceWidth) / scale;
  const rawY = sourceHeight / 2 - sourceHeight / (2 * scale) - (transform.translateY * sourceHeight) / scale;
  return {
    x: Math.max(0, Math.min(sourceWidth - w, rawX)),
    y: Math.max(0, Math.min(sourceHeight - h, rawY)),
    w,
    h,
  };
}

/** Map a range in an added clip's own frames onto the timeline, one piece per section that shows it. */
export function clipRangeOnTimeline(sections, startFrame, endFrame) {
  return sections.flatMap((section) => {
    const from = Math.max(startFrame, section.sourceIn);
    const to = Math.min(endFrame, section.sourceOut);
    if (to <= from) return [];
    return [{ startFrame: section.timelineIn + (from - section.sourceIn), endFrame: section.timelineIn + (to - section.sourceIn) }];
  });
}

/**
 * For the export: every added clip's zooms and captions in timeline frames.
 * Zooms keep their own fields; frames become the timeline span shown.
 */
export function clipOverlaysOnTimeline(document) {
  const zooms = [];
  const captions = [];
  for (const asset of document?.assets ?? []) {
    if (!isAddedPictureAsset(asset)) continue;
    const sections = clipScreenSections(document, asset.id);
    for (const marker of metadataList(asset, CLIP_ZOOMS_KEY)) {
      clipRangeOnTimeline(sections, marker.startFrame, marker.endFrame).forEach((piece, index) => {
        zooms.push({ ...marker, id: index === 0 ? marker.id : `${marker.id}#${index}`, startFrame: piece.startFrame, endFrame: piece.endFrame, followCursor: false });
      });
    }
    for (const cue of metadataList(asset, CLIP_CAPTIONS_KEY)) {
      if (typeof cue?.text !== 'string' || !cue.text.trim()) continue;
      clipRangeOnTimeline(sections, cue.startFrame, cue.endFrame).forEach((piece, index) => {
        captions.push({ ...cue, id: index === 0 ? cue.id : `${cue.id}#${index}`, startFrame: piece.startFrame, endFrame: piece.endFrame });
      });
    }
  }
  return { zooms: zooms.sort((a, b) => a.startFrame - b.startFrame), captions: captions.sort((a, b) => a.startFrame - b.startFrame) };
}
