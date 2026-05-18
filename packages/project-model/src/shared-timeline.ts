import type { NleTrack } from './track.js';
import type { Asset, AssetId, ExportSettings, Frame, RecordingPresentation } from './types.js';

export type TimelineSourceKind =
  | 'screen'
  | 'camera'
  | 'mic-audio'
  | 'system-audio'
  | 'cursor-telemetry'
  | 'project-asset'
  | 'generated-asset';

export type TimelineSourceMediaType = 'video' | 'audio' | 'telemetry' | 'data';

export interface TimelineSource {
  readonly id: string;
  readonly kind: TimelineSourceKind;
  readonly mediaType: TimelineSourceMediaType;
  readonly assetId?: AssetId;
  readonly label: string;
  readonly duration: Frame;
}

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
  readonly enabled: boolean;
  readonly params: Record<string, unknown>;
}

export interface SharedTimeline {
  readonly sources: readonly TimelineSource[];
  readonly linkedGroups: readonly TimelineLinkedGroup[];
  readonly tracks: readonly NleTrack[];
  readonly markers: readonly TimelineMarker[];
  readonly effects: readonly TimelineEffect[];
  readonly exportSettings: ExportSettings;
}

export interface SharedTimelineInput {
  readonly assets: readonly Asset[];
  readonly tracks: readonly NleTrack[];
  readonly exportSettings: ExportSettings;
}

export function createSharedTimeline(input: SharedTimelineInput): SharedTimeline {
  const sources = input.assets.flatMap((asset) => timelineSourcesForAsset(asset));

  return {
    sources,
    linkedGroups: recordingLinkedGroups(sources),
    tracks: input.tracks,
    markers: input.assets.flatMap((asset) => timelineMarkersForAsset(asset)),
    effects: input.assets.flatMap((asset) => timelineEffectsForAsset(asset)),
    exportSettings: input.exportSettings,
  };
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

  return [...zoom, ...cameraLayouts];
}

function timelineEffectsForAsset(asset: Asset): TimelineEffect[] {
  const presentation: RecordingPresentation | undefined = asset.presentation;
  if (!presentation) return [];
  const linkedGroupId = `linked:${asset.id}`;

  return [
    {
      id: `effect:${asset.id}:cursor`,
      kind: 'cursor',
      ownerId: linkedGroupId,
      ownerType: 'linked-group',
      enabled: true,
      params: { ...presentation.cursor },
    },
    {
      id: `effect:${asset.id}:click`,
      kind: 'click',
      ownerId: linkedGroupId,
      ownerType: 'linked-group',
      enabled: presentation.cursor.clickEffect !== 'none',
      params: { clickEffect: presentation.cursor.clickEffect },
    },
    {
      id: `effect:${asset.id}:camera-pip`,
      kind: 'camera-pip',
      ownerId: linkedGroupId,
      ownerType: 'linked-group',
      enabled: presentation.camera.visible,
      params: { ...presentation.camera },
    },
  ];
}
