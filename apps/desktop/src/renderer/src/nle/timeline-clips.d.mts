export interface NleLaneClipBlock {
  readonly id: string | null;
  readonly assetId: string | null;
  readonly name: string | null;
  readonly leftPct: number;
  readonly widthPct: number;
  readonly enabled: boolean;
}

export type NleLaneKind = 'video' | 'audio' | 'captions' | 'motion-graphics';

export function buildLaneClips(project: unknown, kind: NleLaneKind): NleLaneClipBlock[];
