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
