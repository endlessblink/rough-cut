import { describe, expect, it } from 'vitest';
import { createAsset, createProject } from './factories.js';
import {
  CAMERA_TAKES_AUDIO_TRACK_ID,
  CAMERA_TAKES_TRACK_ID,
  createInsertedMediaAsset,
  listCameraTakes,
  useCameraTake,
  insertMediaClip,
  listInsertedClips,
  moveInsertedClip,
  pickupLanding,
  removeInsertedClip,
  splitInsertedClipsAt,
  trimInsertedClip,
} from './inserted-media.js';
import { canonicalizeProjectDocument, collectTimelineInvariantIssues, type TimelineClip } from './shared-timeline.js';
import type { AssetId, ProjectDocument } from './types.js';

const REC = 'rec' as AssetId;
const CAM = 'cam' as AssetId;

/**
 * Shaped like the launch project: one Screen + Camera recording split into two
 * sections, with linked screen / camera / audio lanes.
 */
function launchLikeProject(): ProjectDocument {
  const recording = createAsset('recording', '/rec/screen.mp4', { id: REC, duration: 600, cameraAssetId: CAM, metadata: { width: 1920, height: 1080, fps: 30 } });
  const camera = createAsset('video', '/rec/camera.mp4', { id: CAM, duration: 600, metadata: { isCamera: true } });
  const base = createProject({ assets: [recording, camera] });
  const group = `linked:${REC}`;
  const section = (lane: string, mediaId: string, trackId: string): TimelineClip[] => [
    { id: `${lane}-a`, mediaId, trackId, linkGroupId: group, timelineIn: 0, timelineOut: 200, sourceIn: 0, sourceOut: 200 },
    { id: `${lane}-b`, mediaId, trackId, linkGroupId: group, timelineIn: 200, timelineOut: 400, sourceIn: 300, sourceOut: 500 },
  ];
  const timeline = {
    ...base.timeline,
    sources: [],
    linkedGroups: [],
    tracks: [
      { id: 'v-screen', kind: 'video' as const, index: 0, label: 'Screen', enabled: true, locked: false, muted: false, clips: section('screen', `source:${REC}:screen`, 'v-screen') },
      { id: 'v-camera', kind: 'video' as const, index: 1, label: 'Camera', enabled: true, locked: false, muted: false, clips: section('camera', `source:${REC}:camera`, 'v-camera') },
      { id: 'a-audio', kind: 'audio' as const, index: 2, label: 'Audio', enabled: true, locked: false, muted: false, clips: section('audio', `source:${REC}:system-audio`, 'a-audio') },
    ],
    effects: [{ id: 'graphic-1', kind: 'graphic' as const, ownerId: 'timeline', ownerType: 'timeline' as const, startFrame: 250, endFrame: 280, enabled: true, params: {} }],
  };
  return canonicalizeProjectDocument({ ...base, timeline });
}

let ids = 0;
const idFactory = (prefix: string) => `${prefix}-${++ids}`;

function externalClip(durationFrames = 90, hasAudio = true) {
  return createInsertedMediaAsset({ id: 'ext1', filePath: '/elsewhere/windows-install.mp4', durationFrames, kind: 'clip', hasAudio, width: 1280, height: 720, fps: 30 });
}

function lane(document: ProjectDocument, trackId: string) {
  return document.timeline.tracks.find((track) => track.id === trackId)!.clips.map((clip) => [clip.mediaId.replace(`source:${REC}:`, ''), clip.timelineIn, clip.timelineOut, clip.sourceIn, clip.sourceOut]);
}

describe('inserted media: insert vs overwrite', () => {
  it('insert ripples every lane and graphics later by the clip length, nothing is covered', () => {
    const next = insertMediaClip(launchLikeProject(), { asset: externalClip(90), frame: 100, mode: 'insert', placement: 'screen', idFactory });
    expect(collectTimelineInvariantIssues(next.timeline)).toEqual([]);
    expect(lane(next, 'v-screen')).toEqual([
      ['screen', 0, 100, 0, 100],
      ['source:ext1', 100, 190, 0, 90],
      ['screen', 190, 290, 100, 200],
      ['screen', 290, 490, 300, 500],
    ]);
    // Camera keeps its footage but has nothing over the inserted clip.
    expect(lane(next, 'v-camera')).toEqual([
      ['camera', 0, 100, 0, 100],
      ['camera', 190, 290, 100, 200],
      ['camera', 290, 490, 300, 500],
    ]);
    expect(lane(next, 'a-audio')).toEqual([
      ['system-audio', 0, 100, 0, 100],
      ['source:ext1', 100, 190, 0, 90],
      ['system-audio', 190, 290, 100, 200],
      ['system-audio', 290, 490, 300, 500],
    ]);
    expect(next.timeline.effects.find((effect) => effect.id === 'graphic-1')).toMatchObject({ startFrame: 340, endFrame: 370 });
    // The source file is only referenced, at the path it was picked from.
    expect(next.assets.find((asset) => asset.id === 'ext1')).toMatchObject({ filePath: '/elsewhere/windows-install.mp4', pathMode: 'absolute' });
  });

  it('overwrite replaces the footage under the clip and keeps the timeline length', () => {
    const before = launchLikeProject();
    const next = insertMediaClip(before, { asset: externalClip(90), frame: 150, mode: 'overwrite', placement: 'screen', idFactory });
    expect(collectTimelineInvariantIssues(next.timeline)).toEqual([]);
    expect(lane(next, 'v-screen')).toEqual([
      ['screen', 0, 150, 0, 150],
      ['source:ext1', 150, 240, 0, 90],
      ['screen', 240, 400, 340, 500],
    ]);
    expect(lane(next, 'v-camera')).toEqual([
      ['camera', 0, 150, 0, 150],
      ['camera', 240, 400, 340, 500],
    ]);
    expect(next.timeline.effects.find((effect) => effect.id === 'graphic-1')).toMatchObject({ startFrame: 250, endFrame: 280 });
  });

  it('a silent clip adds no audio clip', () => {
    const next = insertMediaClip(launchLikeProject(), { asset: externalClip(30, false), frame: 0, mode: 'insert', placement: 'screen', idFactory });
    expect(listInsertedClips(next).map((clip) => clip.lane)).toEqual(['screen']);
  });

  it('a camera take goes on the take lanes; the recording camera and voice stay, only covered', () => {
    const take = createInsertedMediaAsset({ id: 'pick1', filePath: '/rec/pickups/p1.webm', durationFrames: 120, kind: 'pickup', hasAudio: true });
    const before = launchLikeProject();
    const next = insertMediaClip(before, { asset: take, frame: 180, mode: 'insert', placement: 'camera', sourceIn: 20, idFactory });
    expect(collectTimelineInvariantIssues(next.timeline)).toEqual([]);
    for (const trackId of ['v-screen', 'v-camera', 'a-audio']) expect(lane(next, trackId)).toEqual(lane(before, trackId));
    expect(lane(next, CAMERA_TAKES_TRACK_ID)).toEqual([['source:pick1', 180, 280, 20, 120]]);
    expect(lane(next, CAMERA_TAKES_AUDIO_TRACK_ID)).toEqual([['source:pick1', 180, 280, 20, 120]]);
    // The take lanes sit above the recording, so the take is the bubble that is drawn.
    const takeIndex = next.timeline.tracks.find((track) => track.id === CAMERA_TAKES_TRACK_ID)!.index;
    expect(Math.max(...before.timeline.tracks.map((track) => track.index))).toBeLessThan(takeIndex);
  });
});

describe('inserted media: editing like any clip', () => {
  it('removing an inserted clip closes its gap and returns the timeline to how it was', () => {
    const before = launchLikeProject();
    const inserted = insertMediaClip(before, { asset: externalClip(90), frame: 100, mode: 'insert', placement: 'screen', idFactory });
    const clipId = listInsertedClips(inserted).find((clip) => clip.lane === 'screen')!.clipId;
    const removed = removeInsertedClip(inserted, { clipId });
    expect(removed.assets.some((asset) => asset.id === 'ext1')).toBe(false);
    expect(listInsertedClips(removed)).toEqual([]);
    const spans = (document: ProjectDocument, trackId: string) => lane(document, trackId).map(([, , , sourceIn, sourceOut]) => [sourceIn, sourceOut]);
    expect(lane(removed, 'v-screen').at(-1)).toEqual(['screen', 200, 400, 300, 500]);
    expect(spans(removed, 'v-screen')).toEqual([[0, 100], [100, 200], [300, 500]]);
    expect(removed.timeline.effects.find((effect) => effect.id === 'graphic-1')).toMatchObject({ startFrame: 250, endFrame: 280 });
  });

  it('removing a take leaves the recording exactly as it was', () => {
    const take = createInsertedMediaAsset({ id: 'pick1', filePath: '/rec/pickups/p1.webm', durationFrames: 120, kind: 'pickup', hasAudio: true });
    const before = launchLikeProject();
    const inserted = insertMediaClip(before, { asset: take, frame: 180, mode: 'overwrite', placement: 'camera', idFactory });
    const clipId = listInsertedClips(inserted).find((clip) => clip.lane === 'camera')!.clipId;
    const removed = removeInsertedClip(inserted, { clipId });
    expect(collectTimelineInvariantIssues(removed.timeline)).toEqual([]);
    for (const trackId of ['v-screen', 'v-camera', 'a-audio']) expect(lane(removed, trackId)).toEqual(lane(before, trackId));
    expect(lane(removed, CAMERA_TAKES_TRACK_ID)).toEqual([]);
  });

  it('keeps every take for a range, newest first, and switches between them', () => {
    const takeA = createInsertedMediaAsset({ id: 'takeA', filePath: '/rec/pickups/a.webm', durationFrames: 200, kind: 'pickup', hasAudio: true, extraMetadata: { recordedAt: '2026-10-20T10:00:00Z' } });
    const takeB = createInsertedMediaAsset({ id: 'takeB', filePath: '/rec/pickups/b.webm', durationFrames: 200, kind: 'pickup', hasAudio: true, extraMetadata: { recordedAt: '2026-10-20T10:05:00Z' } });
    const first = insertMediaClip(launchLikeProject(), { asset: takeA, frame: 100, mode: 'overwrite', placement: 'camera', sourceIn: 30, sourceOut: 130, idFactory });
    const second = insertMediaClip(first, { asset: takeB, frame: 100, mode: 'overwrite', placement: 'camera', sourceIn: 45, sourceOut: 145, idFactory });
    const activeClip = listInsertedClips(second).find((clip) => clip.lane === 'camera')!;
    expect(activeClip.assetId).toBe('takeB');
    const takes = listCameraTakes(second, activeClip.clipId);
    expect(takes.map((take) => [take.assetId, take.active])).toEqual([['takeB', true], ['takeA', false]]);
    // Back to the first take: same range, its own lead-in skipped.
    const switched = useCameraTake(second, { clipId: activeClip.clipId, assetId: 'takeA', idFactory });
    expect(lane(switched, CAMERA_TAKES_TRACK_ID)).toEqual([['source:takeA', 100, 200, 30, 130]]);
    expect(lane(switched, CAMERA_TAKES_AUDIO_TRACK_ID)).toEqual([['source:takeA', 100, 200, 30, 130]]);
    expect(switched.assets.some((asset) => asset.id === 'takeB')).toBe(true);
  });

  it('trims within the file and never over a neighbour', () => {
    const inserted = insertMediaClip(launchLikeProject(), { asset: externalClip(90), frame: 100, mode: 'insert', placement: 'screen', sourceIn: 10, sourceOut: 70, idFactory });
    const clip = listInsertedClips(inserted).find((item) => item.lane === 'screen')!;
    expect([clip.timelineIn, clip.timelineOut]).toEqual([100, 160]);
    // Head can only reveal the 10 hidden frames; the screen section before ends at 100 so it cannot grow left at all.
    const headGrow = trimInsertedClip(inserted, { clipId: clip.clipId, edge: 'head', frame: 80 });
    expect(listInsertedClips(headGrow).find((item) => item.lane === 'screen')).toMatchObject({ timelineIn: 100, sourceIn: 10 });
    const headTrim = trimInsertedClip(inserted, { clipId: clip.clipId, edge: 'head', frame: 120 });
    expect(listInsertedClips(headTrim).filter((item) => item.lane !== 'camera').map((item) => [item.lane, item.timelineIn, item.sourceIn])).toEqual([['audio', 120, 30], ['screen', 120, 30]]);
    const tailShort = trimInsertedClip(inserted, { clipId: clip.clipId, edge: 'tail', frame: 130 });
    expect(listInsertedClips(tailShort).find((item) => item.lane === 'screen')).toMatchObject({ timelineOut: 130, sourceOut: 40 });
    expect(collectTimelineInvariantIssues(tailShort.timeline)).toEqual([]);
  });

  it('moves into free space with its sound and refuses to overlap', () => {
    const base = launchLikeProject();
    const trimmedEnd = { ...base, timeline: { ...base.timeline, tracks: base.timeline.tracks.map((track) => ({ ...track, clips: track.clips.filter((clip) => clip.timelineIn < 200) })) } };
    const inserted = insertMediaClip(trimmedEnd, { asset: externalClip(50), frame: 200, mode: 'overwrite', placement: 'screen', idFactory });
    const clip = listInsertedClips(inserted).find((item) => item.lane === 'screen')!;
    const moved = moveInsertedClip(inserted, { clipId: clip.clipId, timelineIn: 260 });
    expect(listInsertedClips(moved).map((item) => [item.lane, item.timelineIn, item.timelineOut])).toEqual([['audio', 260, 310], ['screen', 260, 310]]);
    expect(() => moveInsertedClip(inserted, { clipId: clip.clipId, timelineIn: 150 })).toThrow(/overlap/);
  });
});

describe('pickup landing', () => {
  it('drops the countdown lead-in and lands at the playhead', () => {
    expect(pickupLanding({ playheadFrame: 900, recordingStartedAtMs: 1000, playbackStartedAtMs: 4000, fileDurationFrames: 1200, fps: 30 }))
      .toEqual({ frame: 900, sourceIn: 90, sourceOut: 1200 });
  });

  it('refuses a take that stopped before playback began', () => {
    expect(pickupLanding({ playheadFrame: 0, recordingStartedAtMs: 0, playbackStartedAtMs: 3000, fileDurationFrames: 80, fps: 30 })).toBeNull();
  });
});

describe('splitting inserted clips', () => {
  it('splits picture and sound together; each half edits on its own', () => {
    const inserted = insertMediaClip(launchLikeProject(), { asset: externalClip(90), frame: 100, mode: 'insert', placement: 'screen', idFactory });
    const split = splitInsertedClipsAt(inserted, { frame: 130, idFactory });
    expect(collectTimelineInvariantIssues(split.timeline)).toEqual([]);
    expect(listInsertedClips(split).map((clip) => [clip.lane, clip.timelineIn, clip.timelineOut, clip.sourceIn])).toEqual([
      ['audio', 100, 130, 0], ['screen', 100, 130, 0], ['audio', 130, 190, 30], ['screen', 130, 190, 30],
    ]);
    const secondHalf = listInsertedClips(split).find((clip) => clip.lane === 'screen' && clip.timelineIn === 130)!;
    const removed = removeInsertedClip(split, { clipId: secondHalf.clipId });
    expect(listInsertedClips(removed).map((clip) => [clip.lane, clip.timelineIn, clip.timelineOut])).toEqual([['audio', 100, 130], ['screen', 100, 130]]);
    expect(removed.assets.some((asset) => asset.id === 'ext1')).toBe(true);
  });
});
