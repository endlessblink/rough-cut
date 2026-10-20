import { describe, expect, it } from 'vitest';
import { createAsset, createProject } from './factories.js';
import {
  createInsertedMediaAsset,
  listInsertedClips,
  moveInsertedClip,
  placeVoiceTake,
  removeInsertedClip,
  setVoiceOverMode,
  trimInsertedClip,
  VOICE_OVER_TRACK_ID,
  voiceOverReplaceRanges,
} from './inserted-media.js';
import { canonicalizeProjectDocument, collectTimelineInvariantIssues, type TimelineClip } from './shared-timeline.js';
import type { AssetId, ProjectDocument } from './types.js';

const REC = 'rec' as AssetId;

function project(): ProjectDocument {
  const recording = createAsset('recording', '/rec/screen.mp4', { id: REC, duration: 600, metadata: { width: 1920, height: 1080, fps: 30 } });
  const base = createProject({ assets: [recording] });
  const group = `linked:${REC}`;
  const clip = (lane: string, mediaId: string, trackId: string): TimelineClip[] => [
    { id: `${lane}-a`, mediaId, trackId, linkGroupId: group, timelineIn: 0, timelineOut: 400, sourceIn: 0, sourceOut: 400 },
  ];
  return canonicalizeProjectDocument({
    ...base,
    timeline: {
      ...base.timeline,
      sources: [],
      linkedGroups: [],
      tracks: [
        { id: 'v-screen', kind: 'video' as const, index: 0, label: 'Screen', enabled: true, locked: false, muted: false, clips: clip('screen', `source:${REC}:screen`, 'v-screen') },
        { id: 'a-audio', kind: 'audio' as const, index: 1, label: 'Audio', enabled: true, locked: false, muted: false, clips: clip('audio', `source:${REC}:system-audio`, 'a-audio') },
      ],
      effects: [],
    },
  });
}

let ids = 0;
const idFactory = (prefix: string) => `${prefix}-${++ids}`;

function voice(id: string, durationFrames = 120, voiceMode: 'replace' | 'over' = 'replace') {
  return createInsertedMediaAsset({ id, filePath: `/takes/${id}.webm`, durationFrames, kind: 'voice', name: id, voiceMode });
}

describe('voice-over takes', () => {
  it('land as sound only on their own lane at the exact frame, leaving the recording untouched', () => {
    const before = project();
    const next = placeVoiceTake(before, { asset: voice('vo1'), frame: 90, sourceIn: 30, sourceOut: 120, idFactory });
    const track = next.timeline.tracks.find((item) => item.id === VOICE_OVER_TRACK_ID)!;
    expect(track.kind).toBe('audio');
    expect(track.clips.map((clip) => [clip.timelineIn, clip.timelineOut, clip.sourceIn, clip.sourceOut])).toEqual([[90, 180, 30, 120]]);
    // No picture is added anywhere, and the recording's own lanes are unchanged.
    expect(next.timeline.tracks.filter((item) => item.kind === 'video').flatMap((item) => item.clips).map((clip) => clip.id)).toEqual(['screen-a']);
    expect(next.timeline.tracks.find((item) => item.id === 'a-audio')!.clips).toEqual(before.timeline.tracks.find((item) => item.id === 'a-audio')!.clips);
    expect(collectTimelineInvariantIssues(next.timeline)).toEqual([]);
    const view = listInsertedClips(next).find((clip) => clip.kind === 'voice')!;
    expect(view.lane).toBe('audio');
    expect(view.voiceMode).toBe('replace');
  });

  it('replace mutes the recording under it; over plays both; the choice is per take and undoable by value', () => {
    const placed = placeVoiceTake(project(), { asset: voice('vo1'), frame: 0, idFactory });
    expect(voiceOverReplaceRanges(placed)).toEqual([[0, 120]]);
    const clipId = listInsertedClips(placed).find((clip) => clip.kind === 'voice')!.clipId;
    const over = setVoiceOverMode(placed, { clipId, mode: 'over' });
    expect(voiceOverReplaceRanges(over)).toEqual([]);
    expect(listInsertedClips(over).find((clip) => clip.clipId === clipId)!.voiceMode).toBe('over');
    // The previous document is untouched, so undo is just going back to it.
    expect(voiceOverReplaceRanges(placed)).toEqual([[0, 120]]);
    const second = placeVoiceTake(over, { asset: voice('vo2', 60), frame: 300, idFactory });
    expect(voiceOverReplaceRanges(second)).toEqual([[300, 360]]);
  });

  it('a new take over an older one cuts the older one away there only', () => {
    const first = placeVoiceTake(project(), { asset: voice('vo1', 200), frame: 0, idFactory });
    const second = placeVoiceTake(first, { asset: voice('vo2', 50), frame: 100, idFactory });
    const spans = second.timeline.tracks.find((item) => item.id === VOICE_OVER_TRACK_ID)!.clips.map((clip) => [clip.mediaId, clip.timelineIn, clip.timelineOut]);
    expect(spans).toEqual([['source:vo1', 0, 100], ['source:vo2', 100, 150], ['source:vo1', 150, 200]]);
  });

  it('can be moved, trimmed and removed like any clip, and removing never moves anything else', () => {
    const placed = placeVoiceTake(project(), { asset: voice('vo1'), frame: 60, sourceIn: 10, sourceOut: 100, idFactory });
    const clipId = listInsertedClips(placed).find((clip) => clip.kind === 'voice')!.clipId;
    const moved = moveInsertedClip(placed, { clipId, timelineIn: 200 });
    expect(listInsertedClips(moved).find((clip) => clip.clipId === clipId)).toMatchObject({ timelineIn: 200, timelineOut: 290 });
    const trimmed = trimInsertedClip(moved, { clipId, edge: 'head', frame: 195 });
    expect(listInsertedClips(trimmed).find((clip) => clip.clipId === clipId)).toMatchObject({ timelineIn: 195, sourceIn: 5 });
    const removed = removeInsertedClip(trimmed, { clipId });
    expect(listInsertedClips(removed)).toEqual([]);
    expect(removed.timeline.tracks.find((item) => item.id === 'v-screen')!.clips.map((clip) => [clip.timelineIn, clip.timelineOut])).toEqual([[0, 400]]);
  });
});
