import type { EditorOverlayLayer } from './styled-video-preview';

export type EditorTimelineLayer = EditorOverlayLayer & {
  trackId?: string;
  isRecording?: boolean;
};

export type EditorViewerMessage = {
  frame: number;
  fps: number;
  layers?: EditorTimelineLayer[];
  tracks?: { id?: string; order?: number }[];
};

export function findRecordingLayer(
  layers: EditorTimelineLayer[] | undefined | null,
): EditorTimelineLayer | null;

/** The recording's own time under the playhead, or null when it is not there. */
export function resolveRecordingTimeSec(viewer: EditorViewerMessage | null): number | null;

export function splitLayersByRecordingTrack(viewer: EditorViewerMessage | null): {
  above: EditorOverlayLayer[];
  below: EditorOverlayLayer[];
};

/** The Editor's saved timeline, in the shape its live bridge reports. */
export function viewerFromStoredTimeline(
  document: unknown,
  options?: { frame?: number; fps?: number },
): EditorViewerMessage | null;

export function resolveOverlayLayerSource(
  layer: EditorOverlayLayer,
  freecutUrl: string | null | undefined,
  projectId: string | null,
): EditorOverlayLayer;

export function resolveOverlayLayers(
  viewer: EditorViewerMessage | null,
  freecutUrl: string | null | undefined,
  projectId: string | null,
): { above: EditorOverlayLayer[]; below: EditorOverlayLayer[] };
