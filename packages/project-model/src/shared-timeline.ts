import type { NleClipSource, NleTrack, NleTrackClip, NleTrackKind } from './track.js';
import { createNleTracksFromComposition } from './track.js';
import type { Asset, AssetId, ExportSettings, Frame, ProjectDocument, RecordingPresentation } from './types.js';

export type TimelineSourceKind =
  | 'screen'
  | 'camera'
  | 'mic-audio'
  | 'system-audio'
  | 'cursor-telemetry'
  | 'project-asset'
  | 'generated-asset';

export type TimelineSourceMediaType = 'video' | 'audio' | 'telemetry' | 'data';

export interface MediaReference {
  readonly id: string;
  readonly kind: TimelineSourceKind;
  readonly mediaType: TimelineSourceMediaType;
  readonly assetId?: AssetId;
  readonly label: string;
  readonly duration: Frame;
}

export type TimelineSource = MediaReference;

export type TimelineLinkedGroupKind = 'recording' | 'generated-set' | 'manual-sync';

export interface TimelineLinkedGroup {
  readonly id: string;
  readonly kind: TimelineLinkedGroupKind;
  readonly sourceIds: readonly string[];
  readonly primarySourceId: string;
  readonly syncPolicy: 'frame-locked' | 'manual-offset';
}

export type TimelineMarkerKind =
  | 'zoom'
  | 'cut'
  | 'click'
  | 'cursor-style'
  | 'camera-layout'
  | 'annotation';

export interface TimelineMarker {
  readonly id: string;
  readonly kind: TimelineMarkerKind;
  readonly startFrame: Frame;
  readonly endFrame: Frame;
  readonly sourceId?: string;
  readonly linkedGroupId?: string;
  readonly params: Record<string, unknown>;
}

export type TimelineEffectKind = 'cursor' | 'click' | 'camera-pip' | 'zoom' | 'annotation';

export interface TimelineEffect {
  readonly id: string;
  readonly kind: TimelineEffectKind;
  readonly ownerId: string;
  readonly ownerType: 'clip' | 'track' | 'source' | 'linked-group' | 'timeline';
  readonly startFrame?: Frame;
  readonly endFrame?: Frame;
  readonly enabled: boolean;
  readonly params: Record<string, unknown>;
}

export interface TimelineClip {
  readonly id: string;
  readonly mediaId: string;
  readonly trackId: string;
  readonly linkGroupId?: string;
  readonly timelineIn: Frame;
  readonly timelineOut: Frame;
  readonly sourceIn: Frame;
  readonly sourceOut: Frame;
  /** Transitional import adapter for existing NLE code. Do not use as canonical truth. */
  readonly source?: NleClipSource;
}

export interface TimelineTrack {
  readonly id: string;
  readonly kind: NleTrackKind;
  readonly index: number;
  readonly label: string;
  readonly enabled: boolean;
  readonly locked: boolean;
  readonly muted: boolean;
  readonly clips: readonly TimelineClip[];
}

export interface Timeline {
  readonly sources: readonly MediaReference[];
  readonly linkedGroups: readonly TimelineLinkedGroup[];
  readonly tracks: readonly TimelineTrack[];
  readonly markers: readonly TimelineMarker[];
  readonly effects: readonly TimelineEffect[];
  readonly exportSettings: ExportSettings;
}

export type SharedTimeline = Timeline;

export interface SharedTimelineInput {
  readonly assets: readonly Asset[];
  readonly tracks: readonly NleTrack[];
  readonly exportSettings: ExportSettings;
}

export function createSharedTimeline(input: SharedTimelineInput): SharedTimeline {
  const sources = input.assets.flatMap((asset) => timelineSourcesForAsset(asset));
  const linkedGroups = recordingLinkedGroups(sources);

  return {
    sources,
    linkedGroups,
    tracks: canonicalTimelineTracks(input.tracks, sources, linkedGroups),
    markers: input.assets.flatMap((asset) => timelineMarkersForAsset(asset)),
    effects: input.assets.flatMap((asset) => timelineEffectsForAsset(asset)),
    exportSettings: input.exportSettings,
  };
}

export function canonicalizeProjectDocument(document: ProjectDocument): ProjectDocument {
  const baseTimeline = createSharedTimeline({
    assets: document.assets ?? [],
    tracks: [],
    exportSettings: document.exportSettings,
  });
  const rawTimeline: Record<string, unknown> = isRecord(document.timeline) ? document.timeline : {};
  const sources = mergeById(baseTimeline.sources, arrayFrom(rawTimeline['sources']) as MediaReference[]);
  const linkedGroups = mergeById(
    baseTimeline.linkedGroups,
    arrayFrom(rawTimeline['linkedGroups']) as TimelineLinkedGroup[],
  );
  const rawTimelineTracks = arrayFrom(rawTimeline['tracks']);
  const importTracks = rawTimelineTracks.length > 0
    ? canonicalTimelineTracksFromUnknown(rawTimelineTracks, sources, linkedGroups)
    : canonicalTimelineTracks(importNleTracksForDocument(document), sources, linkedGroups);
  const timeline: Timeline = {
    sources,
    linkedGroups,
    tracks: importTracks,
    markers: mergeById(baseTimeline.markers, arrayFrom(rawTimeline['markers']) as TimelineMarker[]),
    effects: mergeById(baseTimeline.effects, arrayFrom(rawTimeline['effects']) as TimelineEffect[]),
    exportSettings: document.exportSettings,
  };

  return {
    ...document,
    timeline: assertTimelineInvariants(timeline),
  };
}

export interface TimelineInvariantIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export function computeTimelineDuration(timeline: Pick<Timeline, 'tracks' | 'markers' | 'effects'>): Frame {
  let duration = 0;
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      duration = Math.max(duration, clip.timelineOut);
    }
  }
  for (const marker of timeline.markers) {
    duration = Math.max(duration, marker.endFrame);
  }
  for (const effect of timeline.effects) {
    if (typeof effect.endFrame === 'number') {
      duration = Math.max(duration, effect.endFrame);
    }
  }
  return duration;
}

export function collectTimelineInvariantIssues(timeline: Timeline): TimelineInvariantIssue[] {
  const issues: TimelineInvariantIssue[] = [];
  const mediaIds = new Set(timeline.sources.map((source) => source.id));
  const linkedGroupIds = new Set(timeline.linkedGroups.map((group) => group.id));
  const trackIds = new Set(timeline.tracks.map((track) => track.id));
  const clipIds = new Set<string>();

  timeline.linkedGroups.forEach((group, groupIndex) => {
    if (!mediaIds.has(group.primarySourceId)) {
      issues.push({ path: ['linkedGroups', groupIndex, 'primarySourceId'], message: 'Linked group primarySourceId must reference a media reference' });
    }
    group.sourceIds.forEach((sourceId, sourceIndex) => {
      if (!mediaIds.has(sourceId)) {
        issues.push({ path: ['linkedGroups', groupIndex, 'sourceIds', sourceIndex], message: 'Linked group sourceIds must reference media references' });
      }
    });
  });

  timeline.tracks.forEach((track, trackIndex) => {
    let previousTimelineOut = -1;
    track.clips.forEach((clip, clipIndex) => {
      clipIds.add(clip.id);
      if (clip.trackId !== track.id) {
        issues.push({ path: ['tracks', trackIndex, 'clips', clipIndex, 'trackId'], message: 'Clip trackId must match its containing track' });
      }
      if (!mediaIds.has(clip.mediaId)) {
        issues.push({ path: ['tracks', trackIndex, 'clips', clipIndex, 'mediaId'], message: 'Clip mediaId must reference a media reference' });
      }
      if (clip.linkGroupId && !linkedGroupIds.has(clip.linkGroupId)) {
        issues.push({ path: ['tracks', trackIndex, 'clips', clipIndex, 'linkGroupId'], message: 'Clip linkGroupId must reference a linked group' });
      }
      if (clip.timelineOut <= clip.timelineIn) {
        issues.push({ path: ['tracks', trackIndex, 'clips', clipIndex, 'timelineOut'], message: 'Clip timelineOut must be greater than timelineIn' });
      }
      if (clip.sourceOut <= clip.sourceIn) {
        issues.push({ path: ['tracks', trackIndex, 'clips', clipIndex, 'sourceOut'], message: 'Clip sourceOut must be greater than sourceIn' });
      }
      if (clip.timelineOut - clip.timelineIn !== clip.sourceOut - clip.sourceIn) {
        issues.push({ path: ['tracks', trackIndex, 'clips', clipIndex, 'timelineOut'], message: 'Clip duration must match source duration until retiming exists' });
      }
      const media = timeline.sources.find((source) => source.id === clip.mediaId);
      if (media && clip.sourceOut > media.duration) {
        issues.push({ path: ['tracks', trackIndex, 'clips', clipIndex, 'sourceOut'], message: 'Clip sourceOut must not exceed media duration' });
      }
      if (clip.timelineIn < previousTimelineOut) {
        issues.push({ path: ['tracks', trackIndex, 'clips', clipIndex, 'timelineIn'], message: 'Clips on the same track must be sorted and non-overlapping' });
      }
      previousTimelineOut = Math.max(previousTimelineOut, clip.timelineOut);
    });
  });

  timeline.markers.forEach((marker, markerIndex) => {
    if (marker.endFrame <= marker.startFrame) {
      issues.push({ path: ['markers', markerIndex, 'endFrame'], message: 'Marker endFrame must be greater than startFrame' });
    }
    if (marker.sourceId && !mediaIds.has(marker.sourceId)) {
      issues.push({ path: ['markers', markerIndex, 'sourceId'], message: 'Marker sourceId must reference a media reference' });
    }
    if (marker.linkedGroupId && !linkedGroupIds.has(marker.linkedGroupId)) {
      issues.push({ path: ['markers', markerIndex, 'linkedGroupId'], message: 'Marker linkedGroupId must reference a linked group' });
    }
  });

  timeline.effects.forEach((effect, effectIndex) => {
    const ownerExists = effect.ownerType === 'timeline'
      || (effect.ownerType === 'clip' && clipIds.has(effect.ownerId))
      || (effect.ownerType === 'track' && trackIds.has(effect.ownerId))
      || (effect.ownerType === 'source' && mediaIds.has(effect.ownerId))
      || (effect.ownerType === 'linked-group' && linkedGroupIds.has(effect.ownerId));
    if (!ownerExists) {
      issues.push({ path: ['effects', effectIndex, 'ownerId'], message: 'Effect ownerId must reference its declared owner type' });
    }
    if ((effect.startFrame === undefined) !== (effect.endFrame === undefined)) {
      issues.push({ path: ['effects', effectIndex, 'startFrame'], message: 'Timeline effects must define both startFrame and endFrame or neither' });
    }
    if (effect.startFrame !== undefined && effect.endFrame !== undefined && effect.endFrame <= effect.startFrame) {
      issues.push({ path: ['effects', effectIndex, 'endFrame'], message: 'Effect endFrame must be greater than startFrame' });
    }
  });

  return issues;
}

export function assertTimelineInvariants(timeline: Timeline): Timeline {
  const issues = collectTimelineInvariantIssues(timeline);
  if (issues.length > 0) {
    throw new Error(`Invalid timeline: ${issues.map((issue) => issue.message).join('; ')}`);
  }
  return timeline;
}

function canonicalTimelineTracks(
  tracks: readonly NleTrack[],
  sources: readonly MediaReference[],
  linkedGroups: readonly TimelineLinkedGroup[],
): TimelineTrack[] {
  return tracks.map((track) => ({
    id: track.id,
    kind: track.kind,
    index: track.index,
    label: track.label,
    enabled: track.enabled,
    locked: track.locked,
    muted: track.muted,
    clips: track.clips
      .map((clip) => canonicalTimelineClip(clip, track, sources, linkedGroups))
      .sort((a, b) => a.timelineIn - b.timelineIn || a.timelineOut - b.timelineOut || a.id.localeCompare(b.id)),
  }));
}

function canonicalTimelineTracksFromUnknown(
  tracks: readonly unknown[],
  sources: readonly MediaReference[],
  linkedGroups: readonly TimelineLinkedGroup[],
): TimelineTrack[] {
  return tracks.flatMap((track) => {
    if (!isRecord(track)) return [];
    const id = stringValue(track['id']);
    const kind = nleTrackKindValue(track['kind']) ?? nleTrackKindValue(track['type']);
    if (!id || !kind) return [];
    const label = stringValue(track['label']) ?? stringValue(track['name']) ?? id;
    const clips = arrayFrom(track['clips'])
      .flatMap((clip) => canonicalTimelineClipFromUnknown(clip, id, kind, sources, linkedGroups))
      .sort((a, b) => a.timelineIn - b.timelineIn || a.timelineOut - b.timelineOut || a.id.localeCompare(b.id));
    return [{
      id,
      kind,
      index: nonNegativeIntValue(track['index']) ?? 0,
      label,
      enabled: booleanValue(track['enabled']) ?? booleanValue(track['visible']) ?? true,
      locked: booleanValue(track['locked']) ?? false,
      muted: booleanValue(track['muted']) ?? false,
      clips,
    }];
  });
}

function canonicalTimelineClipFromUnknown(
  clip: unknown,
  trackId: string,
  trackKind: NleTrackKind,
  sources: readonly MediaReference[],
  linkedGroups: readonly TimelineLinkedGroup[],
): TimelineClip[] {
  if (!isRecord(clip)) return [];
  const id = stringValue(clip['id']);
  if (!id) return [];
  const source = nleClipSourceFromUnknown(clip['source']);
  const mediaId = stringValue(clip['mediaId']) ?? mediaIdForSourceId(source?.id ?? stringValue(clip['assetId']) ?? id, trackKind, sources);
  const linkGroupId = stringValue(clip['linkGroupId']) ?? linkedGroups.find((group) => group.sourceIds.includes(mediaId))?.id;
  const timelineIn = nonNegativeIntValue(clip['timelineIn']) ?? 0;
  const timelineOut = nonNegativeIntValue(clip['timelineOut']) ?? timelineIn;
  const sourceIn = nonNegativeIntValue(clip['sourceIn']) ?? 0;
  const sourceOut = nonNegativeIntValue(clip['sourceOut']) ?? sourceIn + Math.max(0, timelineOut - timelineIn);
  return [{
    id,
    mediaId,
    trackId: stringValue(clip['trackId']) ?? trackId,
    ...(linkGroupId ? { linkGroupId } : {}),
    timelineIn,
    timelineOut,
    sourceIn,
    sourceOut,
    ...(source ? { source } : {}),
  }];
}

function canonicalTimelineClip(
  clip: NleTrackClip,
  track: NleTrack,
  sources: readonly MediaReference[],
  linkedGroups: readonly TimelineLinkedGroup[],
): TimelineClip {
  const mediaId = mediaIdForClip(clip, track, sources);
  const linkGroupId = linkedGroups.find((group) => group.sourceIds.includes(mediaId))?.id;
  return {
    id: clip.id,
    mediaId,
    trackId: track.id,
    ...(linkGroupId ? { linkGroupId } : {}),
    timelineIn: clip.timelineIn,
    timelineOut: clip.timelineOut,
    sourceIn: clip.sourceIn,
    sourceOut: clip.sourceOut,
    source: clip.source,
  };
}

function mediaIdForClip(
  clip: NleTrackClip,
  track: NleTrack,
  sources: readonly MediaReference[],
): string {
  return mediaIdForSourceId(clip.source.id, track.kind, sources);
}

function mediaIdForSourceId(
  sourceId: string,
  trackKind: NleTrackKind,
  sources: readonly MediaReference[],
): string {
  const matchingCameraSource = trackKind === 'video'
    ? sources.find((source) => source.assetId === sourceId && source.kind === 'camera')
    : undefined;
  if (matchingCameraSource) return matchingCameraSource.id;

  const matchingAssetSource = sources.find((source) => {
    if (source.assetId !== sourceId) return false;
    if (trackKind === 'audio') return source.mediaType === 'audio';
    if (trackKind === 'video') return source.mediaType === 'video';
    return true;
  });
  if (matchingAssetSource) return matchingAssetSource.id;

  const candidates = trackKind === 'audio'
    ? [`source:${sourceId}:system-audio`, `source:${sourceId}:mic-audio`, `source:${sourceId}`]
    : [`source:${sourceId}:screen`, `source:${sourceId}:camera`, `source:${sourceId}`];
  return candidates.find((candidate) => sources.some((source) => source.id === candidate)) ?? `source:${sourceId}`;
}

function importNleTracksForDocument(document: ProjectDocument): NleTrack[] {
  if (Array.isArray(document.tracks)) return [...document.tracks];
  return createNleTracksFromComposition(document.composition ?? { tracks: [] });
}

function mergeById<T extends { readonly id: string }>(base: readonly T[], override: readonly T[]): T[] {
  const merged = new Map<string, T>();
  for (const item of base) merged.set(item.id, item);
  for (const item of override) {
    if (isRecord(item) && typeof item.id === 'string') merged.set(item.id, item);
  }
  return Array.from(merged.values());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function arrayFrom(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function nonNegativeIntValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function nleTrackKindValue(value: unknown): NleTrackKind | undefined {
  return value === 'video' || value === 'audio' || value === 'captions' || value === 'motion-graphics'
    ? value
    : undefined;
}

function nleClipSourceFromUnknown(value: unknown): NleClipSource | undefined {
  if (!isRecord(value)) return undefined;
  const kind = value['kind'];
  const id = stringValue(value['id']);
  if (!id || (kind !== 'project-asset' && kind !== 'ai-asset')) return undefined;
  return { kind, id };
}

function timelineSourcesForAsset(asset: Asset): TimelineSource[] {
  if (asset.type !== 'recording') {
    return [
      {
        id: `source:${asset.id}`,
        kind: asset.type === 'motion' ? 'generated-asset' : 'project-asset',
        mediaType: asset.type === 'audio' ? 'audio' : 'video',
        assetId: asset.id,
        label: asset.filePath.split(/[\\/]/).pop() || asset.filePath,
        duration: asset.duration,
      },
    ];
  }

  const sources: TimelineSource[] = [
    {
      id: `source:${asset.id}:screen`,
      kind: 'screen',
      mediaType: 'video',
      assetId: asset.id,
      label: 'Screen',
      duration: asset.duration,
    },
    {
      id: `source:${asset.id}:cursor`,
      kind: 'cursor-telemetry',
      mediaType: 'telemetry',
      assetId: asset.id,
      label: 'Cursor telemetry',
      duration: asset.duration,
    },
    {
      id: `source:${asset.id}:system-audio`,
      kind: 'system-audio',
      mediaType: 'audio',
      assetId: asset.id,
      label: 'System audio',
      duration: asset.duration,
    },
    {
      id: `source:${asset.id}:mic-audio`,
      kind: 'mic-audio',
      mediaType: 'audio',
      assetId: asset.id,
      label: 'Mic audio',
      duration: asset.duration,
    },
  ];

  if (asset.cameraAssetId) {
    sources.push({
      id: `source:${asset.id}:camera`,
      kind: 'camera',
      mediaType: 'video',
      assetId: asset.cameraAssetId as AssetId,
      label: 'Camera',
      duration: asset.duration,
    });
  }

  return sources;
}

function recordingLinkedGroups(sources: readonly TimelineSource[]): TimelineLinkedGroup[] {
  const byRecording = new Map<string, TimelineSource[]>();
  for (const source of sources) {
    const match = /^source:([^:]+):/.exec(source.id);
    const assetId = match?.[1];
    if (!assetId) continue;
    const group = byRecording.get(assetId) ?? [];
    group.push(source);
    byRecording.set(assetId, group);
  }

  return Array.from(byRecording.entries()).map(([assetId, groupSources]) => ({
    id: `linked:${assetId}`,
    kind: 'recording' as const,
    sourceIds: groupSources.map((source) => source.id),
    primarySourceId: `source:${assetId}:screen`,
    syncPolicy: 'frame-locked' as const,
  }));
}

function timelineMarkersForAsset(asset: Asset): TimelineMarker[] {
  const presentation = asset.presentation;
  if (!presentation) return [];

  const linkedGroupId = `linked:${asset.id}`;
  const zoom = presentation.zoom.markers.map((marker) => ({
    id: marker.id,
    kind: 'zoom' as const,
    startFrame: marker.startFrame,
    endFrame: marker.endFrame,
    linkedGroupId,
    params: { marker },
  }));
  const cameraLayouts = (presentation.cameraLayouts ?? []).map((marker) => ({
    id: marker.id,
    kind: 'camera-layout' as const,
    startFrame: marker.frame,
    endFrame: marker.frame + 1,
    linkedGroupId,
    params: { marker },
  }));
  const cuts = (presentation.cutRanges ?? []).map((range) => ({
    id: range.id,
    kind: 'cut' as const,
    startFrame: range.startFrame,
    endFrame: range.endFrame,
    linkedGroupId,
    params: { range },
  }));

  return [...zoom, ...cuts, ...cameraLayouts];
}

function timelineEffectsForAsset(asset: Asset): TimelineEffect[] {
  const presentation: RecordingPresentation | undefined = asset.presentation;
  if (!presentation) return [];
  const linkedGroupId = `linked:${asset.id}`;

  const effects: TimelineEffect[] = [];

  if (presentation.cursor) {
    effects.push({
      id: `effect:${asset.id}:cursor`,
      kind: 'cursor',
      ownerId: linkedGroupId,
      ownerType: 'linked-group',
      enabled: true,
      params: { ...presentation.cursor },
    });
    effects.push({
      id: `effect:${asset.id}:click`,
      kind: 'click',
      ownerId: linkedGroupId,
      ownerType: 'linked-group',
      enabled: presentation.cursor.clickEffect !== 'none',
      params: { clickEffect: presentation.cursor.clickEffect },
    });
  }

  if (presentation.camera) {
    effects.push({
      id: `effect:${asset.id}:camera-pip`,
      kind: 'camera-pip',
      ownerId: linkedGroupId,
      ownerType: 'linked-group',
      enabled: presentation.camera.visible,
      params: { ...presentation.camera },
    });
  }

  return effects;
}
