import type { ProjectDocument } from '@rough-cut/project-model';

export type TimelineRecording = {
  duration?: number;
  fps?: number;
  camera?: unknown;
  audio?: unknown;
} | null;

export type TimelineRegion = {
  id: string;
  left: number;
  width: number;
  kind?: string;
  label?: string;
};

export type TimelineEventMarker = {
  id: string;
  left: number;
};

export type TimelineModel = {
  durationSec: number;
  currentTimeSec: number;
  playheadPercent: number;
  ticks: readonly number[];
  lanes: {
    screen: readonly TimelineRegion[];
    zoom: readonly TimelineRegion[];
    clicks: readonly TimelineEventMarker[];
    camera: readonly TimelineRegion[];
    audio: readonly TimelineRegion[];
  };
};

export function clampTimelineTime(timeSec: number, durationSec: number): number;
export function timeToPercent(timeSec: number, durationSec: number): number;
export function percentToTime(percent: number, durationSec: number): number;
export function frameToPercent(frame: number, fps: number, durationSec: number): number;
export function frameRangeToPlacement(startFrame: number, endFrame: number, fps: number, durationSec: number): { left: number; width: number };
export function buildTimelineModel(options: {
  document: ProjectDocument;
  recording: TimelineRecording;
  currentTimeSec: number;
  cameraMediaUrl?: string | null;
}): TimelineModel;
