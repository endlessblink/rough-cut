import { describe, expect, it } from 'vitest';
import { createAsset, createProject } from './factories.js';
import { migrate } from './migrations.js';
import { validateProject } from './schemas.js';
import { CURRENT_SCHEMA_VERSION } from './constants.js';
import { canonicalizeProjectDocument, type TimelineClip } from './shared-timeline.js';
import { moveClip, rippleDeleteRange, splitClip, trimClipEdge } from './timeline-commands.js';
import {
  audioLevelFromUnknown,
  audioLevelGain,
  clampAudioVolume,
  getClipAudioLevel,
  getRecordingAudioLevel,
  linkedSectionClipIds,
  withClipAudioLevel,
  withoutClipAudioLevels,
  withRecordingAudioLevel,
} from './audio-level.js';
import type { AssetId, ProjectDocument } from './types.js';

const REC = 'rec' as AssetId;
const CAM = 'cam' as AssetId;

/** One recording split into two sections, with linked screen / camera / audio lanes. */
function splitRecordingProject(): ProjectDocument {
  const recording = createAsset('recording', '/rec/screen.mp4', { id: REC, duration: 600, cameraAssetId: CAM, metadata: { width: 1920, height: 1080, fps: 30 } });
  const camera = createAsset('video', '/rec/camera.mp4', { id: CAM, duration: 600, metadata: { isCamera: true } });
  const base = createProject({ assets: [recording, camera] });
  const group = `linked:${REC}`;
  const section = (lane: string, mediaId: string, trackId: string): TimelineClip[] => [
    { id: `${lane}-a`, mediaId, trackId, linkGroupId: group, timelineIn: 0, timelineOut: 200, sourceIn: 0, sourceOut: 200 },
    { id: `${lane}-b`, mediaId, trackId, linkGroupId: group, timelineIn: 200, timelineOut: 400, sourceIn: 300, sourceOut: 500 },
  ];
  return canonicalizeProjectDocument({
    ...base,
    timeline: {
      ...base.timeline,
      sources: [],
      linkedGroups: [],
      tracks: [
        { id: 'v-screen', kind: 'video', index: 0, label: 'Screen', enabled: true, locked: false, muted: false, clips: section('screen', `source:${REC}:screen`, 'v-screen') },
        { id: 'v-camera', kind: 'video', index: 1, label: 'Camera', enabled: true, locked: false, muted: false, clips: section('camera', `source:${REC}:camera`, 'v-camera') },
        { id: 'a-audio', kind: 'audio', index: 2, label: 'Audio', enabled: true, locked: false, muted: false, clips: section('audio', `source:${REC}:system-audio`, 'a-audio') },
      ],
    },
  });
}

const roundTrip = (document: ProjectDocument) => migrate(JSON.parse(JSON.stringify(document)));
const allClips = (document: ProjectDocument) => document.timeline.tracks.flatMap((track) => track.clips);

describe('audio levels: values', () => {
  it('clamps to 0..200%, rounds to 1% and reads junk as 100%', () => {
    expect(clampAudioVolume(0.5)).toBe(0.5);
    expect(clampAudioVolume(3)).toBe(2);
    expect(clampAudioVolume(-1)).toBe(0);
    expect(clampAudioVolume(0.12345)).toBe(0.12);
    expect(clampAudioVolume('0.7')).toBe(0.7);
    for (const junk of [undefined, null, '', 'loud', NaN, Infinity, true, {}]) expect(clampAudioVolume(junk)).toBe(1);
  });

  it('stores only what differs from the default', () => {
    expect(audioLevelFromUnknown({ volume: 1, muted: false })).toBeUndefined();
    expect(audioLevelFromUnknown({ volume: 1.5 })).toEqual({ volume: 1.5 });
    expect(audioLevelFromUnknown({ muted: true })).toEqual({ muted: true });
    expect(audioLevelFromUnknown({ volume: 'x', muted: 'yes' })).toBeUndefined();
    expect(audioLevelFromUnknown('loud')).toBeUndefined();
  });

  it('gain is 0 when muted, else the volume', () => {
    expect(audioLevelGain(undefined)).toBe(1);
    expect(audioLevelGain({ volume: 0.5 })).toBe(0.5);
    expect(audioLevelGain({ volume: 2, muted: true })).toBe(0);
  });
});

describe('settings.recordingAudio (track volume)', () => {
  it('is absent on new projects and reads as 100%, not muted', () => {
    const project = createProject();
    expect(project.settings.recordingAudio).toBeUndefined();
    expect(getRecordingAudioLevel(project.settings)).toEqual({ volume: 1, muted: false });
  });

  it('round-trips through save/load without a schema version bump; going back to 100% removes it', () => {
    const project = withRecordingAudioLevel(createProject(), { volume: 1.5, muted: true });
    const loaded = roundTrip(project);
    expect(loaded.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(loaded.settings.recordingAudio).toEqual({ volume: 1.5, muted: true });
    const reset = withRecordingAudioLevel(loaded, { volume: 1, muted: false });
    expect('recordingAudio' in reset.settings).toBe(false);
    expect(withRecordingAudioLevel(reset, { volume: 1 })).toBe(reset);
  });

  it('clamps out-of-range values and drops junk instead of failing the load', () => {
    const base = JSON.parse(JSON.stringify(createProject()));
    expect(validateProject({ ...base, settings: { ...base.settings, recordingAudio: { volume: 9 } } }).settings.recordingAudio).toEqual({ volume: 2 });
    expect(validateProject({ ...base, settings: { ...base.settings, recordingAudio: 'max' } }).settings.recordingAudio).toBeUndefined();
  });
});

describe('clip volume', () => {
  it('older projects without the field load unchanged and read as 100%', () => {
    const project = splitRecordingProject();
    const loaded = roundTrip(project);
    expect(allClips(loaded).every((clip) => clip.audio === undefined)).toBe(true);
    expect(getClipAudioLevel(loaded, 'screen-a')).toEqual({ volume: 1, muted: false });
    expect(loaded.timeline).toEqual(project.timeline);
  });

  it('applies to the whole section (screen, camera and sound) and nothing else', () => {
    const project = splitRecordingProject();
    expect(linkedSectionClipIds(project, 'screen-b').sort()).toEqual(['audio-b', 'camera-b', 'screen-b']);
    const next = withClipAudioLevel(project, ['screen-b'], { volume: 0.5 });
    for (const id of ['screen-b', 'camera-b', 'audio-b']) expect(getClipAudioLevel(next, id)).toEqual({ volume: 0.5, muted: false });
    for (const id of ['screen-a', 'camera-a', 'audio-a']) expect(allClips(next).find((clip) => clip.id === id)?.audio).toBeUndefined();
    expect(withClipAudioLevel(next, ['screen-b'], { volume: 0.5 })).toBe(next);
    const muted = withClipAudioLevel(next, ['screen-b'], { muted: true });
    expect(getClipAudioLevel(muted, 'audio-b')).toEqual({ volume: 0.5, muted: true });
  });

  it('survives save/reopen and is cleaned of bad values', () => {
    const project = withClipAudioLevel(splitRecordingProject(), ['screen-a'], { volume: 1.8, muted: true });
    const loaded = roundTrip(project);
    expect(getClipAudioLevel(loaded, 'screen-a')).toEqual({ volume: 1.8, muted: true });
    const raw = JSON.parse(JSON.stringify(project));
    raw.timeline.tracks[0].clips[1].audio = { volume: 'loud', muted: 1 };
    raw.timeline.tracks[0].clips[0].audio = { volume: 7 };
    const repaired = migrate(raw);
    const screen = repaired.timeline.tracks.find((track) => track.id === 'v-screen')!.clips;
    expect(screen.find((clip) => clip.id === 'screen-a')?.audio).toEqual({ volume: 2 });
    expect(screen.find((clip) => clip.id === 'screen-b')?.audio).toBeUndefined();
  });

  it('follows the clip through split, trim, move and ripple delete', () => {
    const project = withClipAudioLevel(splitRecordingProject(), ['screen-b'], { volume: 0.25 });
    let n = 0;
    const idFactory = (prefix: string) => `${prefix}-${++n}`;
    const split = splitClip(project, { clipId: 'screen-b', frame: 300, idFactory }).document;
    const halves = allClips(split).filter((clip) => clip.timelineIn >= 200);
    expect(halves.length).toBe(6);
    expect(halves.every((clip) => clip.audio?.volume === 0.25)).toBe(true);
    expect(allClips(split).filter((clip) => clip.timelineIn < 200).every((clip) => clip.audio === undefined)).toBe(true);

    const rightHalf = halves.find((clip) => clip.mediaId.endsWith(':screen') && clip.timelineIn === 300)!;
    const trimmed = trimClipEdge(split, { clipId: rightHalf.id, edge: 'tail', frame: 350 }).document;
    expect(allClips(trimmed).find((clip) => clip.id === rightHalf.id)?.audio).toEqual({ volume: 0.25 });

    const moved = moveClip(trimmed, { clipId: rightHalf.id, timelineIn: 500 }).document;
    expect(allClips(moved).find((clip) => clip.id === rightHalf.id)).toMatchObject({ timelineIn: 500, audio: { volume: 0.25 } });

    const rippled = rippleDeleteRange(split, { startFrame: 0, endFrame: 200, linkGroupId: `linked:${REC}` }).document;
    expect(allClips(rippled).every((clip) => clip.audio?.volume === 0.25)).toBe(true);
  });

  it('can be cleared for every clip at once', () => {
    const project = withClipAudioLevel(splitRecordingProject(), ['screen-a', 'screen-b'], { muted: true });
    const cleared = withoutClipAudioLevels(project);
    expect(allClips(cleared).every((clip) => clip.audio === undefined)).toBe(true);
    expect(withoutClipAudioLevels(cleared)).toBe(cleared);
  });
});
