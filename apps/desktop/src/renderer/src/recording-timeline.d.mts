type MutableProjectDocument = Record<string, any>;

export function getRecordingTimelineClip(document: MutableProjectDocument, assetId?: string | null): {
  readonly timelineIn?: number;
  readonly timelineOut?: number;
  readonly sourceIn?: number;
  readonly sourceOut?: number;
} | null;

export function updateRecordingTimelineTrim(
  document: MutableProjectDocument,
  options: {
    readonly assetId: string;
    readonly cameraAssetId?: string | null;
    readonly cameraOffset?: number;
    readonly startFrame: number;
    readonly endFrame: number;
  },
): MutableProjectDocument;

export function restoreRecordingSourceEdge(
  document: MutableProjectDocument,
  options: { readonly assetId: string; readonly edge: 'head' | 'tail' | 'left' | 'right' },
): MutableProjectDocument;

export function restoreRecordingFullSource(
  document: MutableProjectDocument,
  options: { readonly assetId: string },
): MutableProjectDocument;

export function rippleDeleteRecordingRange(
  document: MutableProjectDocument,
  options: {
    readonly assetId: string;
    readonly startFrame: number;
    readonly endFrame: number;
    readonly idFactory?: (prefix: string) => string;
  },
): MutableProjectDocument;

export function selectRecordingEditModel(input: { readonly document: MutableProjectDocument; readonly recordingAssetId?: string | null } | MutableProjectDocument): {
  readonly document: MutableProjectDocument;
  readonly recordingAsset: Record<string, any> | null;
  readonly linkedGroupId: string | null;
  readonly primaryClip: Record<string, any> | null;
  readonly screenClips: readonly Record<string, any>[];
  readonly trimInfo: Record<string, any>;
  readonly timelineDurationFrames: number;
  readonly sourceDurationFrames: number;
  readonly viewStartFrame: number;
  readonly viewEndFrame: number;
  readonly viewDurationFrames: number;
  readonly cutRanges: readonly { id: string; startFrame: number; endFrame: number }[];
  readonly warning: string | null;
};

export function syncRecordingTimelinePresentation(
  document: MutableProjectDocument,
  assetId?: string | null,
): MutableProjectDocument;
