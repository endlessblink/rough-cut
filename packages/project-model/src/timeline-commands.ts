import {
  assertTimelineInvariants,
  canonicalizeProjectDocument,
  type Timeline,
  type TimelineClip,
  type TimelineTrack,
} from './shared-timeline.js';
import type { ProjectDocument } from './types.js';

export type TimelineCommandType =
  | 'trimClipEdge'
  | 'moveClip'
  | 'splitClip'
  | 'deleteClip'
  | 'rippleDeleteRange'
  | 'restoreSourceEdge'
  | 'restoreFullSource';

export type TimelineTrimEdge = 'head' | 'tail' | 'left' | 'right';
export type TimelineDeleteMode = 'leave-gap' | 'ripple';

export interface TimelineCommandResult {
  readonly document: ProjectDocument;
  readonly undoSnapshot: {
    readonly type: TimelineCommandType;
    readonly before: Timeline;
    readonly after: Timeline;
  };
}

export interface TimelineCommandIdOptions {
  readonly idFactory?: (prefix: string) => string;
}

export class TimelineCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimelineCommandError';
  }
}

export function trimClipEdge(
  document: ProjectDocument,
  input: { readonly clipId: string; readonly edge: TimelineTrimEdge; readonly frame: number },
): TimelineCommandResult {
  const canonical = canonicalizeProjectDocument(document);
  const loc = findClipLocation(canonical.timeline, input.clipId);
  if (!loc) throw new TimelineCommandError(`Clip not found: ${input.clipId}`);
  const frame = finiteInteger(input.frame, 'frame');
  const edge = normalizeTrimEdge(input.edge);
  const linked = linkedLocations(canonical.timeline, loc.clip);
  const delta = edge === 'head' ? frame - loc.clip.timelineIn : frame - loc.clip.timelineOut;
  if (delta === 0) throw new TimelineCommandError('Trim would not change the clip');

  const nextTimeline = updateClips(canonical.timeline, linked, (clip) => {
    if (edge === 'head') {
      return { ...clip, timelineIn: clip.timelineIn + delta, sourceIn: clip.sourceIn + delta };
    }
    return { ...clip, timelineOut: clip.timelineOut + delta, sourceOut: clip.sourceOut + delta };
  });

  return commitCommand(canonical, 'trimClipEdge', nextTimeline);
}

export function moveClip(
  document: ProjectDocument,
  input: { readonly clipId: string; readonly timelineIn: number },
): TimelineCommandResult {
  const canonical = canonicalizeProjectDocument(document);
  const loc = findClipLocation(canonical.timeline, input.clipId);
  if (!loc) throw new TimelineCommandError(`Clip not found: ${input.clipId}`);
  const nextIn = finiteInteger(input.timelineIn, 'timelineIn');
  const delta = nextIn - loc.clip.timelineIn;
  if (delta === 0) throw new TimelineCommandError('Move would not change the clip');
  const linked = linkedLocations(canonical.timeline, loc.clip);
  const nextTimeline = updateClips(canonical.timeline, linked, (clip) => ({
    ...clip,
    timelineIn: clip.timelineIn + delta,
    timelineOut: clip.timelineOut + delta,
  }));

  return commitCommand(canonical, 'moveClip', nextTimeline);
}

export function splitClip(
  document: ProjectDocument,
  input: { readonly clipId: string; readonly frame: number } & TimelineCommandIdOptions,
): TimelineCommandResult {
  const canonical = canonicalizeProjectDocument(document);
  const loc = findClipLocation(canonical.timeline, input.clipId);
  if (!loc) throw new TimelineCommandError(`Clip not found: ${input.clipId}`);
  const frame = finiteInteger(input.frame, 'frame');
  const linked = linkedLocations(canonical.timeline, loc.clip)
    .filter((entry) => frame > entry.clip.timelineIn && frame < entry.clip.timelineOut);
  if (linked.length === 0) throw new TimelineCommandError('Split frame must be inside at least one linked clip');
  const idFactory = input.idFactory ?? defaultIdFactory;

  const nextTimeline = replaceClips(canonical.timeline, linked, (clip) => {
    const sourceSplit = clip.sourceIn + (frame - clip.timelineIn);
    return [
      { ...clip, id: idFactory('clip-l'), timelineOut: frame, sourceOut: sourceSplit },
      { ...clip, id: idFactory('clip-r'), timelineIn: frame, sourceIn: sourceSplit },
    ];
  });

  return commitCommand(canonical, 'splitClip', nextTimeline);
}

export function deleteClip(
  document: ProjectDocument,
  input: { readonly clipId: string; readonly mode?: TimelineDeleteMode },
): TimelineCommandResult {
  const canonical = canonicalizeProjectDocument(document);
  const loc = findClipLocation(canonical.timeline, input.clipId);
  if (!loc) throw new TimelineCommandError(`Clip not found: ${input.clipId}`);
  if (input.mode === 'ripple') {
    return rippleDeleteRange(canonical, {
      startFrame: loc.clip.timelineIn,
      endFrame: loc.clip.timelineOut,
      linkGroupId: loc.clip.linkGroupId,
    });
  }
  const linked = linkedLocations(canonical.timeline, loc.clip);
  const nextTimeline = removeClips(canonical.timeline, linked);
  return commitCommand(canonical, 'deleteClip', nextTimeline);
}

export function rippleDeleteRange(
  document: ProjectDocument,
  input: { readonly startFrame: number; readonly endFrame: number; readonly linkGroupId?: string },
): TimelineCommandResult {
  const canonical = canonicalizeProjectDocument(document);
  const startFrame = finiteInteger(input.startFrame, 'startFrame');
  const endFrame = finiteInteger(input.endFrame, 'endFrame');
  if (endFrame <= startFrame) throw new TimelineCommandError('Ripple delete range must be positive');
  const duration = endFrame - startFrame;
  const nextTracks = canonical.timeline.tracks.map((track) => ({
    ...track,
    clips: track.clips.flatMap((clip) => {
      if (input.linkGroupId && clip.linkGroupId !== input.linkGroupId) return [clip];
      if (clip.timelineOut <= startFrame) return [clip];
      if (clip.timelineIn >= endFrame) {
        return [{ ...clip, timelineIn: clip.timelineIn - duration, timelineOut: clip.timelineOut - duration }];
      }
      if (clip.timelineIn >= startFrame && clip.timelineOut <= endFrame) return [];
      throw new TimelineCommandError('Ripple delete range must align to whole clips for now');
    }),
  }));

  return commitCommand(canonical, 'rippleDeleteRange', { ...canonical.timeline, tracks: nextTracks });
}

export function restoreSourceEdge(
  document: ProjectDocument,
  input: { readonly clipId: string; readonly edge: TimelineTrimEdge },
): TimelineCommandResult {
  const canonical = canonicalizeProjectDocument(document);
  const loc = findClipLocation(canonical.timeline, input.clipId);
  if (!loc) throw new TimelineCommandError(`Clip not found: ${input.clipId}`);
  const edge = normalizeTrimEdge(input.edge);
  const linked = linkedLocations(canonical.timeline, loc.clip);
  const nextTimeline = updateClips(canonical.timeline, linked, (clip) => {
    const media = canonical.timeline.sources.find((source) => source.id === clip.mediaId);
    if (!media) return clip;
    if (edge === 'head') {
      return { ...clip, timelineIn: clip.timelineIn - clip.sourceIn, sourceIn: 0 };
    }
    return { ...clip, timelineOut: clip.timelineOut + (media.duration - clip.sourceOut), sourceOut: media.duration };
  });

  return commitCommand(canonical, 'restoreSourceEdge', nextTimeline);
}

export function restoreFullSource(
  document: ProjectDocument,
  input: { readonly clipId: string },
): TimelineCommandResult {
  const canonical = canonicalizeProjectDocument(document);
  const loc = findClipLocation(canonical.timeline, input.clipId);
  if (!loc) throw new TimelineCommandError(`Clip not found: ${input.clipId}`);
  const linked = linkedLocations(canonical.timeline, loc.clip);
  const nextTimeline = updateClips(canonical.timeline, linked, (clip) => {
    const media = canonical.timeline.sources.find((source) => source.id === clip.mediaId);
    if (!media) return clip;
    return {
      ...clip,
      timelineIn: clip.timelineIn - clip.sourceIn,
      timelineOut: clip.timelineIn - clip.sourceIn + media.duration,
      sourceIn: 0,
      sourceOut: media.duration,
    };
  });

  return commitCommand(canonical, 'restoreFullSource', nextTimeline);
}

interface ClipLocation {
  readonly trackIndex: number;
  readonly clipIndex: number;
  readonly track: TimelineTrack;
  readonly clip: TimelineClip;
}

function commitCommand(
  document: ProjectDocument,
  type: TimelineCommandType,
  timeline: Timeline,
): TimelineCommandResult {
  try {
    assertTimelineInvariants(document.timeline);
  } catch (error) {
    throw new TimelineCommandError(error instanceof Error ? error.message : 'Timeline is invalid before command');
  }
  let after: Timeline;
  try {
    after = assertTimelineInvariants({
      ...timeline,
      tracks: timeline.tracks.map((track) => ({
        ...track,
        clips: [...track.clips].sort((a, b) => a.timelineIn - b.timelineIn || a.timelineOut - b.timelineOut || a.id.localeCompare(b.id)),
      })),
    });
  } catch (error) {
    throw new TimelineCommandError(error instanceof Error ? error.message : 'Timeline is invalid after command');
  }
  return {
    document: { ...document, timeline: after },
    undoSnapshot: { type, before: document.timeline, after },
  };
}

function findClipLocation(timeline: Timeline, clipId: string): ClipLocation | null {
  for (let trackIndex = 0; trackIndex < timeline.tracks.length; trackIndex += 1) {
    const track = timeline.tracks[trackIndex]!;
    for (let clipIndex = 0; clipIndex < track.clips.length; clipIndex += 1) {
      const clip = track.clips[clipIndex]!;
      if (clip.id === clipId) return { trackIndex, clipIndex, track, clip };
    }
  }
  return null;
}

function linkedLocations(timeline: Timeline, clip: TimelineClip): ClipLocation[] {
  if (!clip.linkGroupId) {
    const loc = findClipLocation(timeline, clip.id);
    return loc ? [loc] : [];
  }
  const linked: ClipLocation[] = [];
  for (let trackIndex = 0; trackIndex < timeline.tracks.length; trackIndex += 1) {
    const track = timeline.tracks[trackIndex]!;
    for (let clipIndex = 0; clipIndex < track.clips.length; clipIndex += 1) {
      const current = track.clips[clipIndex]!;
      if (current.linkGroupId === clip.linkGroupId) linked.push({ trackIndex, clipIndex, track, clip: current });
    }
  }
  return linked;
}

function updateClips(
  timeline: Timeline,
  locations: readonly ClipLocation[],
  update: (clip: TimelineClip) => TimelineClip,
): Timeline {
  const updates = new Map(locations.map((loc) => [clipKey(loc), update(loc.clip)]));
  return {
    ...timeline,
    tracks: timeline.tracks.map((track, trackIndex) => ({
      ...track,
      clips: track.clips.map((clip, clipIndex) => updates.get(`${trackIndex}:${clipIndex}`) ?? clip),
    })),
  };
}

function replaceClips(
  timeline: Timeline,
  locations: readonly ClipLocation[],
  replace: (clip: TimelineClip) => readonly TimelineClip[],
): Timeline {
  const replacements = new Map(locations.map((loc) => [clipKey(loc), replace(loc.clip)]));
  return {
    ...timeline,
    tracks: timeline.tracks.map((track, trackIndex) => ({
      ...track,
      clips: track.clips.flatMap((clip, clipIndex) => replacements.get(`${trackIndex}:${clipIndex}`) ?? [clip]),
    })),
  };
}

function removeClips(timeline: Timeline, locations: readonly ClipLocation[]): Timeline {
  const removals = new Set(locations.map(clipKey));
  return {
    ...timeline,
    tracks: timeline.tracks.map((track, trackIndex) => ({
      ...track,
      clips: track.clips.filter((_clip, clipIndex) => !removals.has(`${trackIndex}:${clipIndex}`)),
    })),
  };
}

function clipKey(loc: Pick<ClipLocation, 'trackIndex' | 'clipIndex'>): string {
  return `${loc.trackIndex}:${loc.clipIndex}`;
}

function normalizeTrimEdge(edge: TimelineTrimEdge): 'head' | 'tail' {
  if (edge === 'head' || edge === 'left') return 'head';
  if (edge === 'tail' || edge === 'right') return 'tail';
  throw new TimelineCommandError(`Unsupported trim edge: ${edge}`);
}

function finiteInteger(value: number, label: string): number {
  const frame = Math.round(Number(value));
  if (!Number.isFinite(frame) || frame < 0) throw new TimelineCommandError(`${label} must be a non-negative frame`);
  return frame;
}

let generatedId = 0;
function defaultIdFactory(prefix: string): string {
  generatedId += 1;
  return `${prefix}-${generatedId}`;
}
