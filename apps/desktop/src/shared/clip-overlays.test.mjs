// Zooms and captions on an added clip (Noam 2026-10-21: "finish today's features").
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addCaption, removeCaption, splitCaption, updateCaption } from './captions.mjs';
import {
  addedClipAtFrame,
  clipCaptionView,
  clipCaptions,
  clipOverlaysOnTimeline,
  clipScreenSections,
  clipZoomCropAt,
  clipZoomOwner,
  commitClipCaptionView,
  withClipZooms,
} from './clip-overlays.mjs';
import { addClipZoomAtFrame, findZoomMarker, removeMarker, updateMarkerRange, updateMarkerStrength } from '../renderer/src/zoom-markers.mjs';

// Recording on 0-100 and 160-260, an added clip (file frames 30-90) on 100-160.
function documentWithAddedClip() {
  return {
    assets: [
      { id: 'rec', type: 'recording', filePath: '/r.mkv', duration: 400, metadata: {}, presentation: { zoom: { markers: [] } } },
      { id: 'clip-a', type: 'video', filePath: '/a.mp4', duration: 300, metadata: { width: 1280, height: 720, insertedMedia: { kind: 'clip', name: 'a.mp4', hasAudio: true } } },
    ],
    captions: { enabled: true, position: 'bottom', cues: [{ id: 'cap_0', startFrame: 10, endFrame: 40, text: 'recording line' }] },
    timeline: {
      sources: [],
      linkedGroups: [],
      markers: [],
      effects: [],
      tracks: [
        { id: 'track:screen', kind: 'video', index: 0, clips: [
          { id: 'r1', mediaId: 'source:rec:screen', timelineIn: 0, timelineOut: 100, sourceIn: 0, sourceOut: 100 },
          { id: 'ins', mediaId: 'source:clip-a', timelineIn: 100, timelineOut: 160, sourceIn: 30, sourceOut: 90 },
          { id: 'r2', mediaId: 'source:rec:screen', timelineIn: 160, timelineOut: 260, sourceIn: 100, sourceOut: 200 },
        ] },
      ],
    },
  };
}

test('the added clip under a timeline frame, with the file frame shown there', () => {
  const document = documentWithAddedClip();
  assert.equal(addedClipAtFrame(document, 50), null, 'the recording is not an added clip');
  const hit = addedClipAtFrame(document, 110);
  assert.equal(hit.assetId, 'clip-a');
  assert.equal(hit.sourceFrame, 40);
  assert.deepEqual(clipScreenSections(document, 'clip-a').map((s) => [s.timelineIn, s.sourceIn]), [[100, 30]]);
});

test('a zoom added on the clip lives with the clip, and the zoom tools edit it there', () => {
  let document = addClipZoomAtFrame(documentWithAddedClip(), 'clip-a', 40, 30);
  const [marker] = document.assets[1].metadata.clipZooms;
  assert.ok(marker, 'stored on the added clip');
  assert.equal(marker.startFrame, 40);
  assert.equal(marker.followCursor, false, 'an added clip has no cursor to follow');
  assert.deepEqual(document.assets[0].presentation.zoom.markers, [], "the recording's zooms are untouched");
  assert.equal(clipZoomOwner(document, marker.id), 'clip-a');
  assert.equal(findZoomMarker(document, marker.id).assetId, 'clip-a');

  document = updateMarkerStrength(document, marker.id, 0.9);
  assert.equal(document.assets[1].metadata.clipZooms[0].strength, 0.9);
  document = updateMarkerRange(document, marker.id, 45, 80);
  assert.deepEqual([document.assets[1].metadata.clipZooms[0].startFrame, document.assets[1].metadata.clipZooms[0].endFrame], [45, 80]);
  document = removeMarker(document, marker.id);
  assert.deepEqual(document.assets[1].metadata.clipZooms, []);
});

test('zoom crop: whole picture outside a zoom, a smaller window inside it', () => {
  const document = addClipZoomAtFrame(documentWithAddedClip(), 'clip-a', 40, 30);
  const markers = document.assets[1].metadata.clipZooms;
  assert.deepEqual(clipZoomCropAt(markers, 10, 1280, 720), { x: 0, y: 0, w: 1280, h: 720 });
  const held = clipZoomCropAt(markers, markers[0].startFrame + Math.floor((markers[0].endFrame - markers[0].startFrame) / 2), 1280, 720);
  assert.ok(held.w < 1280 && held.h < 720, 'zoomed in during the hold');
  assert.ok(Math.abs(held.w / held.h - 1280 / 720) < 0.01, 'keeps the clip shape');
});

test('captions on the clip: add, retype, move, split and delete through the normal tools', () => {
  const base = documentWithAddedClip();
  const added = addCaption(clipCaptionView(base, 'clip-a'), 40, { lengthFrames: 30 });
  let document = commitClipCaptionView(base, 'clip-a', added.document);
  const [cue] = clipCaptions(document, 'clip-a');
  assert.ok(cue.id.startsWith('clip-a:'), 'ids never clash with the recording lines');
  assert.deepEqual(document.captions.cues.map((c) => c.id), ['cap_0'], "the recording's lines are untouched");

  document = commitClipCaptionView(document, 'clip-a', updateCaption(clipCaptionView(document, 'clip-a'), cue.id, { text: 'hello clip' }));
  assert.equal(clipCaptions(document, 'clip-a')[0].text, 'hello clip');
  const split = splitCaption(clipCaptionView(document, 'clip-a'), cue.id, 55);
  document = commitClipCaptionView(document, 'clip-a', split.document);
  const ids = clipCaptions(document, 'clip-a').map((c) => c.id);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2);
  assert.ok(ids.every((id) => id.startsWith('clip-a:')));
  document = commitClipCaptionView(document, 'clip-a', removeCaption(clipCaptionView(document, 'clip-a'), ids[1]));
  const again = addCaption(clipCaptionView(document, 'clip-a'), 70, { lengthFrames: 10 });
  document = commitClipCaptionView(document, 'clip-a', again.document);
  const after = clipCaptions(document, 'clip-a').map((c) => c.id);
  assert.equal(new Set(after).size, after.length, 'a line added after a delete never reuses an id');
});

test('for the export: clip zooms and captions land on the timeline where the clip plays', () => {
  let document = withClipZooms(documentWithAddedClip(), 'clip-a', [{ id: 'z1', kind: 'manual', startFrame: 40, endFrame: 70, strength: 0.5, focalPoint: { x: 0.5, y: 0.5 }, zoomInDuration: 5, zoomOutDuration: 5 }]);
  const added = addCaption(clipCaptionView(document, 'clip-a'), 50, { lengthFrames: 20, text: 'on the clip' });
  document = commitClipCaptionView(document, 'clip-a', added.document);
  const { zooms, captions } = clipOverlaysOnTimeline(document);
  assert.deepEqual(zooms.map((z) => [z.startFrame, z.endFrame]), [[110, 140]]);
  assert.deepEqual(captions.map((c) => [c.startFrame, c.endFrame, c.text]), [[120, 140, 'on the clip']]);
});

test('moving the clip carries its zooms and captions with it', () => {
  let document = withClipZooms(documentWithAddedClip(), 'clip-a', [{ id: 'z1', kind: 'manual', startFrame: 40, endFrame: 70, strength: 0.5, focalPoint: { x: 0.5, y: 0.5 }, zoomInDuration: 5, zoomOutDuration: 5 }]);
  document = { ...document, timeline: { ...document.timeline, tracks: document.timeline.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => (clip.id === 'ins' ? { ...clip, timelineIn: 300, timelineOut: 360 } : clip)) })) } };
  assert.deepEqual(clipOverlaysOnTimeline(document).zooms.map((z) => [z.startFrame, z.endFrame]), [[310, 340]]);
});
