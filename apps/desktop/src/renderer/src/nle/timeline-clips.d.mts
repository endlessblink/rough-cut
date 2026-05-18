export interface NleLaneClipBlock {
  readonly id: string | null;
  readonly assetId: string | null;
  readonly name: string | null;
  readonly leftPct: number;
  readonly widthPct: number;
  readonly enabled: boolean;
}

export type NleLaneKind = 'video' | 'audio' | 'captions' | 'motion-graphics';

export interface NleTimelineTrackRow {
  readonly id: string;
  readonly kind: NleLaneKind;
  readonly label: string;
  readonly enabled: boolean;
  readonly locked: boolean;
  readonly muted: boolean;
  readonly blocks: readonly NleLaneClipBlock[];
}

export function buildLaneClips(project: unknown, kind: NleLaneKind): NleLaneClipBlock[];
export function buildTimelineTracks(project: unknown): NleTimelineTrackRow[];
