export interface NleTrackLane {
  readonly kind: 'video' | 'audio' | 'captions' | 'motion-graphics';
  readonly label: string;
}

export const NLE_TRACK_LANES: ReadonlyArray<NleTrackLane>;

export function assetLabel(asset: unknown, index: number): string;

export function formatDuration(seconds: number | undefined | null): string | null;
