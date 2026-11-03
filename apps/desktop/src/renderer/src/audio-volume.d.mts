export interface VolumePlaybackSegment {
  readonly timelineIn: number;
  readonly timelineOut: number;
  readonly trackIndex?: number;
  readonly clipId?: string;
  readonly audioGain?: number;
}

/** A clip slider being dragged: these clips play at `gain` until it is saved. */
export interface ClipGainOverride {
  readonly clipIds: readonly string[];
  readonly gain: number;
}

export function clipAudioGain(clip: { readonly audio?: unknown } | null | undefined): number;
export function segmentAudioGain(segment: VolumePlaybackSegment | null | undefined, override?: ClipGainOverride | null): number;
export function slotGain(joinGain: number, segment: VolumePlaybackSegment | null | undefined, override?: ClipGainOverride | null): number;
export function clipGainAtFrame(segments: readonly VolumePlaybackSegment[], frame: number, override?: ClipGainOverride | null): number;
export function masterGain(input?: { readonly audioMuted?: boolean; readonly trackGain?: number }): number;
export function previewNeedsLimiter(input?: {
  readonly trackGain?: number;
  readonly segments?: readonly VolumePlaybackSegment[];
  readonly override?: ClipGainOverride | null;
}): boolean;
