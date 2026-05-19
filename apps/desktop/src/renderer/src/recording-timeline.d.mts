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

export function moveRecordingTimelineClip(
  document: MutableProjectDocument,
  options: {
    readonly assetId: string;
    readonly cameraAssetId?: string | null;
    readonly startFrame: number;
  },
): MutableProjectDocument;

export function syncRecordingTimelinePresentation(
  document: MutableProjectDocument,
  assetId?: string | null,
): MutableProjectDocument;
