import { canonicalizeProjectDocument } from './shared-timeline.js';
import type { Timeline, TimelineClip, TimelineEffect, TimelineLinkedGroup, TimelineTrack } from './shared-timeline.js';
import type { Asset, AssetId, Frame, ProjectDocument } from './types.js';

/**
 * Footage that comes from outside the recording: a video file the user dropped in
 * (`clip`) or a camera pickup recorded over timeline playback (`pickup`).
 *
 * Each one is an ordinary asset that only *references* its file (never copied or
 * moved), plus one linked group holding a picture clip and, when the file has sound,
 * an audio clip. All of it lives on the one shared timeline:
 *
 * - `screen` placement: on the recording's own screen and audio lanes. The clip takes
 *   the whole picture, and the recording's camera, cursor, clicks and zooms are not
 *   there for its length (its lanes are cleared or rippled for it).
 * - `camera` placement (a camera take): on two dedicated take lanes above the
 *   recording. The take is the camera bubble for its range and its voice replaces
 *   the recording's sound there. The recording's own camera and sound clips stay on
 *   their lanes untouched, so the old voice is only muted while a take covers it.
 *   Every take recorded for a range is kept; one is on the timeline at a time.
 * - a voice-over take (`voice`): sound only, recorded from the mic while the timeline
 *   plays, on its own "Voice-over" lane. Per take it either replaces the recording's
 *   sound under it (muted, not removed) or plays over it.
 */
export type InsertedMediaKind = 'clip' | 'pickup' | 'voice';
/** A voice-over either replaces the recording's sound under it or plays over it. */
export type VoiceOverMode = 'replace' | 'over';
export type InsertedMediaPlacement = 'screen' | 'camera';
/** `insert` ripples later footage along; `overwrite` replaces what was there. */
export type InsertEditMode = 'insert' | 'overwrite';

export interface InsertedMediaInfo {
  readonly kind: InsertedMediaKind;
  readonly name: string;
  readonly hasAudio: boolean;
  readonly width: number | null;
  readonly height: number | null;
  readonly fps: number | null;
  /** Voice-over takes only. */
  readonly voiceMode?: VoiceOverMode | null;
}

export interface InsertedMediaAssetInput {
  readonly id: string;
  readonly filePath: string;
  readonly durationFrames: Frame;
  readonly kind: InsertedMediaKind;
  readonly name?: string;
  readonly hasAudio?: boolean;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly fps?: number | null;
  readonly voiceMode?: VoiceOverMode;
  readonly extraMetadata?: Record<string, unknown>;
}

export interface InsertedClipView {
  readonly clipId: string;
  readonly assetId: string;
  readonly linkGroupId: string;
  readonly trackId: string;
  readonly lane: 'screen' | 'camera' | 'audio';
  readonly timelineIn: Frame;
  readonly timelineOut: Frame;
  readonly sourceIn: Frame;
  readonly sourceOut: Frame;
  readonly sourceDuration: Frame;
  readonly kind: InsertedMediaKind;
  readonly name: string;
  readonly filePath: string;
  readonly hasAudio: boolean;
  /** Set on voice-over takes: whether it replaces the recording's sound under it. */
  readonly voiceMode: VoiceOverMode | null;
}

export interface InsertMediaInput {
  readonly asset: Asset;
  /** Timeline frame the clip starts at (the playhead). */
  readonly frame: Frame;
  readonly mode: InsertEditMode;
  readonly placement: InsertedMediaPlacement;
  /** Part of the file to use; defaults to all of it. */
  readonly sourceIn?: Frame;
  readonly sourceOut?: Frame;
  readonly idFactory?: (prefix: string) => string;
}

/** Dedicated lanes for camera takes, above the recording's lanes. */
export const CAMERA_TAKES_TRACK_ID = 'track:camera-takes';
export const CAMERA_TAKES_AUDIO_TRACK_ID = 'track:camera-takes-audio';
/** The lane voice-over takes live on, below everything else. */
export const VOICE_OVER_TRACK_ID = 'track:voice-over';

export interface CameraTakeView {
  readonly assetId: string;
  readonly name: string;
  readonly recordedAt: string | null;
  readonly durationFrames: Frame;
  readonly active: boolean;
}

export class InsertedMediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsertedMediaError';
  }
}

export function createInsertedMediaAsset(input: InsertedMediaAssetInput): Asset {
  const durationFrames = Math.max(1, Math.round(Number(input.durationFrames) || 0));
  const info: InsertedMediaInfo = {
    kind: input.kind,
    name: input.name ?? (input.filePath.split(/[\\/]/).pop() || input.filePath),
    hasAudio: input.hasAudio === true,
    width: finiteOrNull(input.width),
    height: finiteOrNull(input.height),
    fps: finiteOrNull(input.fps),
    ...(input.kind === 'voice' ? { voiceMode: input.voiceMode === 'over' ? 'over' : 'replace' } : {}),
  };
  return {
    id: input.id as AssetId,
    type: 'video',
    filePath: input.filePath,
    pathMode: 'absolute',
    duration: durationFrames,
    metadata: {
      ...(input.extraMetadata ?? {}),
      width: info.width,
      height: info.height,
      fps: info.fps,
      insertedMedia: info,
    },
  };
}

export function insertedMediaInfo(asset: Asset | null | undefined): InsertedMediaInfo | null {
  const raw = asset?.metadata?.['insertedMedia'];
  if (!raw || typeof raw !== 'object') return null;
  const info = raw as Partial<InsertedMediaInfo>;
  if (info.kind !== 'clip' && info.kind !== 'pickup' && info.kind !== 'voice') return null;
  return {
    kind: info.kind,
    name: typeof info.name === 'string' ? info.name : asset?.filePath ?? '',
    hasAudio: info.kind === 'voice' || info.hasAudio === true,
    width: finiteOrNull(info.width),
    height: finiteOrNull(info.height),
    fps: finiteOrNull(info.fps),
    ...(info.kind === 'voice' ? { voiceMode: info.voiceMode === 'over' ? 'over' as const : 'replace' as const } : {}),
  };
}

export function insertedMediaSourceId(assetId: string): string {
  return `source:${assetId}`;
}

export function insertedMediaLinkGroupId(assetId: string): string {
  return `linked:${assetId}`;
}

/** Source ids (timeline media references) that belong to inserted media. */
export function insertedMediaSourceIds(document: Pick<ProjectDocument, 'assets'>): Set<string> {
  return new Set(
    (document.assets ?? [])
      .filter((asset) => insertedMediaInfo(asset))
      .map((asset) => insertedMediaSourceId(asset.id)),
  );
}

export function hasInsertedMedia(document: Pick<ProjectDocument, 'assets'> | null | undefined): boolean {
  return Boolean(document?.assets?.some((asset) => insertedMediaInfo(asset)));
}

/**
 * The lanes the recording uses. Inserted footage goes onto these same tracks so
 * track order stays the z-order and every view sees one timeline.
 */
export function recordingLaneTracks(timeline: Timeline, recordingAssetId: string | null) {
  const screenSourceId = recordingAssetId ? `source:${recordingAssetId}:screen` : null;
  const cameraSourceId = recordingAssetId ? `source:${recordingAssetId}:camera` : null;
  const recordingGroupId = recordingAssetId ? `linked:${recordingAssetId}` : null;
  const videoTracks = timeline.tracks.filter((track) => track.kind === 'video');
  const audioTracks = timeline.tracks.filter((track) => track.kind === 'audio');
  const screen = (screenSourceId ? videoTracks.find((track) => track.clips.some((clip) => clip.mediaId === screenSourceId)) : null)
    ?? videoTracks.find((track) => track.id !== CAMERA_TAKES_TRACK_ID)
    ?? null;
  const camera = (cameraSourceId ? videoTracks.find((track) => track.clips.some((clip) => clip.mediaId === cameraSourceId)) : null)
    ?? null;
  const audio = (recordingGroupId ? audioTracks.find((track) => track.clips.some((clip) => clip.linkGroupId === recordingGroupId)) : null)
    ?? audioTracks.find((track) => track.id !== CAMERA_TAKES_AUDIO_TRACK_ID && track.id !== VOICE_OVER_TRACK_ID)
    ?? null;
  const takes = timeline.tracks.find((track) => track.id === CAMERA_TAKES_TRACK_ID) ?? null;
  const takesAudio = timeline.tracks.find((track) => track.id === CAMERA_TAKES_AUDIO_TRACK_ID) ?? null;
  return { screen, camera, audio, takes, takesAudio };
}

export function primaryRecordingAssetId(document: Pick<ProjectDocument, 'assets'>): string | null {
  return document.assets?.find((asset) => asset.type === 'recording')?.id ?? null;
}

/**
 * Put a clip on the timeline at `frame`.
 *
 * - `insert` (ripple): every track splits at `frame` and everything from there on
 *   moves later by the clip's length. Nothing is covered.
 * - `overwrite`: the clip's lanes are cleared for its length and it takes their place.
 *
 * `screen` placement owns the screen, camera and audio lanes for its length (a clip
 * from elsewhere has no camera bubble on top of it). `camera` placement replaces the
 * camera bubble and the sound while the screen keeps playing, so it is always an
 * overwrite of those two lanes.
 */
export function insertMediaClip(document: ProjectDocument, input: InsertMediaInput): ProjectDocument {
  const info = insertedMediaInfo(input.asset);
  if (!info) throw new InsertedMediaError('Asset is not inserted media');
  const idFactory = input.idFactory ?? defaultIdFactory;
  const placement = input.placement;
  const canonicalBefore = canonicalizeProjectDocument(document);
  const sourceDuration = Math.max(1, Math.round(input.asset.duration));
  const sourceIn = clampInt(input.sourceIn ?? 0, 0, sourceDuration - 1);
  const sourceOut = clampInt(input.sourceOut ?? sourceDuration, sourceIn + 1, sourceDuration);
  const length = sourceOut - sourceIn;
  const start = Math.max(0, Math.round(Number(input.frame) || 0));
  const end = start + length;
  // A take recorded over the exact range of the take already there joins its list.
  const existingTake = placement === 'camera'
    ? canonicalBefore.timeline.tracks.find((track) => track.id === CAMERA_TAKES_TRACK_ID)?.clips
      .find((clip) => clip.timelineIn === start && clip.timelineOut === end) ?? null
    : null;
  const existingGroup = existingTake
    ? canonicalBefore.assets.find((asset) => insertedMediaSourceId(asset.id) === existingTake.mediaId)?.metadata?.['takeGroupId']
    : null;
  const asset: Asset = placement === 'camera'
    ? {
        ...input.asset,
        metadata: {
          ...input.asset.metadata,
          takeGroupId: typeof existingGroup === 'string' ? existingGroup : `take-group-${input.asset.id}`,
          takeSourceIn: sourceIn,
          recordedAt: input.asset.metadata?.['recordedAt'] ?? new Date().toISOString(),
        },
      }
    : input.asset;
  const canonical = canonicalizeProjectDocument(placement === 'camera' ? ensureTakeTracks(addInsertedAsset(canonicalBefore, asset)) : addInsertedAsset(canonicalBefore, asset));
  const timeline = canonical.timeline;
  const recordingId = primaryRecordingAssetId(canonical);
  const lanes = recordingLaneTracks(timeline, recordingId);
  const videoTrack = placement === 'camera' ? lanes.takes : lanes.screen;
  const audioTrack = placement === 'camera' ? lanes.takesAudio : lanes.audio;
  if (!videoTrack) throw new InsertedMediaError('This project has no video lane');
  // A take never moves anything: it covers its range on the take lanes only.
  const mode: InsertEditMode = placement === 'camera' ? 'overwrite' : input.mode;

  let tracks: TimelineTrack[] = timeline.tracks.map((track) => ({ ...track, clips: [...track.clips] }));
  let effects = timeline.effects;
  if (mode === 'insert') {
    tracks = tracks.map((track) => ({ ...track, clips: rippleOpenTrack(track.clips, start, length, idFactory) }));
    effects = shiftTimelineEffects(effects, start, length);
  } else {
    const cleared = new Set([videoTrack.id, audioTrack?.id, placement === 'screen' ? lanes.camera?.id : null].filter(Boolean) as string[]);
    tracks = tracks.map((track) => (cleared.has(track.id) ? { ...track, clips: clearTrackRange(track.clips, start, end, idFactory) } : track));
  }

  const sourceId = insertedMediaSourceId(asset.id);
  const linkGroupId = insertedMediaLinkGroupId(asset.id);
  const videoClip: TimelineClip = {
    id: idFactory(`clip-ins-${asset.id}`),
    mediaId: sourceId,
    trackId: videoTrack.id,
    linkGroupId,
    timelineIn: start,
    timelineOut: end,
    sourceIn,
    sourceOut,
  };
  tracks = tracks.map((track) => (track.id === videoTrack.id ? { ...track, clips: sortClips([...track.clips, videoClip]) } : track));
  if (info.hasAudio && audioTrack) {
    const audioClip: TimelineClip = { ...videoClip, id: idFactory(`clip-ins-audio-${asset.id}`), trackId: audioTrack.id };
    tracks = tracks.map((track) => (track.id === audioTrack.id ? { ...track, clips: sortClips([...track.clips, audioClip]) } : track));
  }

  const nextTimeline: Timeline = {
    ...timeline,
    linkedGroups: upsertLinkedGroup(timeline.linkedGroups, {
      id: linkGroupId,
      kind: 'manual-sync',
      sourceIds: [sourceId],
      primarySourceId: sourceId,
      syncPolicy: 'frame-locked',
    }),
    tracks,
    effects,
  };
  return canonicalizeProjectDocument({ ...canonical, timeline: nextTimeline });
}

/** Every inserted clip on the timeline, for the lanes to draw and edit. */
export function listInsertedClips(document: ProjectDocument | null | undefined): InsertedClipView[] {
  if (!document?.timeline) return [];
  const assets = new Map((document.assets ?? []).map((asset) => [insertedMediaSourceId(asset.id), asset]));
  const recordingId = primaryRecordingAssetId(document);
  const lanes = recordingLaneTracks(document.timeline, recordingId);
  return document.timeline.tracks.flatMap((track) => track.clips.flatMap((clip) => {
    const asset = assets.get(clip.mediaId);
    const info = insertedMediaInfo(asset);
    if (!asset || !info) return [];
    const lane: InsertedClipView['lane'] = track.kind === 'audio'
      ? 'audio'
      : track.id === CAMERA_TAKES_TRACK_ID || (lanes.camera && track.id === lanes.camera.id) ? 'camera' : 'screen';
    return [{
      clipId: clip.id,
      assetId: asset.id,
      linkGroupId: clip.linkGroupId ?? insertedMediaLinkGroupId(asset.id),
      trackId: track.id,
      lane,
      timelineIn: clip.timelineIn,
      timelineOut: clip.timelineOut,
      sourceIn: clip.sourceIn,
      sourceOut: clip.sourceOut,
      sourceDuration: asset.duration,
      kind: info.kind,
      name: info.name,
      filePath: asset.filePath,
      hasAudio: info.hasAudio,
      voiceMode: info.kind === 'voice' ? info.voiceMode ?? 'replace' : null,
    }];
  })).sort((left, right) => left.timelineIn - right.timelineIn || left.lane.localeCompare(right.lane));
}

/** The picture clip of one inserted section plus its sound (same group, same span). */
function sectionClipIds(timeline: Timeline, clip: TimelineClip): Set<string> {
  return new Set(
    timeline.tracks
      .flatMap((track) => track.clips)
      .filter((candidate) => candidate.id === clip.id || (
        clip.linkGroupId
        && candidate.linkGroupId === clip.linkGroupId
        && candidate.timelineIn === clip.timelineIn
        && candidate.timelineOut === clip.timelineOut
      ))
      .map((candidate) => candidate.id),
  );
}

/**
 * Take an inserted clip off the timeline.
 *
 * A clip on the screen lane closes its gap (everything after moves up), the way
 * deleting a recording section does. A camera pickup leaves the screen alone and
 * the recording's own camera and sound come back underneath it.
 */
export function removeInsertedClip(
  document: ProjectDocument,
  input: { readonly clipId: string; readonly ripple?: boolean },
): ProjectDocument {
  const canonical = canonicalizeProjectDocument(document);
  const timeline = canonical.timeline;
  const view = listInsertedClips(canonical).find((item) => item.clipId === input.clipId);
  if (!view) return document;
  const target = timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.id === input.clipId)!;
  const ids = sectionClipIds(timeline, target);
  const start = target.timelineIn;
  const end = target.timelineOut;
  let tracks: TimelineTrack[] = timeline.tracks.map((track) => ({ ...track, clips: track.clips.filter((clip) => !ids.has(clip.id)) }));
  let effects = timeline.effects;
  if (view.lane === 'camera' || view.kind === 'voice') {
    // The recording's camera and sound were never touched under a take; nothing to restore.
  } else if (input.ripple !== false) {
    const stillOccupied = tracks.some((track) => track.clips.some((clip) => clip.timelineIn < end && clip.timelineOut > start));
    if (!stillOccupied) {
      tracks = tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => (clip.timelineIn >= end ? shift(clip, start - end) : clip)) }));
      effects = shiftTimelineEffects(effects, end, start - end);
    }
  }
  const stillUsed = view.kind === 'pickup'
    || tracks.some((track) => track.clips.some((clip) => clip.mediaId === insertedMediaSourceId(view.assetId)));
  const nextDocument: ProjectDocument = {
    ...canonical,
    assets: stillUsed ? canonical.assets : canonical.assets.filter((asset) => asset.id !== view.assetId),
    timeline: {
      ...timeline,
      sources: stillUsed ? timeline.sources : timeline.sources.filter((source) => source.id !== insertedMediaSourceId(view.assetId)),
      linkedGroups: stillUsed ? timeline.linkedGroups : timeline.linkedGroups.filter((group) => group.id !== view.linkGroupId),
      tracks,
      effects,
    },
  };
  return canonicalizeProjectDocument(nextDocument);
}

/**
 * Change one edge of an inserted clip (and its sound). Frames are timeline frames.
 * Stays inside the file and never overlaps a neighbour on the same lane.
 */
export function trimInsertedClip(
  document: ProjectDocument,
  input: { readonly clipId: string; readonly edge: 'head' | 'tail'; readonly frame: Frame },
): ProjectDocument {
  const canonical = canonicalizeProjectDocument(document);
  const timeline = canonical.timeline;
  const view = listInsertedClips(canonical).find((item) => item.clipId === input.clipId);
  if (!view) return document;
  const target = timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.id === input.clipId)!;
  const ids = sectionClipIds(timeline, target);
  const requested = Math.round(Number(input.frame));
  if (!Number.isFinite(requested)) return document;
  const neighbours = timeline.tracks
    .filter((track) => track.clips.some((clip) => ids.has(clip.id)))
    .flatMap((track) => track.clips.filter((clip) => !ids.has(clip.id)));
  let delta: number;
  if (input.edge === 'head') {
    const previousOut = Math.max(0, ...neighbours.filter((clip) => clip.timelineOut <= target.timelineIn).map((clip) => clip.timelineOut));
    const frame = clampInt(requested, Math.max(previousOut, target.timelineIn - target.sourceIn), target.timelineOut - 1);
    delta = frame - target.timelineIn;
  } else {
    const nextIn = Math.min(Number.MAX_SAFE_INTEGER, ...neighbours.filter((clip) => clip.timelineIn >= target.timelineOut).map((clip) => clip.timelineIn));
    const frame = clampInt(requested, target.timelineIn + 1, Math.min(nextIn, target.timelineOut + (view.sourceDuration - target.sourceOut)));
    delta = frame - target.timelineOut;
  }
  if (delta === 0) return document;
  const tracks = timeline.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (!ids.has(clip.id)) return clip;
      return input.edge === 'head'
        ? { ...clip, timelineIn: clip.timelineIn + delta, sourceIn: clip.sourceIn + delta }
        : { ...clip, timelineOut: clip.timelineOut + delta, sourceOut: clip.sourceOut + delta };
    }),
  }));
  return canonicalizeProjectDocument({ ...canonical, timeline: { ...timeline, tracks } });
}

/** Move an inserted clip (and its sound) so it starts at `timelineIn`, never over a neighbour. */
export function moveInsertedClip(
  document: ProjectDocument,
  input: { readonly clipId: string; readonly timelineIn: Frame },
): ProjectDocument {
  const canonical = canonicalizeProjectDocument(document);
  const timeline = canonical.timeline;
  const target = timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.id === input.clipId);
  if (!target || !listInsertedClips(canonical).some((item) => item.clipId === input.clipId)) return document;
  const ids = sectionClipIds(timeline, target);
  const length = target.timelineOut - target.timelineIn;
  const nextIn = Math.max(0, Math.round(Number(input.timelineIn) || 0));
  const delta = nextIn - target.timelineIn;
  if (delta === 0) return document;
  const overlaps = timeline.tracks.some((track) => track.clips.some((own) => ids.has(own.id))
    && track.clips.some((clip) => !ids.has(clip.id) && clip.timelineIn < nextIn + length && clip.timelineOut > nextIn));
  if (overlaps) throw new InsertedMediaError('Clips on the same track cannot overlap');
  const tracks = timeline.tracks.map((track) => ({
    ...track,
    clips: sortClips(track.clips.map((clip) => (ids.has(clip.id) ? shift(clip, delta) : clip))),
  }));
  return canonicalizeProjectDocument({ ...canonical, timeline: { ...timeline, tracks } });
}

/**
 * Where a pickup lands. Recording starts first; the timeline starts playing a short
 * countdown later. That lead-in is in the file but not on the timeline, so the clip
 * starts `playbackStartedAtMs - recordingStartedAtMs` into the file, at the frame the
 * playhead was on when playback began.
 */
export function pickupLanding(input: {
  readonly playheadFrame: Frame;
  readonly recordingStartedAtMs: number;
  readonly playbackStartedAtMs: number;
  readonly fileDurationFrames: Frame;
  readonly fps: number;
}): { readonly frame: Frame; readonly sourceIn: Frame; readonly sourceOut: Frame } | null {
  const fps = Number.isFinite(input.fps) && input.fps > 0 ? input.fps : 30;
  const leadFrames = Math.max(0, Math.round(((input.playbackStartedAtMs - input.recordingStartedAtMs) / 1000) * fps));
  const duration = Math.max(0, Math.round(input.fileDurationFrames));
  if (duration - leadFrames < 1) return null;
  return { frame: Math.max(0, Math.round(input.playheadFrame)), sourceIn: leadFrames, sourceOut: duration };
}

function addInsertedAsset(document: ProjectDocument, asset: Asset): ProjectDocument {
  if (document.assets.some((existing) => existing.id === asset.id)) return document;
  return { ...document, assets: [...document.assets, asset] };
}

/** The two take lanes, created above everything else the first time a take lands. */
function ensureTakeTracks(document: ProjectDocument): ProjectDocument {
  const tracks = document.timeline.tracks;
  const nextIndex = Math.max(-1, ...tracks.map((track) => track.index)) + 1;
  const added: TimelineTrack[] = [];
  if (!tracks.some((track) => track.id === CAMERA_TAKES_TRACK_ID)) {
    added.push({ id: CAMERA_TAKES_TRACK_ID, kind: 'video', index: nextIndex, label: 'Camera takes', enabled: true, locked: false, muted: false, clips: [] });
  }
  if (!tracks.some((track) => track.id === CAMERA_TAKES_AUDIO_TRACK_ID)) {
    added.push({ id: CAMERA_TAKES_AUDIO_TRACK_ID, kind: 'audio', index: nextIndex + added.length, label: 'Take voice', enabled: true, locked: false, muted: false, clips: [] });
  }
  return added.length > 0 ? { ...document, timeline: { ...document.timeline, tracks: [...tracks, ...added] } } : document;
}

/** Every take recorded for the range of the take clip `clipId`, newest first. */
export function listCameraTakes(document: ProjectDocument, clipId: string): CameraTakeView[] {
  const clip = document.timeline.tracks.find((track) => track.id === CAMERA_TAKES_TRACK_ID)?.clips.find((item) => item.id === clipId);
  if (!clip) return [];
  const active = document.assets.find((asset) => insertedMediaSourceId(asset.id) === clip.mediaId);
  const group = active?.metadata?.['takeGroupId'];
  if (typeof group !== 'string') return [];
  return document.assets
    .filter((asset) => asset.metadata?.['takeGroupId'] === group && insertedMediaInfo(asset)?.kind === 'pickup')
    .map((asset) => ({
      assetId: asset.id,
      name: insertedMediaInfo(asset)?.name ?? asset.filePath,
      recordedAt: typeof asset.metadata?.['recordedAt'] === 'string' ? asset.metadata['recordedAt'] as string : null,
      durationFrames: asset.duration,
      active: asset.id === active?.id,
    }))
    .sort((left, right) => String(right.recordedAt ?? '').localeCompare(String(left.recordedAt ?? '')));
}

/** Put another kept take in the range of take clip `clipId` (picture and voice). */
export function useCameraTake(
  document: ProjectDocument,
  input: { readonly clipId: string; readonly assetId: string; readonly idFactory?: (prefix: string) => string },
): ProjectDocument {
  const canonical = canonicalizeProjectDocument(document);
  const clip = canonical.timeline.tracks.find((track) => track.id === CAMERA_TAKES_TRACK_ID)?.clips.find((item) => item.id === input.clipId);
  const take = canonical.assets.find((asset) => asset.id === input.assetId);
  if (!clip || !take || insertedMediaSourceId(take.id) === clip.mediaId) return document;
  const takeSourceIn = Math.max(0, Math.round(Number(take.metadata?.['takeSourceIn']) || 0));
  const length = Math.min(clip.timelineOut - clip.timelineIn, take.duration - takeSourceIn);
  if (length < 1) throw new InsertedMediaError('That take is too short for this range');
  const ids = sectionClipIds(canonical.timeline, clip);
  const tracks = canonical.timeline.tracks.map((track) => ({ ...track, clips: track.clips.filter((item) => !ids.has(item.id)) }));
  const cleared = canonicalizeProjectDocument({ ...canonical, timeline: { ...canonical.timeline, tracks } });
  return insertMediaClip(cleared, {
    asset: take,
    frame: clip.timelineIn,
    mode: 'overwrite',
    placement: 'camera',
    sourceIn: takeSourceIn,
    sourceOut: takeSourceIn + length,
    idFactory: input.idFactory,
  });
}

function rippleOpenTrack(clips: readonly TimelineClip[], at: Frame, length: Frame, idFactory: (prefix: string) => string): TimelineClip[] {
  return sortClips(clips.flatMap((clip) => {
    if (clip.timelineOut <= at) return [clip];
    if (clip.timelineIn >= at) return [shift(clip, length)];
    const [left, right] = splitAt(clip, at, idFactory);
    return [left, shift(right, length)];
  }));
}

function clearTrackRange(clips: readonly TimelineClip[], start: Frame, end: Frame, idFactory: (prefix: string) => string): TimelineClip[] {
  return sortClips(clips.flatMap((clip) => {
    if (clip.timelineOut <= start || clip.timelineIn >= end) return [clip];
    const pieces: TimelineClip[] = [];
    if (clip.timelineIn < start) pieces.push(splitAt(clip, start, idFactory)[0]);
    if (clip.timelineOut > end) pieces.push(splitAt(clip, end, idFactory)[1]);
    return pieces;
  }));
}

function splitAt(clip: TimelineClip, frame: Frame, idFactory: (prefix: string) => string): [TimelineClip, TimelineClip] {
  const offset = frame - clip.timelineIn;
  return [
    { ...clip, timelineOut: frame, sourceOut: clip.sourceIn + offset },
    { ...clip, id: idFactory(`${clip.id}-r`), timelineIn: frame, sourceIn: clip.sourceIn + offset },
  ];
}

/** Timeline-placed effects (graphics) after `at` move with the footage. */
function shiftTimelineEffects(effects: readonly TimelineEffect[], at: Frame, delta: Frame): TimelineEffect[] {
  return effects.map((effect) => (effect.ownerType === 'timeline' && typeof effect.startFrame === 'number' && typeof effect.endFrame === 'number' && effect.startFrame >= at
    ? { ...effect, startFrame: Math.max(0, effect.startFrame + delta), endFrame: Math.max(1, effect.endFrame + delta) }
    : effect));
}

function upsertLinkedGroup(groups: readonly TimelineLinkedGroup[], group: TimelineLinkedGroup): TimelineLinkedGroup[] {
  return groups.some((existing) => existing.id === group.id)
    ? groups.map((existing) => (existing.id === group.id ? group : existing))
    : [...groups, group];
}

function shift(clip: TimelineClip, delta: Frame): TimelineClip {
  return { ...clip, timelineIn: clip.timelineIn + delta, timelineOut: clip.timelineOut + delta };
}

function sortClips(clips: readonly TimelineClip[]): TimelineClip[] {
  return [...clips].sort((a, b) => a.timelineIn - b.timelineIn || a.timelineOut - b.timelineOut || a.id.localeCompare(b.id));
}

function clampInt(value: number, min: number, max: number): number {
  const rounded = Math.round(Number(value));
  return Math.max(min, Math.min(max, Number.isFinite(rounded) ? rounded : min));
}

function finiteOrNull(value: unknown): number | null {
  const n = Number(value);
  return value !== null && value !== undefined && Number.isFinite(n) ? n : null;
}

let idCounter = 0;
function defaultIdFactory(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Put a voice-over take on the Voice-over lane at `frame` (sound only). It covers only
 * that lane: an older voice-over under it is cut away there, nothing else moves or changes.
 */
export function placeVoiceTake(
  document: ProjectDocument,
  input: {
    readonly asset: Asset;
    readonly frame: Frame;
    readonly sourceIn?: Frame;
    readonly sourceOut?: Frame;
    readonly idFactory?: (prefix: string) => string;
  },
): ProjectDocument {
  const info = insertedMediaInfo(input.asset);
  if (info?.kind !== 'voice') throw new InsertedMediaError('Asset is not a voice-over take');
  const idFactory = input.idFactory ?? defaultIdFactory;
  const withAsset = canonicalizeProjectDocument(ensureVoiceTrack(addInsertedAsset(canonicalizeProjectDocument(document), input.asset)));
  const sourceDuration = Math.max(1, Math.round(input.asset.duration));
  const sourceIn = clampInt(input.sourceIn ?? 0, 0, sourceDuration - 1);
  const sourceOut = clampInt(input.sourceOut ?? sourceDuration, sourceIn + 1, sourceDuration);
  const start = Math.max(0, Math.round(Number(input.frame) || 0));
  const end = start + (sourceOut - sourceIn);
  const sourceId = insertedMediaSourceId(input.asset.id);
  const linkGroupId = insertedMediaLinkGroupId(input.asset.id);
  const clip: TimelineClip = {
    id: idFactory(`clip-voice-${input.asset.id}`),
    mediaId: sourceId,
    trackId: VOICE_OVER_TRACK_ID,
    linkGroupId,
    timelineIn: start,
    timelineOut: end,
    sourceIn,
    sourceOut,
  };
  const tracks = withAsset.timeline.tracks.map((track) => (track.id === VOICE_OVER_TRACK_ID
    ? { ...track, clips: sortClips([...clearTrackRange(track.clips, start, end, idFactory), clip]) }
    : track));
  return canonicalizeProjectDocument({
    ...withAsset,
    timeline: {
      ...withAsset.timeline,
      linkedGroups: upsertLinkedGroup(withAsset.timeline.linkedGroups, {
        id: linkGroupId,
        kind: 'manual-sync',
        sourceIds: [sourceId],
        primarySourceId: sourceId,
        syncPolicy: 'frame-locked',
      }),
      tracks,
    },
  });
}

/** Switch a voice-over take between replacing the recording's sound and playing over it. */
export function setVoiceOverMode(
  document: ProjectDocument,
  input: { readonly clipId: string; readonly mode: VoiceOverMode },
): ProjectDocument {
  const view = listInsertedClips(document).find((item) => item.clipId === input.clipId);
  if (!view || view.kind !== 'voice' || view.voiceMode === input.mode) return document;
  return {
    ...document,
    assets: document.assets.map((asset) => {
      if (asset.id !== view.assetId) return asset;
      const raw = (asset.metadata?.['insertedMedia'] ?? {}) as Record<string, unknown>;
      return { ...asset, metadata: { ...asset.metadata, insertedMedia: { ...raw, voiceMode: input.mode } } };
    }),
  };
}

/** Timeline spans where a voice-over replaces the recording's sound. */
export function voiceOverReplaceRanges(document: ProjectDocument | null | undefined): Array<readonly [Frame, Frame]> {
  return listInsertedClips(document)
    .filter((clip) => clip.kind === 'voice' && clip.voiceMode === 'replace')
    .map((clip) => [clip.timelineIn, clip.timelineOut] as const);
}

function ensureVoiceTrack(document: ProjectDocument): ProjectDocument {
  const tracks = document.timeline.tracks;
  if (tracks.some((track) => track.id === VOICE_OVER_TRACK_ID)) return document;
  const nextIndex = Math.max(-1, ...tracks.map((track) => track.index)) + 1;
  const track: TimelineTrack = { id: VOICE_OVER_TRACK_ID, kind: 'audio', index: nextIndex, label: 'Voice-over', enabled: true, locked: false, muted: false, clips: [] };
  return { ...document, timeline: { ...document.timeline, tracks: [...tracks, track] } };
}

/** Split every inserted clip (picture and sound together) that crosses timeline frame `frame`. */
export function splitInsertedClipsAt(
  document: ProjectDocument,
  input: { readonly frame: Frame; readonly idFactory?: (prefix: string) => string },
): ProjectDocument {
  const canonical = canonicalizeProjectDocument(document);
  const frame = Math.round(Number(input.frame));
  if (!Number.isFinite(frame)) return document;
  const insertedSources = insertedMediaSourceIds(canonical);
  const idFactory = input.idFactory ?? defaultIdFactory;
  let changed = false;
  const tracks = canonical.timeline.tracks.map((track) => ({
    ...track,
    clips: sortClips(track.clips.flatMap((clip) => {
      if (!insertedSources.has(clip.mediaId) || frame <= clip.timelineIn || frame >= clip.timelineOut) return [clip];
      changed = true;
      return splitAt(clip, frame, idFactory);
    })),
  }));
  return changed ? canonicalizeProjectDocument({ ...canonical, timeline: { ...canonical.timeline, tracks } }) : document;
}
