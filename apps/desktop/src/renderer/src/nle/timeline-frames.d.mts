export interface NleClipFrame {
  readonly id?: string;
  readonly timelineIn: number;
  readonly timelineOut: number;
  readonly sourceIn: number;
  readonly sourceOut: number;
}

export interface NleTrackFrame {
  readonly clips?: ReadonlyArray<NleClipFrame & Record<string, unknown>>;
}

export function timelineFrameToSourceFrame(
  clip: (NleClipFrame & Record<string, unknown>) | null | undefined,
  timelineFrame: number,
): number | null;

export function activeClipAt(
  track: NleTrackFrame | null | undefined,
  timelineFrame: number,
): (NleClipFrame & Record<string, unknown>) | null;

export function splitClipAtFrame<T extends NleClipFrame & Record<string, unknown>>(
  clip: T,
  splitFrame: number,
): { left: T; right: T } | null;

export function applySplitOnTrack<T extends NleTrackFrame & Record<string, unknown>>(
  track: T,
  originalClipId: string,
  left: NleClipFrame & Record<string, unknown>,
  right: NleClipFrame & Record<string, unknown>,
): T;
