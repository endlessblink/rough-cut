import { computeTimelineDuration } from '@rough-cut/project-model';
import type {
  ProjectDocument,
  TimelineClip,
  TimelineEffect,
  TimelineMarker,
  TimelineTrack,
} from '@rough-cut/project-model';
import type {
  ResolvedTimelineClip,
  ResolvedTimelineFrame,
  ResolvedTimelineLinkedGroup,
} from './types.js';

export function resolveTimelineFrame(
  project: ProjectDocument,
  timelineFrame: number,
): ResolvedTimelineFrame {
  const frame = Math.round(Number(timelineFrame));
  const timeline = project.timeline;
  const duration = computeTimelineDuration(timeline);
  const emptyFrame: ResolvedTimelineFrame = {
    frame: Number.isFinite(frame) ? frame : 0,
    duration,
    isGap: true,
    video: null,
    videoLayers: [],
    audio: [],
    activeClips: [],
    activeLinkedGroups: [],
    markers: [],
    effects: [],
  };

  if (!Number.isFinite(frame) || frame < 0) return emptyFrame;

  const activeClips = timeline.tracks.flatMap((track) => activeClipsForTrack(track, frame, project));
  const videoLayers = activeClips
    .filter((entry) => entry.track.kind === 'video' && entry.track.enabled)
    .sort((left, right) => left.track.index - right.track.index);
  const video = [...videoLayers].sort((left, right) => right.track.index - left.track.index)[0] ?? null;

  if (!video) return emptyFrame;

  const audio = activeClips
    .filter((entry) => entry.track.kind === 'audio' && entry.track.enabled && !entry.track.muted)
    .sort((left, right) => right.track.index - left.track.index);
  const markers = timeline.markers.filter((marker) => isMarkerActive(marker, frame));
  const effects = timeline.effects.filter((effect) => isEffectActive(effect, activeClips, frame));

  return {
    frame,
    duration,
    isGap: false,
    video,
    videoLayers,
    audio,
    activeClips,
    activeLinkedGroups: activeLinkedGroupsForClips(project, activeClips),
    markers,
    effects,
  };
}

function activeClipsForTrack(
  track: TimelineTrack,
  frame: number,
  project: ProjectDocument,
): ResolvedTimelineClip[] {
  if (!track.enabled) return [];
  return track.clips.flatMap((clip) => {
    if (!isClipActive(clip, frame)) return [];
    const media = project.timeline.sources.find((source) => source.id === clip.mediaId);
    if (!media) return [];
    return [{
      track,
      clip,
      media,
      sourceFrame: clip.sourceIn + (frame - clip.timelineIn),
    }];
  });
}

function isClipActive(clip: TimelineClip, frame: number): boolean {
  return frame >= clip.timelineIn && frame < clip.timelineOut;
}

function isMarkerActive(marker: TimelineMarker, frame: number): boolean {
  return frame >= marker.startFrame && frame < marker.endFrame;
}

function isEffectActive(
  effect: TimelineEffect,
  activeClips: readonly ResolvedTimelineClip[],
  frame: number,
): boolean {
  if (effect.startFrame !== undefined && effect.endFrame !== undefined) {
    if (frame < effect.startFrame || frame >= effect.endFrame) return false;
  }
  if (effect.ownerType === 'timeline') return true;
  return activeClips.some((entry) => {
    if (effect.ownerType === 'clip') return entry.clip.id === effect.ownerId;
    if (effect.ownerType === 'track') return entry.track.id === effect.ownerId;
    if (effect.ownerType === 'source') return entry.media.id === effect.ownerId;
    if (effect.ownerType === 'linked-group') return entry.clip.linkGroupId === effect.ownerId;
    return false;
  });
}

function activeLinkedGroupsForClips(
  project: ProjectDocument,
  activeClips: readonly ResolvedTimelineClip[],
): ResolvedTimelineLinkedGroup[] {
  return project.timeline.linkedGroups.flatMap((group) => {
    const clips = activeClips.filter((entry) => entry.clip.linkGroupId === group.id);
    return clips.length > 0 ? [{ group, clips }] : [];
  });
}
