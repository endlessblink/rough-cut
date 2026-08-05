import React from 'react';
import {
  AlignBottom as PhosphorAlignBottom,
  AlignCenterHorizontal as PhosphorAlignCenterHorizontal,
  AlignCenterVertical as PhosphorAlignCenterVertical,
  AlignLeft as PhosphorAlignLeft,
  AlignRight as PhosphorAlignRight,
  AlignTop as PhosphorAlignTop,
  GridFour as PhosphorGridFour,
  Pause as PhosphorPause,
  Play as PhosphorPlay,
} from '@phosphor-icons/react';
import {
  resolveTimelineLengthFrames,
  createDefaultCameraPresentation,
  createDefaultRecordingBackgroundStyle,
  getRecordingBackgroundColors,
  getStyledCanvasResolution,
  type CameraPresentation,
  type NormalizedRect,
  type ProjectAspectRatio,
  type ProjectDocument,
  type RecordingBackgroundStyle,
  type RegionCrop,
  type TimelineClip,
} from '@rough-cut/project-model';
import { getCameraLayoutRect, resolveFrame, resolveTimelineFrame, resolveTimelinePreviewFrame } from '@rough-cut/frame-resolver';
import { visibleDurationFrames, visibleFrameToSourceFrame } from './cut-ranges.mjs';
import { getCursorEvents } from './cursor-data.mjs';
import { getPrimaryRecordingAsset } from './zoom-markers.mjs';
import { createScreenLayerRenderer, type ScreenLayerRenderer, type ScreenLayerRendererKind, type ScreenLayerRendererStats } from './screen-layer-renderer';
import { applyScreenSourceTransform, resolveZoomMotionBlurPx } from './zoom-motion-renderer';
import { drawCensorRegions } from './censor-overlay';
import { resolveCensorRectAtFrame } from '../../shared/censor-regions.mjs';
import { canvasPointToSourceNormalized, sourceRectToCanvasRect, type CensorPointerMapping } from '../../shared/screen-source-transform.mjs';
import { moveCensorRect, resizeCensorRect } from '../../shared/censor-regions.mjs';
import { timelineJoinGain } from '../../shared/timeline-audio-envelope.mjs';
import { shouldPublishTimelinePlayhead } from './timeline-playhead-publish.mjs';
import {
  cameraCoversSourceTime,
  clampedCameraTime,
  coverSourceRect,
  cursorAtTimeMs,
  cursorForResizeHandle,
  frameResizeHandles,
  getCursorBoundsStatus,
  moveRectFromPointer,
  resizeHandleAtPoint,
  resizeRectFromPointer,
  type PreviewDragOrigin,
} from './styled-preview.mjs';

const DEFAULT_RECORDING_BACKGROUND = createDefaultRecordingBackgroundStyle();
const DEFAULT_CAMERA_PRESENTATION = createDefaultCameraPresentation();
const PREVIEW_CANVAS_LONG_EDGE = 1280;
const PLAYBACK_DEBUG_LOG_LIMIT = 500;
const PLAYBACK_DRAW_COST_LOG_THRESHOLD_MS = 12;
const PLAYBACK_EXPECTED_DISPLAY_GAP_THRESHOLD_MS = 50;
const PLAYBACK_EXPECTED_DISPLAY_GAP_FRAME_MULTIPLIER = 2.25;
const PLAYBACK_EXPECTED_DISPLAY_WARMUP_SAMPLES = 3;
// rVFC-scheduled draws get a timeout fallback so a decode stall or media end
// can't park the render loop forever (2026-07-19 wedge: isPlaying stuck true,
// frozen frame, dead loop).
const PLAYBACK_DRAW_WATCHDOG_MS = 250;

type PlaybackQualitySnapshot = {
  creationTime: number;
  totalVideoFrames: number;
  droppedVideoFrames: number;
  corruptedVideoFrames?: number;
} | null;

type RoughCutVideoFrameMetadata = {
  mediaTime?: number;
  expectedDisplayTime?: number;
  presentationTime?: number;
  presentedFrames?: number;
};

type PlaybackDebugReportBridge = {
  writePlaybackDebugReport?: (report: Record<string, unknown>) => Promise<{ ok?: boolean; skipped?: boolean; path?: string; reason?: string }>;
};

type PreviewAudioOwnerWindow = Window & {
  __roughCutAudiblePreviewVideo?: HTMLVideoElement | null;
};

function claimAudiblePreviewVideo(video: HTMLVideoElement) {
  if (typeof window === 'undefined') return;
  const target = window as PreviewAudioOwnerWindow;
  const previous = target.__roughCutAudiblePreviewVideo;
  if (previous && previous !== video) previous.pause();
  target.__roughCutAudiblePreviewVideo = video;
}

function releaseAudiblePreviewVideo(video: HTMLVideoElement | null | undefined) {
  if (!video || typeof window === 'undefined') return;
  const target = window as PreviewAudioOwnerWindow;
  if (target.__roughCutAudiblePreviewVideo === video) target.__roughCutAudiblePreviewVideo = null;
}

function pausePreviewVideo(video: HTMLVideoElement | null | undefined) {
  if (!video) return;
  video.pause();
  releaseAudiblePreviewVideo(video);
}

function recordPlaybackDebug(event: string, detail: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;
  const target = window as unknown as {
    __roughCutPlaybackDebugLog?: Array<Record<string, unknown>>;
    __roughCutPlaybackDebugCounts?: Record<string, number>;
  };
  const log = Array.isArray(target.__roughCutPlaybackDebugLog)
    ? target.__roughCutPlaybackDebugLog
    : [];
  log.push({
    atMs: typeof performance !== 'undefined' ? Math.round(performance.now() * 10) / 10 : Date.now(),
    event,
    ...detail,
  });
  if (log.length > PLAYBACK_DEBUG_LOG_LIMIT) log.splice(0, log.length - PLAYBACK_DEBUG_LOG_LIMIT);
  target.__roughCutPlaybackDebugLog = log;
  const counts = target.__roughCutPlaybackDebugCounts ?? {};
  counts[event] = (counts[event] ?? 0) + 1;
  target.__roughCutPlaybackDebugCounts = counts;
}

function reclassifyPlaybackDebugEvents(
  fromEvent: string,
  toEvent: string,
  predicate: (entry: Record<string, unknown>) => boolean,
) {
  if (typeof window === 'undefined') return;
  const target = window as unknown as {
    __roughCutPlaybackDebugLog?: Array<Record<string, unknown>>;
    __roughCutPlaybackDebugCounts?: Record<string, number>;
  };
  const log = Array.isArray(target.__roughCutPlaybackDebugLog)
    ? target.__roughCutPlaybackDebugLog
    : [];
  const counts = target.__roughCutPlaybackDebugCounts ?? {};
  let changed = 0;
  for (const entry of log) {
    if (entry?.event !== fromEvent || !predicate(entry)) continue;
    entry.event = toEvent;
    changed += 1;
  }
  if (changed > 0) {
    counts[fromEvent] = Math.max(0, (counts[fromEvent] ?? 0) - changed);
    counts[toEvent] = (counts[toEvent] ?? 0) + changed;
    target.__roughCutPlaybackDebugCounts = counts;
  }
}

function readPlaybackQuality(video: HTMLVideoElement | null | undefined): PlaybackQualitySnapshot {
  const qualityReader = (video as (HTMLVideoElement & {
    getVideoPlaybackQuality?: () => PlaybackQualitySnapshot;
  }) | null | undefined)?.getVideoPlaybackQuality;
  if (!video || typeof qualityReader !== 'function') return null;
  const quality = qualityReader.call(video);
  if (!quality) return null;
  return {
    creationTime: quality.creationTime,
    totalVideoFrames: quality.totalVideoFrames,
    droppedVideoFrames: quality.droppedVideoFrames,
    corruptedVideoFrames: quality.corruptedVideoFrames,
  };
}

function publishScreenLayerRendererStats(stats: ScreenLayerRendererStats) {
  if (typeof window === 'undefined') return;
  (window as unknown as Record<string, unknown>).__roughCutScreenLayerRenderer = stats;
}

function resolveRequestedScreenLayerRendererKind(): ScreenLayerRendererKind {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  if (typeof window !== 'undefined') {
    const queryRenderer = new URLSearchParams(window.location.search).get('screenLayerRenderer');
    if (queryRenderer) return resolveScreenLayerRendererSelection(queryRenderer);
    const target = window as unknown as { __roughCutWebglScreenLayer?: unknown; __roughCutWebgpuScreenLayer?: unknown; __roughCutScreenLayerRenderer?: unknown };
    if (typeof target.__roughCutScreenLayerRenderer === 'string') return resolveScreenLayerRendererSelection(target.__roughCutScreenLayerRenderer);
    if (target.__roughCutWebgpuScreenLayer === true || target.__roughCutWebgpuScreenLayer === '1') return 'webgpu';
    if (target.__roughCutWebglScreenLayer === true || target.__roughCutWebglScreenLayer === '1') return 'webgl';
    try {
      const storedRenderer = window.localStorage?.getItem('roughCutScreenLayerRenderer');
      if (storedRenderer) return resolveScreenLayerRendererSelection(storedRenderer);
      if (window.localStorage?.getItem('roughCutWebgpuScreenLayer') === '1') return 'webgpu';
      if (window.localStorage?.getItem('roughCutWebglScreenLayer') === '1') return 'webgl';
    } catch {
      // localStorage can be unavailable in restricted contexts; fall through to env/default.
    }
  }
  const envRenderer = env.ROUGH_CUT_SCREEN_LAYER_RENDERER ?? env.VITE_ROUGH_CUT_SCREEN_LAYER_RENDERER;
  if (envRenderer) return resolveScreenLayerRendererSelection(envRenderer);
  if (env.ROUGH_CUT_WEBGPU_SCREEN_LAYER === '1' || env.VITE_ROUGH_CUT_WEBGPU_SCREEN_LAYER === '1') return 'webgpu';
  if (env.ROUGH_CUT_WEBGL_SCREEN_LAYER === '1' || env.VITE_ROUGH_CUT_WEBGL_SCREEN_LAYER === '1') return 'webgl';
  if (env.ROUGH_CUT_DISABLE_WEBGPU_DEFAULT === '1' || env.VITE_ROUGH_CUT_DISABLE_WEBGPU_DEFAULT === '1') return 'canvas2d';
  return resolveAutoScreenLayerRendererKind();
}

function resolveScreenLayerRendererSelection(value: string): ScreenLayerRendererKind {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'webgpu') return 'webgpu';
  if (normalized === 'webgl') return 'webgl';
  if (normalized === 'canvas2d') return 'canvas2d';
  if (normalized === 'auto') return resolveAutoScreenLayerRendererKind();
  return 'canvas2d';
}

function resolveAutoScreenLayerRendererKind(): ScreenLayerRendererKind {
  if (typeof window === 'undefined') return 'canvas2d';
  if ('gpu' in navigator) return 'webgpu';
  const canvas = document.createElement('canvas');
  try {
    if (canvas.getContext('webgl2') || canvas.getContext('webgl')) return 'webgl';
  } catch {
    // Some sandboxed contexts throw while probing. Canvas2D remains the safe fallback.
  }
  return 'canvas2d';
}

function isAcceleratedScreenLayerRenderer(kind: ScreenLayerRendererKind): boolean {
  return kind === 'webgl' || kind === 'webgpu';
}

function readPlaybackDebugSummary() {
  if (typeof window === 'undefined') {
    return {
      counts: {},
      frameGapCount: 0,
      maxFrameGap: 0,
      expectedDisplayGapCount: 0,
      maxExpectedDisplayGap: 0,
      drawCostCount: 0,
      maxDrawCost: 0,
      longTaskCount: 0,
      maxLongTask: 0,
      tail: [],
    };
  }
  const target = window as unknown as {
    __roughCutPlaybackDebugLog?: Array<Record<string, unknown>>;
    __roughCutPlaybackDebugCounts?: Record<string, number>;
  };
  const log = Array.isArray(target.__roughCutPlaybackDebugLog)
    ? target.__roughCutPlaybackDebugLog
    : [];
  const frameGaps = log.filter((entry) => entry?.event === 'render-frame-gap');
  const expectedDisplayGaps = log.filter((entry) => entry?.event === 'render-expected-display-gap');
  const mainThreadBlockedExpectedDisplayGaps = log.filter((entry) => entry?.event === 'render-expected-display-gap-main-thread-blocked');
  const drawCosts = log.filter((entry) => entry?.event === 'render-draw-cost');
  const longTasks = log.filter((entry) => entry?.event === 'main-thread-long-task');
  return {
    counts: target.__roughCutPlaybackDebugCounts ?? {},
    frameGapCount: frameGaps.length,
    maxFrameGap: frameGaps.reduce((max, entry) => Math.max(max, Number(entry?.deltaMs) || 0), 0),
    lastFrameGap: frameGaps[frameGaps.length - 1] ?? null,
    expectedDisplayGapCount: expectedDisplayGaps.length,
    maxExpectedDisplayGap: expectedDisplayGaps.reduce((max, entry) => Math.max(max, Number(entry?.expectedGapMs) || 0), 0),
    lastExpectedDisplayGap: expectedDisplayGaps[expectedDisplayGaps.length - 1] ?? null,
    mainThreadBlockedExpectedDisplayGapCount: mainThreadBlockedExpectedDisplayGaps.length,
    maxMainThreadBlockedExpectedDisplayGap: mainThreadBlockedExpectedDisplayGaps.reduce((max, entry) => Math.max(max, Number(entry?.expectedGapMs) || 0), 0),
    lastMainThreadBlockedExpectedDisplayGap: mainThreadBlockedExpectedDisplayGaps[mainThreadBlockedExpectedDisplayGaps.length - 1] ?? null,
    drawCostCount: drawCosts.length,
    maxDrawCost: drawCosts.reduce((max, entry) => Math.max(max, Number(entry?.totalDrawMs) || 0), 0),
    lastDrawCost: drawCosts[drawCosts.length - 1] ?? null,
    longTaskCount: longTasks.length,
    maxLongTask: longTasks.reduce((max, entry) => Math.max(max, Number(entry?.duration) || 0), 0),
    lastLongTask: longTasks[longTasks.length - 1] ?? null,
    tail: log.slice(-80),
  };
}

// Radius of the draggable zoom focus target, in canvas-pixel space. Scales
// with the canvas so it stays a consistent on-screen size across resolutions.
function focalTargetRadius(canvasW: number, canvasH: number): number {
  return Math.max(16, Math.min(canvasW, canvasH) * 0.022);
}

// True when a canvas-space point lands on the focus target (with a small grab
// margin). Used to give the target precedence over screen/camera drag.
function isPointNearFocalTarget(
  xCanvas: number,
  yCanvas: number,
  screenRect: { x: number; y: number; w: number; h: number } | null,
  focal: { id: string; x: number; y: number } | null | undefined,
  onZoomFocalChange: ((markerId: string, x: number, y: number) => void) | undefined,
  canvasW: number,
  canvasH: number,
): boolean {
  if (!onZoomFocalChange || !focal || !screenRect) return false;
  const cx = screenRect.x + focal.x * screenRect.w;
  const cy = screenRect.y + focal.y * screenRect.h;
  return Math.hypot(xCanvas - cx, yCanvas - cy) <= focalTargetRadius(canvasW, canvasH) + 14;
}

// A precise focus reticle drawn over the screen frame: a ring with four
// crosshair ticks and an accent center dot. Double-stroked (dark under white)
// so it stays legible over any video content. `active` enlarges it slightly
// for press feedback while dragging.
function drawFocalTarget(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  active: boolean,
): void {
  const r = active ? radius * 1.12 : radius;
  const inner = r * 0.7;
  const outer = r * 1.32;
  const reticle = (color: string, width: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - inner); ctx.lineTo(cx, cy - outer);
    ctx.moveTo(cx, cy + inner); ctx.lineTo(cx, cy + outer);
    ctx.moveTo(cx - inner, cy); ctx.lineTo(cx - outer, cy);
    ctx.moveTo(cx + inner, cy); ctx.lineTo(cx + outer, cy);
    ctx.stroke();
  };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = r * 0.5;
  reticle('rgba(8, 12, 20, 0.7)', Math.max(3, r * 0.16));
  ctx.shadowBlur = 0;
  reticle('rgba(255, 255, 255, 0.95)', Math.max(1.5, r * 0.09));
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(2, r * 0.14), 0, Math.PI * 2);
  ctx.fillStyle = '#2563eb';
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.stroke();
  ctx.restore();
}

function waitForVideoFrameReady(video: HTMLVideoElement | null, timeoutMs = 3000): Promise<void> {
  if (!video || video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for video frame data.'));
    }, timeoutMs);
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('error', onError);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(videoErrorMessage(video)));
    };
    video.addEventListener('loadeddata', onReady, { once: true });
    video.addEventListener('canplay', onReady, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

export type StyledPreviewProject = {
  document: {
    name?: string;
    composition: { duration: number } & Record<string, unknown>;
    settings?: { aspectRatio?: ProjectAspectRatio };
    assets?: Array<{
      id?: string;
      type?: string;
      presentation?: { background?: RecordingBackgroundStyle } & Record<string, unknown>;
      metadata?: Record<string, unknown>;
    } & Record<string, unknown>>;
  } & Record<string, unknown>;
  recording: null | { duration: number; width: number; height: number; fps: number; camera?: unknown };
  mediaUrl: string | null;
  cameraMediaUrl?: string | null;
};

type CutRange = { id: string; startFrame: number; endFrame: number };
type PreviewTimeMode = 'source' | 'timeline';
type CursorOffscreenSide = 'left' | 'right' | 'top' | 'bottom';
type CursorOffscreenStatus = null | { side: CursorOffscreenSide; distance: number };
type PreviewAlignmentTarget = 'screen' | 'camera';
type PreviewAlignmentMode = 'left' | 'horizontal-center' | 'right' | 'top' | 'vertical-center' | 'bottom';
export type ResolvedPreviewLayout = { screenFrame: NormalizedRect; cameraFrame: NormalizedRect | null };
export type ZoomAuthoringSafety = {
  crop: { x: number; y: number; w: number; h: number };
  cursorInside: boolean | null;
};
type TimelinePlaybackSegment = {
  timelineIn: number;
  timelineOut: number;
  sourceIn: number;
  sourceOut: number;
  trackIndex: number;
};

export function resolveZoomAuthoringSafety({
  sourceWidth,
  sourceHeight,
  scale,
  offsetX,
  offsetY,
  cursor,
}: {
  sourceWidth: number;
  sourceHeight: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  cursor: { x: number; y: number } | null;
}): ZoomAuthoringSafety | null {
  if (![sourceWidth, sourceHeight, scale, offsetX, offsetY].every(Number.isFinite)) return null;
  if (sourceWidth <= 0 || sourceHeight <= 0 || scale <= 1.001) return null;
  const crop = {
    x: sourceWidth / 2 - sourceWidth / (2 * scale) - offsetX / scale,
    y: sourceHeight / 2 - sourceHeight / (2 * scale) - offsetY / scale,
    w: sourceWidth / scale,
    h: sourceHeight / scale,
  };
  const cursorInside = cursor
    ? cursor.x >= crop.x && cursor.x <= crop.x + crop.w && cursor.y >= crop.y && cursor.y <= crop.y + crop.h
    : null;
  return { crop, cursorInside };
}

export function StyledVideoPreview({
  project,
  seekTimeSec,
  trimStartSec = 0,
  trimEndSec,
  cutRanges = [],
  isPlaying: controlledPlaying,
  playbackRate = 1,
  showControls = true,
  timeMode = 'source',
  onCurrentTimeChange,
  onPlayingChange,
  onCameraFrameChange,
  onScreenFrameChange,
  onSourceMediaDurationChange,
  onResolvedLayoutChange,
  selectedZoomFocal = null,
  onZoomFocalChange,
  censorDrawArmed = false,
  onCensorDraw,
  selectedCensor = null,
  onCensorRectChange,
  mediaUrlOverride,
  cameraMediaUrlOverride,
  overlayLayersAbove = [],
  overlayLayersBelow = [],
  recordingAbsent = false,
}: {
  project: StyledPreviewProject;
  /** Editor layers on tracks above the recording. */
  overlayLayersAbove?: EditorOverlayLayer[];
  /** Editor layers on tracks below the recording. */
  overlayLayersBelow?: EditorOverlayLayer[];
  /**
   * True where the recording clip does not reach: before it starts, after it
   * ends, or inside a hole cut out of it. The recording occupies a range like
   * any other clip, and outside that range the timeline is empty and must render
   * empty — layers on other tracks still draw.
   */
  recordingAbsent?: boolean;
  seekTimeSec?: number;
  trimStartSec?: number;
  trimEndSec?: number;
  cutRanges?: CutRange[];
  isPlaying?: boolean;
  playbackRate?: number;
  showControls?: boolean;
  timeMode?: PreviewTimeMode;
  onCurrentTimeChange?: (sec: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  onCameraFrameChange?: (frame: NormalizedRect | null) => void;
  onScreenFrameChange?: (frame: NormalizedRect | null) => void;
  onSourceMediaDurationChange?: (sec: number | null) => void;
  onResolvedLayoutChange?: (layout: ResolvedPreviewLayout) => void;
  selectedZoomFocal?: { id: string; x: number; y: number } | null;
  onZoomFocalChange?: (markerId: string, x: number, y: number) => void;
  /** Censor tool is armed: the next drag on the preview draws a censor rectangle. */
  censorDrawArmed?: boolean;
  onCensorDraw?: (rect: { x: number; y: number; w: number; h: number }) => void;
  /** Censor selected on the timeline; gets move/resize handles on the preview. */
  selectedCensor?: {
    id: string;
    rect: { x: number; y: number; w: number; h: number };
    keyframes?: readonly { frame: number; rect: { x: number; y: number; w: number; h: number } }[];
  } | null;
  /**
   * `frame` is the recording frame the drag ended on. A censor that follows moving
   * content needs it: the edit applies to a whole tracked path, and which position
   * the user was correcting is the only thing that says by how much.
   */
  onCensorRectChange?: (
    censorId: string,
    rect: { x: number; y: number; w: number; h: number },
    frame: number,
  ) => void;
  mediaUrlOverride?: string | null;
  cameraMediaUrlOverride?: string | null;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const cameraVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const webglCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const screenLayerRendererRef = React.useRef<ScreenLayerRenderer | null>(null);
  // Decode surfaces for Editor video layers, kept across frames so playback
  // does not re-create an element (and re-buffer) on every draw.
  const editorLayerMediaRef = React.useRef<Map<string, HTMLVideoElement>>(new Map());
  // The draw loop is a long-lived closure that is not restarted when layers
  // change, so it must read them through a ref or it would keep drawing the
  // stack that existed when the loop started.
  const overlayLayersAboveRef = React.useRef<EditorOverlayLayer[]>(overlayLayersAbove);
  const overlayLayersBelowRef = React.useRef<EditorOverlayLayer[]>(overlayLayersBelow);
  const recordingAbsentRef = React.useRef(recordingAbsent);
  const backgroundImageRef = React.useRef<HTMLImageElement | null>(null);
  const pendingSeekRef = React.useRef<number | null>(null);
  const seekingRef = React.useRef(false);
  const previewInteractionDirtyRef = React.useRef(false);
  // Canonical timeline speed (1x, or a jog/shuttle rate). In timeline mode the
  // source video plays continuously through one segment and rVFC maps decoded
  // source frames back to timeline frames.
  const timelineRateRef = React.useRef(1);
  const activeTimelineSegmentRef = React.useRef<TimelinePlaybackSegment | null>(null);
  const timelineFrameFallbackRef = React.useRef(0);
  const cameraDragRef = React.useRef<NormalizedRect | null>(null);
  const cameraRectRef = React.useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const cameraRadiusRef = React.useRef(16);
  const cameraDragOriginRef = React.useRef<PreviewDragOrigin | null>(null);
  const screenDragRef = React.useRef<NormalizedRect | null>(null);
  const screenRectRef = React.useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const screenRadiusRef = React.useRef(22);
  const screenDragOriginRef = React.useRef<PreviewDragOrigin | null>(null);
  const lastResolvedLayoutKeyRef = React.useRef('');
  const [isDraggingCamera, setIsDraggingCamera] = React.useState(false);
  // Captured every draw so the censor pointer handlers invert exactly the
  // transform that produced the frame the user is looking at.
  const censorMappingRef = React.useRef<CensorPointerMapping | null>(null);
  const censorDraftRef = React.useRef<{ pointerId: number; from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  const [censorDraftRect, setCensorDraftRect] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // Canvas-space rect of the selected censor, refreshed each draw. Handles are drawn
  // and hit-tested here rather than inside the source transform, where their fixed
  // pixel size would scale with the zoom.
  const censorHandleRectRef = React.useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  // Recording frame of the last draw, so a censor edit can say which position along a
  // tracked path the user was correcting.
  const censorSourceFrameRef = React.useRef(0);
  const censorEditRef = React.useRef<{
    pointerId: number;
    mode: 'move' | 'resize';
    handle: string | null;
    startRect: { x: number; y: number; w: number; h: number };
    grabX: number;
    grabY: number;
  } | null>(null);
  const [isEditingCensor, setIsEditingCensor] = React.useState(false);
  /** Live source-space rect during a censor drag, so handles and fill track the pointer. */
  const censorDragRectRef = React.useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const [isDraggingScreen, setIsDraggingScreen] = React.useState(false);
  const [isDraggingFocal, setIsDraggingFocal] = React.useState(false);
  const [alignmentGridVisible, setAlignmentGridVisible] = React.useState(true);
  const [alignmentTarget, setAlignmentTarget] = React.useState<PreviewAlignmentTarget>('screen');
  const alignmentGridVisibleRef = React.useRef(alignmentGridVisible);
  alignmentGridVisibleRef.current = alignmentGridVisible;
  // Live focal position during a drag (normalized 0–1), committed on pointerup.
  const focalDragRef = React.useRef<{ x: number; y: number } | null>(null);
  const focalDragOriginRef = React.useRef<{ pointerId: number } | null>(null);
  // The render loop runs in an effect whose closure does not re-capture the
  // selection (selecting a marker is local parent state, not a project change),
  // so the latest values are read through refs instead.
  const selectedZoomFocalRef = React.useRef(selectedZoomFocal);
  selectedZoomFocalRef.current = selectedZoomFocal;
  const onCurrentTimeChangeRef = React.useRef(onCurrentTimeChange);
  onCurrentTimeChangeRef.current = onCurrentTimeChange;
  const onPlayingChangeRef = React.useRef(onPlayingChange);
  onPlayingChangeRef.current = onPlayingChange;
  const isDraggingFocalRef = React.useRef(false);
  isDraggingFocalRef.current = isDraggingFocal;
  const [currentTime, setCurrentTime] = React.useState(0);
  const currentTimeRef = React.useRef(0);
  const lastPublishedTimeRef = React.useRef({ atMs: 0, timeSec: 0 });
  const [internalPlaying, setInternalPlaying] = React.useState(false);
  const [sourceMediaDuration, setSourceMediaDuration] = React.useState<number | null>(null);
  const [cameraMediaDuration, setCameraMediaDuration] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [cursorOffscreen, setCursorOffscreen] = React.useState<CursorOffscreenStatus>(null);
  const editablePreview = Boolean(onScreenFrameChange || onCameraFrameChange);
  const canAlignScreen = Boolean(onScreenFrameChange);
  const canAlignCamera = Boolean(onCameraFrameChange);
  const effectiveAlignmentTarget = alignmentTarget === 'camera' && canAlignCamera ? 'camera' : 'screen';
  const selectedAlignmentLabel = effectiveAlignmentTarget === 'camera' ? 'Camera' : 'Screen';
  const alignSelectedFrame = React.useCallback((mode: PreviewAlignmentMode) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const target = alignmentTarget === 'camera' && cameraRectRef.current && onCameraFrameChange ? 'camera' : 'screen';
    const rect = target === 'camera' ? cameraRectRef.current : screenRectRef.current;
    if (!rect) return;
    const aligned = alignRectInCanvas(rect, mode, canvas.width, canvas.height);
    if (target === 'camera') onCameraFrameChange?.(rectToNormalizedFrame(aligned, canvas.width, canvas.height));
    else onScreenFrameChange?.(rectToNormalizedFrame(aligned, canvas.width, canvas.height));
    previewInteractionDirtyRef.current = true;
    setAlignmentTarget(target);
  }, [alignmentTarget, onCameraFrameChange, onScreenFrameChange]);
  const cursorOffscreenRef = React.useRef<CursorOffscreenStatus>(null);
  const isPlaying = controlledPlaying ?? internalPlaying;
  const requestedScreenLayerRendererKind = resolveRequestedScreenLayerRendererKind();

  React.useEffect(() => () => {
    screenLayerRendererRef.current?.dispose();
    screenLayerRendererRef.current = null;
  }, []);

  React.useEffect(() => {
    const rate = Number.isFinite(playbackRate)
      ? Math.max(0.25, Math.min(4, playbackRate))
      : 1;
    timelineRateRef.current = rate;
    const video = videoRef.current;
    const cameraVideo = cameraVideoRef.current;
    if (video) {
      video.preservesPitch = true;
      video.playbackRate = rate;
    }
    if (cameraVideo) {
      cameraVideo.preservesPitch = true;
      cameraVideo.playbackRate = rate;
    }
  }, [playbackRate]);

  // Force one repaint when the selected zoom focus changes so the target
  // appears/moves/disappears even while the playhead is parked on one frame.
  React.useEffect(() => {
    if (timeMode === 'timeline' && isPlaying) return;
    previewInteractionDirtyRef.current = true;
  }, [alignmentGridVisible, isPlaying, selectedZoomFocal?.id, selectedZoomFocal?.x, selectedZoomFocal?.y, timeMode]);

  React.useEffect(() => {
    if (typeof PerformanceObserver === 'undefined') return undefined;
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const startTime = Math.round(entry.startTime * 10) / 10;
          const duration = Math.round(entry.duration * 10) / 10;
          const blockedUntilMs = startTime + duration;
          recordPlaybackDebug('main-thread-long-task', {
            startTime,
            duration,
            name: entry.name,
          });
          reclassifyPlaybackDebugEvents(
            'render-expected-display-gap',
            'render-expected-display-gap-main-thread-blocked',
            (candidate) => {
              const atMs = Number(candidate.atMs);
              return Number.isFinite(atMs) && atMs >= startTime - 20 && atMs <= blockedUntilMs + 120;
            },
          );
        }
      });
      observer.observe({ type: 'longtask', buffered: true } as PerformanceObserverInit);
    } catch {
      observer = null;
    }
    return () => observer?.disconnect();
  }, []);

  const src = mediaUrlOverride ?? project.mediaUrl ?? '';
  const cameraSrc = cameraMediaUrlOverride ?? project.cameraMediaUrl ?? '';
  const sourceWidth = project.recording?.width ?? 1920;
  const sourceHeight = project.recording?.height ?? 1080;
  const fps = project.recording?.fps ?? 30;
  const cameraSourceInFrames = (project.recording?.camera as { sourceInFrames?: number } | null | undefined)?.sourceInFrames ?? 0;
  const cameraSourceOffsetSec = Math.max(0, cameraSourceInFrames / fps);
  const aspectRatio = project.document.settings?.aspectRatio ?? 'auto';
  const canvasResolution = getStyledCanvasResolution({
    aspectRatio,
    sourceWidth,
    sourceHeight,
    longEdge: PREVIEW_CANVAS_LONG_EDGE,
  });
  const background = getPrimaryRecordingAsset(project.document as unknown as ProjectDocument)?.presentation?.background ?? DEFAULT_RECORDING_BACKGROUND;
  const backgroundRenderKey = [
    background.bgColor,
    background.bgGradient ?? '',
    background.bgImage ?? '',
    background.bgPadding,
    background.bgCornerRadius,
    background.bgShadowEnabled ? 1 : 0,
    background.bgShadowOpacity,
    background.bgShadowBlur,
    background.bgShadowOffsetX ?? 0,
    background.bgShadowOffsetY ?? DEFAULT_RECORDING_BACKGROUND.bgShadowOffsetY ?? 34,
    background.bgInset,
    background.bgInsetColor ?? '',
  ].join('|');
  const metadataSourceDurationSec = Math.max(0.1, (project.recording?.duration ?? 1) / fps);
  const cameraTimelineDurationSec = Number.isFinite(cameraMediaDuration) && cameraMediaDuration !== null && cameraMediaDuration > cameraSourceOffsetSec
    ? Math.max(0.1, cameraMediaDuration - cameraSourceOffsetSec - 1 / fps)
    : null;
  const sourceDurationSec = Math.max(0.1, Math.min(metadataSourceDurationSec, sourceMediaDuration ?? metadataSourceDurationSec, cameraTimelineDurationSec ?? metadataSourceDurationSec));
  const effectiveTrimEndSec = Math.min(trimEndSec ?? sourceDurationSec, sourceDurationSec);
  const trimDurationFrames = Math.max(1, Math.round((effectiveTrimEndSec - trimStartSec) * fps));
  const visibleDuration = Math.max(0.1, visibleDurationFrames(cutRanges, trimDurationFrames) / fps);
  const timelineDurationFrames = Math.max(
    1,
    resolveTimelineLengthFrames(
      (project.document as unknown as ProjectDocument).timeline ?? { tracks: [], markers: [], effects: [] },
      project.document.composition.duration,
    ),
  );
  const timelineDuration = Math.max(0.1, timelineDurationFrames / fps);
  const displayDuration = timeMode === 'timeline' ? timelineDuration : visibleDuration;

  React.useEffect(() => {
    const video = videoRef.current;
    const cameraVideo = cameraVideoRef.current;
    if (cameraVideo) {
      cameraVideo.muted = true;
      cameraVideo.volume = 0;
    }
    return () => {
      pausePreviewVideo(video);
      cameraVideo?.pause();
    };
  }, [src, cameraSrc]);

  React.useEffect(() => {
    const bridge = (window as unknown as { roughCut?: PlaybackDebugReportBridge }).roughCut;
    if (typeof bridge?.writePlaybackDebugReport !== 'function') return undefined;
    let stopped = false;
    let disabled = false;
    let inFlight = false;
    const publish = () => {
      if (stopped || disabled || inFlight) return;
      const screenVideo = videoRef.current;
      const cameraVideo = cameraVideoRef.current;
      inFlight = true;
      bridge.writePlaybackDebugReport?.({
        source: 'regular-app',
        projectName: project.document.name ?? null,
        mediaUrl: src || null,
        cameraMediaUrl: cameraSrc || null,
        timeMode,
        isPlaying,
        currentTime: currentTimeRef.current,
        drawCount: (window as unknown as Record<string, number>).__roughCutCanvasDrawCount ?? 0,
        timelinePlaybackDebug: (window as unknown as Record<string, unknown>).__roughCutTimelinePlaybackDebug ?? null,
        playbackDebug: readPlaybackDebugSummary(),
        videos: [
          screenVideo
            ? {
                role: 'screen',
                currentTime: screenVideo.currentTime,
                duration: screenVideo.duration,
                paused: screenVideo.paused,
                seeking: screenVideo.seeking,
                readyState: screenVideo.readyState,
                playbackRate: screenVideo.playbackRate,
                playbackQuality: readPlaybackQuality(screenVideo),
              }
            : null,
          cameraVideo
            ? {
                role: 'camera',
                currentTime: cameraVideo.currentTime,
                duration: cameraVideo.duration,
                paused: cameraVideo.paused,
                seeking: cameraVideo.seeking,
                readyState: cameraVideo.readyState,
                playbackRate: cameraVideo.playbackRate,
                playbackQuality: readPlaybackQuality(cameraVideo),
              }
            : null,
        ].filter(Boolean),
      })
        .then((result) => {
          if (result?.skipped) disabled = true;
        })
        .catch(() => {
          disabled = true;
        })
        .finally(() => {
          inFlight = false;
        });
    };
    publish();
    const intervalId = window.setInterval(publish, 1000);
    return () => {
      stopped = true;
      window.clearInterval(intervalId);
    };
  }, [cameraSrc, isPlaying, project.document.name, src, timeMode]);

  function publishCurrentTime(nextTime: number) {
    lastPublishedTimeRef.current = {
      atMs: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      timeSec: nextTime,
    };
    setCurrentTime(nextTime);
    onCurrentTimeChangeRef.current?.(nextTime);
  }

  function updateCurrentTime(nextTime: number, options: { immediate?: boolean; notify?: boolean } = {}) {
    currentTimeRef.current = nextTime;
    if (options.notify === false) return;

    const last = lastPublishedTimeRef.current;
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (shouldPublishTimelinePlayhead({
      timeMode,
      isPlaying,
      immediate: options.immediate,
      nextTime,
      displayDuration,
      fps,
      nowMs,
      lastPublishedAtMs: last.atMs,
    })) {
      publishCurrentTime(nextTime);
    }
  }

  function visibleTimeToSourceTime(visibleTimeSec: number) {
    const visibleFrame = Math.round(Math.max(0, visibleTimeSec) * fps);
    return trimStartSec + visibleFrameToSourceFrame(cutRanges, visibleFrame, trimDurationFrames) / fps;
  }

  function timelineTimeToSourceTime(timelineTimeSec: number) {
    const timelineFrame = Math.max(0, Math.round(timelineTimeSec * fps));
    const resolved = resolveTimelineFrame(project.document as unknown as ProjectDocument, timelineFrame);
    return resolved.video ? resolved.video.sourceFrame / fps : null;
  }

  function buildTimelinePlaybackSegments(): TimelinePlaybackSegment[] {
    const document = project.document as unknown as ProjectDocument;
    const tracks = Array.isArray(document.timeline?.tracks) ? document.timeline.tracks : [];
    const sources = Array.isArray(document.timeline?.sources) ? document.timeline.sources : [];
    const assets = Array.isArray(document.assets) ? document.assets : [];
    return tracks
      .filter((track) => track.kind === 'video' && track.enabled !== false)
      .flatMap((track) => (track.clips ?? []).flatMap((clip: TimelineClip) => {
        const media = sources.find((source) => source.id === clip.mediaId);
        const asset = media?.assetId ? assets.find((item) => item.id === media.assetId) : null;
        if (media?.kind === 'camera' || asset?.metadata?.isCamera) return [];
        return [{
          timelineIn: Math.max(0, Math.round(Number(clip.timelineIn) || 0)),
          timelineOut: Math.max(0, Math.round(Number(clip.timelineOut) || 0)),
          sourceIn: Math.max(0, Math.round(Number(clip.sourceIn) || 0)),
          sourceOut: Math.max(0, Math.round(Number(clip.sourceOut) || 0)),
          trackIndex: Number.isFinite(Number(track.index)) ? Number(track.index) : 0,
        }];
      }))
      .filter((segment) => segment.timelineOut > segment.timelineIn && segment.sourceOut > segment.sourceIn)
      .sort((left, right) => left.timelineIn - right.timelineIn || right.trackIndex - left.trackIndex);
  }

  function timelineSegmentAtFrame(segments: readonly TimelinePlaybackSegment[], timelineFrame: number) {
    const frame = Math.max(0, Math.round(timelineFrame));
    return segments
      .filter((segment) => frame >= segment.timelineIn && frame < segment.timelineOut)
      .sort((left, right) => right.trackIndex - left.trackIndex)[0] ?? null;
  }

  function nextTimelineSegmentAfterFrame(segments: readonly TimelinePlaybackSegment[], timelineFrame: number) {
    const frame = Math.max(0, Math.round(timelineFrame));
    return segments.find((segment) => segment.timelineIn >= frame) ?? null;
  }

  function sameTimelinePlaybackSegment(left: TimelinePlaybackSegment | null, right: TimelinePlaybackSegment | null) {
    return Boolean(
      left &&
      right &&
      left.timelineIn === right.timelineIn &&
      left.timelineOut === right.timelineOut &&
      left.sourceIn === right.sourceIn &&
      left.sourceOut === right.sourceOut &&
      left.trackIndex === right.trackIndex,
    );
  }

  function timelineFrameForDecodedSourceFrame(segment: TimelinePlaybackSegment | null, sourceFrame: number) {
    if (!segment) return timelineFrameFallbackRef.current;
    const offset = Math.max(0, Math.round(sourceFrame) - segment.sourceIn);
    return Math.max(segment.timelineIn, Math.min(segment.timelineOut - 1, segment.timelineIn + offset));
  }

  function syncCameraTime(sourceTimeSec: number) {
    const cameraVideo = cameraVideoRef.current;
    if (!cameraVideo) return;
    cameraVideo.currentTime = clampedCameraTime(sourceTimeSec, cameraSourceOffsetSec, cameraVideo.duration, fps);
  }

  function sourceTimeToVisibleTime(sourceTimeSec: number) {
    const relativeFrame = Math.max(0, Math.round((sourceTimeSec - trimStartSec) * fps));
    let removed = 0;
    for (const range of cutRanges) {
      if (relativeFrame <= range.startFrame) continue;
      removed += Math.min(relativeFrame, range.endFrame) - range.startFrame;
    }
    return Math.max(0, (relativeFrame - removed) / fps);
  }

  function cutEndForSourceTime(sourceTimeSec: number) {
    const relativeFrame = Math.round((sourceTimeSec - trimStartSec) * fps);
    const active = cutRanges.find((range) => relativeFrame >= range.startFrame && relativeFrame < range.endFrame);
    return active ? trimStartSec + active.endFrame / fps : null;
  }

  function publishResolvedLayout(
    screenFrame: { x: number; y: number; w: number; h: number },
    cameraFrame: { x: number; y: number; w: number; h: number } | null,
    canvasWidth: number,
    canvasHeight: number,
  ) {
    if (!onResolvedLayoutChange || canvasWidth <= 0 || canvasHeight <= 0) return;
    const layout: ResolvedPreviewLayout = {
      screenFrame: rectToNormalizedFrame(screenFrame, canvasWidth, canvasHeight),
      cameraFrame: cameraFrame ? rectToNormalizedFrame(cameraFrame, canvasWidth, canvasHeight) : null,
    };
    const key = JSON.stringify(layout);
    if (key === lastResolvedLayoutKeyRef.current) return;
    lastResolvedLayoutKeyRef.current = key;
    onResolvedLayoutChange(layout);
  }

  React.useEffect(() => {
    setSourceMediaDuration(null);
    setCameraMediaDuration(null);
    updateCurrentTime(0, { immediate: true });
    setInternalPlaying(false);
    setCursorOffscreen(null);
    cursorOffscreenRef.current = null;
    setError(null);
    pendingSeekRef.current = null;
    seekingRef.current = false;
  }, [src]);

  React.useEffect(() => {
    onSourceMediaDurationChange?.(sourceDurationSec);
  }, [sourceDurationSec, onSourceMediaDurationChange]);

  React.useEffect(() => {
    if (!background.bgImage) {
      backgroundImageRef.current = null;
      return undefined;
    }
    const image = new Image();
    image.src = background.bgImage;
    image.onload = () => {
      backgroundImageRef.current = image;
      screenLayerRendererRef.current?.prepareBackgroundImage?.(image);
    };
    image.onerror = () => {
      backgroundImageRef.current = null;
    };
    return () => {
      if (backgroundImageRef.current === image) backgroundImageRef.current = null;
    };
  }, [background.bgImage]);

  React.useEffect(() => {
    if (!Number.isFinite(seekTimeSec)) return;
    if (timeMode === 'timeline' && controlledPlaying === true) {
      updateCurrentTime(Math.max(0, seekTimeSec ?? 0), { notify: false });
      previewInteractionDirtyRef.current = true;
      return;
    }
    pendingSeekRef.current = seekTimeSec ?? 0;
    if (!seekingRef.current) flushPendingExternalSeek();
  }, [seekTimeSec, cameraSourceOffsetSec, controlledPlaying, timeMode]);

  React.useEffect(() => {
    const video = videoRef.current;
    const cameraVideo = cameraVideoRef.current;
    if (!video || controlledPlaying === undefined) return;
    // Timeline-mode play/pause is owned by the dedicated effect below (it must
    // also handle the uncontrolled/internal-playing case).
    if (timeMode === 'timeline') return;
    if (controlledPlaying) {
      claimAudiblePreviewVideo(video);
      void video.play().catch(() => onPlayingChangeRef.current?.(false));
      void cameraVideo?.play().catch(() => undefined);
    } else {
      pausePreviewVideo(video);
      cameraVideo?.pause();
    }
  }, [controlledPlaying, timeMode]);

  // Timeline mode: the hidden source <video> plays continuously through one
  // timeline segment and requestVideoFrameCallback drives canvas draws from
  // decoded frames. Seeking is limited to play start, scrubs, and segment/cut
  // boundaries; the draw loop must not seek-sync every frame.
  React.useEffect(() => {
    if (timeMode !== 'timeline') return;
    const video = videoRef.current;
    const cameraVideo = cameraVideoRef.current;
    if (!video) return;
    if (isPlaying) {
      const segments = buildTimelinePlaybackSegments();
      let timelineFrame = Math.max(0, Math.round(currentTimeRef.current * fps));
      let segment = timelineSegmentAtFrame(segments, timelineFrame);
      if (!segment) {
        if (!nextTimelineSegmentAfterFrame(segments, timelineFrame)) {
          setInternalPlaying(false);
          onPlayingChangeRef.current?.(false);
          return;
        }
        activeTimelineSegmentRef.current = null;
        timelineFrameFallbackRef.current = timelineFrame;
        pausePreviewVideo(video);
        cameraVideo?.pause();
        previewInteractionDirtyRef.current = true;
        (window as unknown as Record<string, unknown>).__roughCutTimelinePlaybackDebug = {
          phase: 'play-start-gap',
          timelineFrame,
          nextSegment: nextTimelineSegmentAfterFrame(segments, timelineFrame),
        };
        return;
      }
      startTimelineSegmentPlayback(segment, timelineFrame);
    } else {
      pausePreviewVideo(video);
      cameraVideo?.pause();
      video.playbackRate = timelineRateRef.current;
      if (cameraVideo) cameraVideo.playbackRate = timelineRateRef.current;
      activeTimelineSegmentRef.current = null;
      previewInteractionDirtyRef.current = true;
    }
  }, [timeMode, isPlaying, project, fps]);

  function startTimelineSegmentPlayback(segment: TimelinePlaybackSegment, timelineFrame: number) {
    const video = videoRef.current;
    const cameraVideo = cameraVideoRef.current;
    if (!video) return;
    activeTimelineSegmentRef.current = segment;
    timelineFrameFallbackRef.current = timelineFrame;
    const sourceFrame = segment.sourceIn + (timelineFrame - segment.timelineIn);
    const sourceTime = Math.max(0, sourceFrame / fps);
    video.volume = timelineJoinGain(
      buildTimelinePlaybackSegments(),
      segment,
      timelineFrame,
    );
    (window as unknown as Record<string, unknown>).__roughCutTimelinePlaybackDebug = {
      phase: 'play-start',
      timelineFrame,
      sourceFrame,
      sourceTime,
      segment,
    };
    if (Math.abs(video.currentTime - sourceTime) > Math.max(0.04, 1 / fps)) {
      seekingRef.current = true;
      video.currentTime = sourceTime;
    }
    syncCameraTime(sourceTime);
    video.playbackRate = timelineRateRef.current;
    if (cameraVideo) cameraVideo.playbackRate = timelineRateRef.current;
    claimAudiblePreviewVideo(video);
    void video.play().catch(() => undefined);
    void cameraVideo?.play().catch(() => undefined);
  }

  function flushPendingExternalSeek() {
    const video = videoRef.current;
    if (!video) return;
    const requestedTime = pendingSeekRef.current;
    if (requestedTime === null) {
      seekingRef.current = false;
      return;
    }
    const maxTime = video.duration || requestedTime;
    const timelineSourceTime = timeMode === 'timeline' ? timelineTimeToSourceTime(requestedTime) : null;
    const requestedSourceTime = timeMode === 'timeline'
      ? timelineSourceTime
      : visibleTimeToSourceTime(requestedTime);
    pendingSeekRef.current = null;
    if (requestedSourceTime === null) {
      updateCurrentTime(Math.max(0, requestedTime), { immediate: true });
      seekingRef.current = false;
      previewInteractionDirtyRef.current = true;
      return;
    }
    const nextTime = Math.max(trimStartSec, Math.min(requestedSourceTime, Math.min(effectiveTrimEndSec, maxTime)));
    if (Math.abs(video.currentTime - nextTime) < 0.05) {
      const nextDisplayTime = timeMode === 'timeline' ? Math.max(0, requestedTime) : sourceTimeToVisibleTime(nextTime);
      updateCurrentTime(nextDisplayTime, { immediate: true });
      seekingRef.current = false;
      return;
    }
    seekingRef.current = true;
    video.currentTime = nextTime;
    syncCameraTime(nextTime);
    const nextDisplayTime = timeMode === 'timeline' ? Math.max(0, requestedTime) : sourceTimeToVisibleTime(nextTime);
    updateCurrentTime(nextDisplayTime, { immediate: true });
  }

  function handleSeekSettled() {
    if (pendingSeekRef.current !== null) {
      flushPendingExternalSeek();
      return;
    }
    seekingRef.current = false;
  }

  // `cutRanges` arrives as a fresh array reference on every render (the parent
  // builds it inline), which would re-run the render-loop effect every frame
  // during playback — cancelling and restarting requestAnimationFrame on each
  // frame and making zoom playback stutter. Depend on a content key instead so
  // the loop only restarts when the cut ranges actually change.
  const cutRangesKey = JSON.stringify(cutRanges);

  // Same reasoning as cutRangesKey: the split arrays are rebuilt on every render,
  // so identity says nothing. Compare content, and hand the loop the new stack
  // through refs rather than restarting it.
  // An overlay layer's decoder finishing a frame is not a timeline event, so
  // nothing else would repaint a parked playhead with the picture that just
  // became available.
  const markOverlayLayerDirty = React.useCallback(() => {
    previewInteractionDirtyRef.current = true;
  }, []);

  const overlayLayersKey = JSON.stringify([overlayLayersAbove, overlayLayersBelow, recordingAbsent]);
  React.useEffect(() => {
    overlayLayersAboveRef.current = overlayLayersAbove;
    overlayLayersBelowRef.current = overlayLayersBelow;
    recordingAbsentRef.current = recordingAbsent;
    // A layer added, moved between tracks or removed in the Editor has to show
    // immediately, including while the playhead is parked — without this the
    // paused frame is considered already drawn and the change appears only
    // after the next seek or playback.
    previewInteractionDirtyRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- content key, see above
  }, [overlayLayersKey]);

  React.useEffect(() => {
    const video = videoRef.current;
    const cameraVideo = cameraVideoRef.current;
    const canvas = canvasRef.current;
    const webglCanvas = webglCanvasRef.current;
    if (!video || !canvas) return undefined;
    const screenVideo = video;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      publishScreenLayerRendererStats({
        requestedRendererKind: requestedScreenLayerRendererKind,
        rendererKind: 'canvas2d',
        contextStatus: 'missing-context',
        drawCostMs: null,
        drawCount: 0,
        fallbackReason: '2d-context-unavailable',
      });
      return undefined;
    }
    if (screenLayerRendererRef.current && screenLayerRendererRef.current.kind !== requestedScreenLayerRendererKind) {
      screenLayerRendererRef.current.dispose();
      screenLayerRendererRef.current = null;
    }
    const screenLayerRenderer = screenLayerRendererRef.current ?? createScreenLayerRenderer(requestedScreenLayerRendererKind);
    screenLayerRendererRef.current = screenLayerRenderer;

    const canvasWidth = canvasResolution.width;
    const canvasHeight = canvasResolution.height;
    if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
    if (canvas.height !== canvasHeight) canvas.height = canvasHeight;
    if (webglCanvas) {
      if (webglCanvas.width !== canvasWidth) webglCanvas.width = canvasWidth;
      if (webglCanvas.height !== canvasHeight) webglCanvas.height = canvasHeight;
    }
    if (!isAcceleratedScreenLayerRenderer(screenLayerRenderer.kind)) {
      screenLayerRenderer.resize(canvasWidth, canvasHeight);
    } else if (timeMode === 'timeline' && webglCanvas) {
      screenLayerRenderer.preparePresentationCanvas?.(webglCanvas, canvasWidth, canvasHeight);
      screenLayerRenderer.prepareBackgroundImage?.(backgroundImageRef.current);
    }
    publishScreenLayerRendererStats(screenLayerRenderer.getDebugStats());
    const screenPadding = Math.max(0, Math.min(background.bgPadding, Math.min(canvasWidth, canvasHeight) / 2 - 2));
    const maxVideoWidth = canvasWidth - screenPadding * 2;
    const maxVideoHeight = canvasHeight - screenPadding * 2;
    const screenScale = Math.min(maxVideoWidth / sourceWidth, maxVideoHeight / sourceHeight);
    const defaultScreenWidth = sourceWidth * screenScale;
    const defaultScreenHeight = sourceHeight * screenScale;
    const defaultScreenX = (canvasWidth - defaultScreenWidth) / 2;
    const defaultScreenY = (canvasHeight - defaultScreenHeight) / 2;

    let rafId = 0;
    let videoFrameCallbackId: number | null = null;
    let watchdogId: number | null = null;
    let lastTickAtMs: number | null = null;
    let lastExpectedDisplayTimeMs: number | null = null;
    let expectedDisplaySampleCount = 0;
    let lastDrawnFrame = -1;
    const renderLoopId = Math.random().toString(36).slice(2, 8);
    recordPlaybackDebug('render-loop-start', {
      renderLoopId,
      timeMode,
      isPlaying,
      canvasWidth,
      canvasHeight,
      timelineDuration,
    });
    const document = project.document as unknown as ProjectDocument;
    const cursorEvents = getCursorEvents(document);
    const recordingAssetId = getPrimaryRecordingAsset(document)?.id ?? null;
    const getCursorPositionForFrame = (assetId: string, frame: number) => {
      if (!recordingAssetId || assetId !== recordingAssetId) return null;
      const sourcePoint = cursorAtTimeMs(cursorEvents, (frame / fps) * 1000, fps);
      if (!sourcePoint) return null;
      return {
        x: sourcePoint.x / sourceWidth,
        y: sourcePoint.y / sourceHeight,
      };
    };

    const [backgroundStart, backgroundEnd] = getRecordingBackgroundColors(background);
    const snapPlaybackCoord = (value: number) => (timeMode === 'timeline' && isPlaying ? Math.round(value) : value);

    function resolveCurrentFrame(currentFrame: number): any {
      try {
        return timeMode === 'timeline'
          ? resolveTimelinePreviewFrame(document, currentFrame, { getCursorPosition: getCursorPositionForFrame })
          : resolveFrame(document, currentFrame, {
              getCursorPosition: getCursorPositionForFrame,
            });
      } catch {
        return { cameraTransform: { scale: 1, offsetX: 0, offsetY: 0 } };
      }
    }

    const acceleratedTimelinePlaybackClock = timeMode === 'timeline' && isPlaying && isAcceleratedScreenLayerRenderer(screenLayerRenderer.kind);

    function scheduleNextDraw() {
      if (!acceleratedTimelinePlaybackClock && timeMode === 'timeline' && isPlaying && activeTimelineSegmentRef.current && typeof screenVideo.requestVideoFrameCallback === 'function') {
        videoFrameCallbackId = screenVideo.requestVideoFrameCallback((now, metadata) => {
          clearDrawWatchdog();
          tick(now, metadata);
        });
        // rVFC fires only while the video presents new frames. A decode
        // stall or media end would otherwise leave the loop parked forever
        // with isPlaying stuck true (2026-07-19: playback wedged mid-video
        // and at the tail of every camera recording). The watchdog re-enters
        // tick so hold/boundary logic still runs and the loop survives.
        watchdogId = window.setTimeout(() => {
          watchdogId = null;
          if (videoFrameCallbackId !== null && typeof screenVideo.cancelVideoFrameCallback === 'function') {
            screenVideo.cancelVideoFrameCallback(videoFrameCallbackId);
          }
          videoFrameCallbackId = null;
          tick();
        }, PLAYBACK_DRAW_WATCHDOG_MS);
        return;
      }
      rafId = window.requestAnimationFrame((now) => tick(now));
    }

    function clearDrawWatchdog() {
      if (watchdogId !== null) {
        window.clearTimeout(watchdogId);
        watchdogId = null;
      }
    }

    function cancelScheduledDraw() {
      if (rafId) window.cancelAnimationFrame(rafId);
      clearDrawWatchdog();
      if (videoFrameCallbackId !== null && typeof screenVideo.cancelVideoFrameCallback === 'function') {
        screenVideo.cancelVideoFrameCallback(videoFrameCallbackId);
      }
      videoFrameCallbackId = null;
    }

    function seekTimelineBoundary(nextSegment: TimelinePlaybackSegment) {
      const sourceTime = Math.max(0, nextSegment.sourceIn / fps);
      recordPlaybackDebug('timeline-boundary-seek', {
        renderLoopId,
        timelineIn: nextSegment.timelineIn,
        timelineOut: nextSegment.timelineOut,
        sourceIn: nextSegment.sourceIn,
        sourceTime,
      });
      activeTimelineSegmentRef.current = nextSegment;
      timelineFrameFallbackRef.current = nextSegment.timelineIn;
      seekingRef.current = true;
      screenVideo.currentTime = sourceTime;
      syncCameraTime(sourceTime);
      // After media `ended` the element is paused; a boundary seek must
      // resume playback or the next segment would freeze on its first frame.
      if (screenVideo.paused) void screenVideo.play().catch(() => undefined);
      if (cameraVideo && cameraVideo.paused) void cameraVideo.play().catch(() => undefined);
      updateCurrentTime(nextSegment.timelineIn / fps, { immediate: true });
      lastExpectedDisplayTimeMs = null;
      expectedDisplaySampleCount = 0;
      lastDrawnFrame = -1;
      return true;
    }

    function enterTimelineGapAfterSegment(segment: TimelinePlaybackSegment) {
      const gapFrame = segment.timelineOut;
      recordPlaybackDebug('timeline-gap-enter', {
        renderLoopId,
        timelineOut: segment.timelineOut,
        nextSegment: nextTimelineSegmentAfterFrame(buildTimelinePlaybackSegments(), gapFrame),
      });
      activeTimelineSegmentRef.current = null;
      timelineFrameFallbackRef.current = gapFrame;
      pausePreviewVideo(screenVideo);
      cameraVideo?.pause();
      updateCurrentTime(gapFrame / fps, { immediate: true });
      lastExpectedDisplayTimeMs = null;
      expectedDisplaySampleCount = 0;
      lastDrawnFrame = -1;
      return {
        segment: null,
        timelineFrame: gapFrame,
        timelineGap: true,
      };
    }

    function holdTimelineSegmentEnd(segment: TimelinePlaybackSegment) {
      const holdFrame = Math.max(segment.timelineIn, segment.timelineOut - 1);
      recordPlaybackDebug('timeline-segment-end', {
        renderLoopId,
        timelineIn: segment.timelineIn,
        timelineOut: segment.timelineOut,
        holdFrame,
      });
      activeTimelineSegmentRef.current = null;
      timelineFrameFallbackRef.current = holdFrame;
      pausePreviewVideo(screenVideo);
      cameraVideo?.pause();
      updateCurrentTime(segment.timelineOut / fps, { immediate: true });
      setInternalPlaying(false);
      onPlayingChangeRef.current?.(false);
      return {
        segment,
        timelineFrame: holdFrame,
      };
    }

    function handleTimelineDecodedFrame(decodedSourceFrame: number) {
      let segment = activeTimelineSegmentRef.current;
      const segments = buildTimelinePlaybackSegments();
      if (!segment || decodedSourceFrame < segment.sourceIn || decodedSourceFrame >= segment.sourceOut) {
        const currentTimelineFrame = segment
          ? segment.timelineOut
          : Math.max(0, Math.round(currentTimeRef.current * fps));
        if (segment && decodedSourceFrame >= segment.sourceOut) {
          const nextSegment = nextTimelineSegmentAfterFrame(segments, currentTimelineFrame);
          if (nextSegment && nextSegment.timelineIn > segment.timelineOut) return enterTimelineGapAfterSegment(segment);
          if (!nextSegment) return holdTimelineSegmentEnd(segment);
          if (seekTimelineBoundary(nextSegment)) return null;
          segment = nextSegment;
        }
        const nextSegment = !segment
          ? timelineSegmentAtFrame(segments, currentTimelineFrame)
          : null;
        if (!nextSegment && segment) return holdTimelineSegmentEnd(segment);
        if (!nextSegment) return null;
        if (seekTimelineBoundary(nextSegment)) return null;
        segment = nextSegment;
      }
      return {
        segment,
        timelineFrame: timelineFrameForDecodedSourceFrame(segment, decodedSourceFrame),
      };
    }

    function tick(_now?: number, metadata?: RoughCutVideoFrameMetadata) {
      if (!video || !canvas || !ctx) return;
      const tickAtMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const tickDeltaMs = lastTickAtMs !== null ? tickAtMs - lastTickAtMs : 0;
      const tickDeltaSec = Math.max(0, Math.min(0.25, tickDeltaMs / 1000));
      if (lastTickAtMs !== null) {
        const deltaMs = tickDeltaMs;
        if (deltaMs > 50) {
          recordPlaybackDebug('render-frame-gap', {
            renderLoopId,
            deltaMs: Math.round(deltaMs * 10) / 10,
            timeMode,
            isPlaying,
            videoPaused: video.paused,
            videoSeeking: video.seeking,
            readyState: video.readyState,
            mediaTime: metadata?.mediaTime ?? null,
            expectedDisplayTime: metadata?.expectedDisplayTime ?? null,
            presentationTime: metadata?.presentationTime ?? null,
            presentedFrames: metadata?.presentedFrames ?? null,
            videoCurrentTime: video.currentTime,
            screenQuality: readPlaybackQuality(video),
            cameraQuality: readPlaybackQuality(cameraVideo),
          });
        }
      }
      lastTickAtMs = tickAtMs;
      if (acceleratedTimelinePlaybackClock && timeMode === 'timeline' && isPlaying && lastTickAtMs !== null && tickDeltaSec > 0) {
        let nextClockTime = Math.min(timelineDuration, currentTimeRef.current + tickDeltaSec * timelineRateRef.current);
        // Never let the free-running clock outrun the decoder: on a stall the
        // cursor/zoom would glide over a frozen frame. Park the clock at most
        // ~2 frames ahead of the video element's actual position instead.
        const clampSegment = activeTimelineSegmentRef.current;
        if (clampSegment && !video.paused && !video.ended && !video.seeking) {
          const videoTimelineSec = (clampSegment.timelineIn + (video.currentTime * fps - clampSegment.sourceIn)) / fps;
          const maxClockTime = videoTimelineSec + 2 / fps;
          if (nextClockTime > maxClockTime) nextClockTime = Math.max(currentTimeRef.current, maxClockTime);
        }
        if (nextClockTime > currentTimeRef.current) {
          updateCurrentTime(nextClockTime);
          timelineFrameFallbackRef.current = Math.max(0, Math.round(nextClockTime * fps));
        }
      }
      if (typeof metadata?.expectedDisplayTime === 'number') {
        const expectedDisplayWarmedUp = expectedDisplaySampleCount >= PLAYBACK_EXPECTED_DISPLAY_WARMUP_SAMPLES;
        if (lastExpectedDisplayTimeMs !== null && expectedDisplayWarmedUp) {
          const expectedGapMs = metadata.expectedDisplayTime - lastExpectedDisplayTimeMs;
          const expectedGapThresholdMs = Math.max(
            PLAYBACK_EXPECTED_DISPLAY_GAP_THRESHOLD_MS,
            (1000 / Math.max(1, fps)) * PLAYBACK_EXPECTED_DISPLAY_GAP_FRAME_MULTIPLIER,
          );
          if (expectedGapMs > expectedGapThresholdMs) {
            recordPlaybackDebug('render-expected-display-gap', {
              renderLoopId,
              expectedGapMs: Math.round(expectedGapMs * 10) / 10,
              expectedGapThresholdMs: Math.round(expectedGapThresholdMs * 10) / 10,
              mediaTime: metadata.mediaTime ?? null,
              expectedDisplayTime: metadata.expectedDisplayTime,
              presentationTime: metadata.presentationTime ?? null,
              presentedFrames: metadata.presentedFrames ?? null,
              screenQuality: readPlaybackQuality(video),
              cameraQuality: readPlaybackQuality(cameraVideo),
            });
          }
        }
        lastExpectedDisplayTimeMs = metadata.expectedDisplayTime;
        expectedDisplaySampleCount += 1;
      }
      const parkedTimelineFrame = timeMode === 'timeline' && !isPlaying
        ? Math.max(0, Math.round(currentTimeRef.current * fps))
        : null;
      const parkedTimelinePreviewFrame = parkedTimelineFrame !== null ? resolveCurrentFrame(parkedTimelineFrame) : null;
      const parkedTimelineGap = Boolean(
        parkedTimelinePreviewFrame && !(parkedTimelinePreviewFrame.layers?.find((layer: { isCamera?: boolean }) => !layer.isCamera) ?? null),
      );
      if (!parkedTimelineGap && (video.seeking || video.readyState < 2)) {
        recordPlaybackDebug('render-skip-video-not-ready', {
          renderLoopId,
          videoSeeking: video.seeking,
          readyState: video.readyState,
          videoCurrentTime: video.currentTime,
        });
        scheduleNextDraw();
        return;
      }
      if (seekingRef.current) {
        recordPlaybackDebug('render-skip-pending-seek', {
          renderLoopId,
          videoCurrentTime: video.currentTime,
        });
        scheduleNextDraw();
        return;
      }
      if (
        cameraVideo &&
        cameraSrc &&
        cameraVideo.seeking &&
        cameraCoversSourceTime(video.currentTime, cameraSourceOffsetSec, cameraVideo.duration, fps)
      ) {
        recordPlaybackDebug('render-skip-camera-seeking', {
          renderLoopId,
          cameraCurrentTime: cameraVideo.currentTime,
          videoCurrentTime: video.currentTime,
        });
        scheduleNextDraw();
        return;
      }
      const timelineClockFrame = timeMode === 'timeline' && isPlaying
        ? Math.max(0, Math.round(currentTimeRef.current * fps))
        : null;
      const timelineClockSegments = timelineClockFrame !== null ? buildTimelinePlaybackSegments() : [];
      const activeClockSegment = timelineClockFrame !== null
        ? timelineSegmentAtFrame(timelineClockSegments, timelineClockFrame)
        : null;
      const nextClockSegment = timelineClockFrame !== null
        ? nextTimelineSegmentAfterFrame(timelineClockSegments, timelineClockFrame)
        : null;
      const timelineClockGapFrame = timelineClockFrame !== null && !activeClockSegment && nextClockSegment && timelineClockFrame < nextClockSegment.timelineIn
        ? timelineClockFrame
        : null;
      if (timelineClockGapFrame !== null) {
        activeTimelineSegmentRef.current = null;
        timelineFrameFallbackRef.current = timelineClockGapFrame;
        pausePreviewVideo(screenVideo);
        cameraVideo?.pause();
      }
      const sourceTime = timeMode === 'timeline' && acceleratedTimelinePlaybackClock && activeClockSegment && timelineClockFrame !== null
        ? Math.max(0, (activeClockSegment.sourceIn + (timelineClockFrame - activeClockSegment.timelineIn)) / fps)
        : timeMode === 'timeline' && Number.isFinite(metadata?.mediaTime)
        ? Number(metadata?.mediaTime)
        : video.currentTime;
      const sourceFrameFloat = Math.max(0, sourceTime * fps);
      const sourceFrame = Math.max(0, Math.round(sourceFrameFloat));
      if (acceleratedTimelinePlaybackClock && activeClockSegment && !sameTimelinePlaybackSegment(activeTimelineSegmentRef.current, activeClockSegment)) {
        startTimelineSegmentPlayback(activeClockSegment, timelineClockFrame ?? activeClockSegment.timelineIn);
        scheduleNextDraw();
        return;
      }
      if (timeMode === 'timeline' && isPlaying && !activeTimelineSegmentRef.current && timelineClockGapFrame === null) {
        const segments = timelineClockSegments.length > 0 ? timelineClockSegments : buildTimelinePlaybackSegments();
        let timelineFrame = Math.max(0, Math.round(currentTimeRef.current * fps));
        let segmentAtClock = timelineSegmentAtFrame(segments, timelineFrame);
        if (!segmentAtClock) {
          const nextSegment = nextTimelineSegmentAfterFrame(segments, timelineFrame);
          if (nextSegment) {
            const gapTime = Math.min(nextSegment.timelineIn / fps, currentTimeRef.current + tickDeltaSec * timelineRateRef.current);
            if (gapTime > currentTimeRef.current) {
              updateCurrentTime(gapTime);
              timelineFrameFallbackRef.current = Math.max(0, Math.round(gapTime * fps));
            }
            timelineFrame = Math.max(0, Math.round(currentTimeRef.current * fps));
            segmentAtClock = timelineSegmentAtFrame(segments, timelineFrame);
          }
        }
        if (segmentAtClock) {
          startTimelineSegmentPlayback(segmentAtClock, timelineFrame);
          scheduleNextDraw();
          return;
        }
      }
      // Media `ended` mid-timeline (camera recordings run ~0.5-1 s shorter
      // than the wall-clock timeline length): force the boundary logic so
      // playback holds/advances instead of wedging with isPlaying stuck true.
      const endedTimelineSegment = timeMode === 'timeline' && isPlaying && screenVideo.ended && timelineClockGapFrame === null
        ? activeClockSegment ?? activeTimelineSegmentRef.current
        : null;
      const timelineDecoded = endedTimelineSegment
        ? handleTimelineDecodedFrame(endedTimelineSegment.sourceOut)
        : acceleratedTimelinePlaybackClock && activeClockSegment
        ? {
            segment: activeClockSegment,
            timelineFrame: timelineClockFrame ?? activeClockSegment.timelineIn,
          }
        : timelineClockGapFrame !== null
        ? null
        : timeMode === 'timeline' && isPlaying
        ? handleTimelineDecodedFrame(sourceFrame)
        : null;
      if (timeMode === 'timeline' && isPlaying && !timelineDecoded) {
        const timelineFrame = Math.max(0, Math.round(currentTimeRef.current * fps));
        const waitingForSegment = !activeTimelineSegmentRef.current && nextTimelineSegmentAfterFrame(buildTimelinePlaybackSegments(), timelineFrame);
        if (waitingForSegment) {
          timelineFrameFallbackRef.current = timelineFrame;
        } else {
          recordPlaybackDebug('render-skip-no-timeline-frame', {
            renderLoopId,
            sourceFrame,
            sourceTime,
            activeSegment: activeTimelineSegmentRef.current,
          });
          scheduleNextDraw();
          return;
        }
      }
      const playingGapFrame = timeMode === 'timeline' && isPlaying && !timelineDecoded && !activeTimelineSegmentRef.current
        ? timelineClockGapFrame ?? Math.max(0, Math.round(currentTimeRef.current * fps))
        : null;
      const currentFrame = timeMode === 'timeline'
        ? timelineDecoded?.timelineFrame ?? playingGapFrame ?? parkedTimelineFrame ?? Math.max(0, Math.round(currentTimeRef.current * fps))
        : sourceFrame;
      screenVideo.volume =
        timeMode === 'timeline' && timelineDecoded?.segment
          ? timelineJoinGain(
              buildTimelinePlaybackSegments(),
              timelineDecoded.segment,
              currentFrame,
            )
          : 1;
      const renderFrame = timeMode === 'timeline' && timelineDecoded
        ? timelineDecoded.timelineFrame + (sourceFrameFloat - sourceFrame)
        : playingGapFrame ?? parkedTimelineFrame ?? sourceFrameFloat;
      if (timeMode === 'timeline' && isPlaying) {
        timelineFrameFallbackRef.current = currentFrame;
        updateCurrentTime(Math.min(timelineDuration, currentFrame / fps), {
          immediate: playingGapFrame !== null,
        });
        (window as unknown as Record<string, unknown>).__roughCutTimelinePlaybackDebug = {
          phase: playingGapFrame !== null ? 'gap-frame' : 'decoded-frame',
          driver: metadata ? 'rvfc' : 'raf',
          renderLoopId,
          sourceFrame,
          sourceTime,
          currentFrame,
          segment: timelineDecoded?.segment ?? null,
          videoCurrentTime: video.currentTime,
        };
      }
      if (currentFrame === lastDrawnFrame && !previewInteractionDirtyRef.current && (timeMode !== 'timeline' || video.paused)) {
        scheduleNextDraw();
        return;
      }
      previewInteractionDirtyRef.current = false;
      lastDrawnFrame = currentFrame;
      (window as unknown as Record<string, number>).__roughCutCanvasDrawCount =
        ((window as unknown as Record<string, number>).__roughCutCanvasDrawCount ?? 0) + 1;
      if (timeMode !== 'timeline' && Number.isFinite(effectiveTrimEndSec) && video.currentTime > effectiveTrimEndSec + 0.02) {
        pausePreviewVideo(video);
        video.currentTime = effectiveTrimEndSec;
        const clampedVisibleTime = Math.max(0, effectiveTrimEndSec - trimStartSec);
        updateCurrentTime(clampedVisibleTime, { immediate: true });
      }
      const cutEnd = cutEndForSourceTime(video.currentTime);
      if (timeMode !== 'timeline' && cutEnd !== null) {
        video.currentTime = cutEnd;
        syncCameraTime(cutEnd);
        lastDrawnFrame = -1;
        scheduleNextDraw();
        return;
      }
      if (!video.paused && timeMode !== 'timeline') {
        const visibleTime = sourceTimeToVisibleTime(video.currentTime);
        updateCurrentTime(Math.min(visibleTime, visibleDuration));
      }
      const drawTimingEnabled = timeMode === 'timeline' && isPlaying;
      const drawTimings: Record<string, number> = {};
      const drawStartedAtMs = drawTimingEnabled && typeof performance !== 'undefined' ? performance.now() : 0;
      let drawPhaseStartedAtMs = drawStartedAtMs;
      const markDrawPhase = (name: string) => {
        if (!drawTimingEnabled || typeof performance === 'undefined') return;
        const nextAtMs = performance.now();
        drawTimings[name] = Math.round((nextAtMs - drawPhaseStartedAtMs) * 10) / 10;
        drawPhaseStartedAtMs = nextAtMs;
      };
      const frame = parkedTimelineFrame !== null && parkedTimelinePreviewFrame
        ? parkedTimelinePreviewFrame
        : resolveCurrentFrame(renderFrame);
      const activeTimelinePlayback = timeMode === 'timeline' && isPlaying;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = activeTimelinePlayback ? 'low' : 'high';
      const screenLayer = frame.layers?.find((layer: { isCamera?: boolean }) => !layer.isCamera) ?? null;
      const { scale, offsetX, offsetY } = frame.cameraTransform ?? { scale: 1, offsetX: 0, offsetY: 0 };
      const previousMotionFrame = resolveCurrentFrame(Math.max(0, renderFrame - 1));
      const nextMotionFrame = resolveCurrentFrame(renderFrame + 1);
      const acceleratedTimelineFrameCompositor = activeTimelinePlayback && isAcceleratedScreenLayerRenderer(screenLayerRenderer.kind);
      const zoomMotionBlurPx = resolveZoomMotionBlurPx({
        previous: previousMotionFrame.cameraTransform,
        current: frame.cameraTransform ?? { scale: 1, offsetX: 0, offsetY: 0 },
        next: nextMotionFrame.cameraTransform,
        sourceWidth,
        sourceHeight,
        reducedMotion: (activeTimelinePlayback && !acceleratedTimelineFrameCompositor) || (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
      });
      const dragScreenRect = screenDragRef.current;
      const resolvedScreenFrame = dragScreenRect
        ? { x: dragScreenRect.x * canvasWidth, y: dragScreenRect.y * canvasHeight, w: dragScreenRect.w * canvasWidth, h: dragScreenRect.h * canvasHeight }
        : resolveScreenFrame(frame.screenFrame, defaultScreenX, defaultScreenY, defaultScreenWidth, defaultScreenHeight, canvasWidth, canvasHeight);
      const screenSource = resolveScreenSourceViewport(sourceWidth, sourceHeight, frame.screenCrop);
      const screenDrawScale = Math.min(resolvedScreenFrame.w / screenSource.w, resolvedScreenFrame.h / screenSource.h);
      const screenWidth = snapPlaybackCoord(screenSource.w * screenDrawScale);
      const screenHeight = snapPlaybackCoord(screenSource.h * screenDrawScale);
      const screenX = snapPlaybackCoord(resolvedScreenFrame.x + (resolvedScreenFrame.w - screenWidth) / 2);
      const screenY = snapPlaybackCoord(resolvedScreenFrame.y + (resolvedScreenFrame.h - screenHeight) / 2);
      const effectiveScreenDrawScale = screenWidth / screenSource.w;
      const screenRadius = Math.max(0, Math.min(background.bgCornerRadius, Math.min(screenWidth, screenHeight) / 2));
      screenRectRef.current = { x: screenX, y: screenY, w: screenWidth, h: screenHeight };
      screenRadiusRef.current = screenRadius;
      markDrawPhase('resolve-layout');
      if (acceleratedTimelineFrameCompositor) {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      } else {
        const backgroundLayerStats = screenLayerRenderer.drawBackground({
          ctx,
          canvasWidth,
          canvasHeight,
          startColor: backgroundStart,
          endColor: backgroundEnd,
          image: backgroundImageRef.current,
        });
        publishScreenLayerRendererStats(backgroundLayerStats);
      }
      if (!activeTimelinePlayback && editablePreview && alignmentGridVisibleRef.current) {
        drawAlignmentGrid(ctx, canvasWidth, canvasHeight);
      }
      // Layers on tracks BELOW the recording. Track order is z-order, and the
      // recording is just another clip on a track — it is not automatically
      // on top of or underneath anything.
      drawEditorOverlayLayers(ctx, canvasWidth, canvasHeight, overlayLayersBelowRef.current, renderFrame, editorLayerMediaRef.current, 'below', markOverlayLayerDirty, activeTimelinePlayback);
      markDrawPhase('background');
      // Empty timeline position: either this view's own resolver found no clip,
      // or the Editor placed the recording somewhere that does not cover the
      // playhead. Either way there is no recording to draw here — the frame is
      // empty and only the other tracks have anything to say.
      if ((timeMode === 'timeline' && !screenLayer) || recordingAbsentRef.current) {
        publishCursorOffscreenStatus(null);
        // Black, not the styled backdrop. The background is part of how the
        // recording is presented; where the recording does not reach there is no
        // presentation either, and an empty timeline position reads as black in
        // every editor. Painted over whatever the background pass just drew.
        ctx.save();
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        ctx.restore();
        // Both groups draw over the empty frame — a clip in a gap is visible
        // whichever track it is on — and the black fill above just erased the
        // below pass, so it is repeated here. Order between them still holds.
        drawEditorOverlayLayers(ctx, canvasWidth, canvasHeight, overlayLayersBelowRef.current, renderFrame, editorLayerMediaRef.current, 'below', markOverlayLayerDirty, activeTimelinePlayback);
        drawEditorOverlayLayers(ctx, canvasWidth, canvasHeight, overlayLayersAboveRef.current, renderFrame, editorLayerMediaRef.current, 'above', markOverlayLayerDirty, activeTimelinePlayback);
        // Keep the focus target visible/draggable even over a timeline gap,
        // anchored to the last-known screen rect.
        const gapFocal = selectedZoomFocalRef.current;
        const gapRect = screenRectRef.current;
        if (!activeTimelinePlayback && gapFocal && gapRect) {
          const live = focalDragRef.current ?? { x: gapFocal.x, y: gapFocal.y };
          drawFocalTarget(ctx, gapRect.x + live.x * gapRect.w, gapRect.y + live.y * gapRect.h, focalTargetRadius(canvasWidth, canvasHeight), isDraggingFocalRef.current);
        }
        scheduleNextDraw();
        return;
      }
      const resolvedCursor = frame.cursor;
      const cursorFrame = timeMode === 'timeline' ? screenLayer?.sourceFrame ?? renderFrame : renderFrame;
      const cursorPos = cursorAtTimeMs(cursorEvents, (cursorFrame / fps) * 1000, fps);
      const cursorBounds = getCursorBoundsStatus(cursorPos, sourceWidth, sourceHeight);
      const nextOffscreen = cursorBounds && !cursorBounds.inside
        ? { side: cursorBounds.side as 'left' | 'right' | 'top' | 'bottom', distance: cursorBounds.distance }
        : null;
      publishCursorOffscreenStatus(nextOffscreen);
      const zoomSafety = !activeTimelinePlayback && selectedZoomFocalRef.current
        ? resolveZoomAuthoringSafety({ sourceWidth, sourceHeight, scale, offsetX, offsetY, cursor: cursorPos })
        : null;
      const cameraHasFrame = Boolean(
        cameraVideo &&
        cameraSrc &&
        cameraVideo.readyState >= 2 &&
        frame.cameraPresentation?.visible !== false &&
        cameraCoversSourceTime((screenLayer?.sourceFrame ?? sourceFrame) / fps, cameraSourceOffsetSec, cameraVideo.duration, fps),
      );
      let cameraFrameForDraw: { x: number; y: number; w: number; h: number } | null = null;
      let cameraSourceForDraw: { sx: number; sy: number; sw: number; sh: number } | null = null;
      let cameraRadiusForDraw = 0;
      if (cameraHasFrame && cameraVideo) {
        const expectedCameraTime = clampedCameraTime((screenLayer?.sourceFrame ?? sourceFrame) / fps, cameraSourceOffsetSec, cameraVideo.duration, fps);
        if (timeMode !== 'timeline' && Math.abs(cameraVideo.currentTime - expectedCameraTime) > Math.max(0.12, 2 / fps)) {
          cameraVideo.currentTime = expectedCameraTime;
          lastDrawnFrame = -1;
          scheduleNextDraw();
          return;
        }
        const dragRect = cameraDragRef.current;
        const rawCameraFrame = constrainCameraShapeFrame(dragRect
          ? { x: dragRect.x * canvasWidth, y: dragRect.y * canvasHeight, w: dragRect.w * canvasWidth, h: dragRect.h * canvasHeight }
          : resolveCameraFrame(frame.cameraFrame, frame.cameraPresentation, canvasWidth, canvasHeight), frame.cameraPresentation, canvasWidth, canvasHeight);
        cameraFrameForDraw = activeTimelinePlayback
          ? {
              x: Math.round(rawCameraFrame.x),
              y: Math.round(rawCameraFrame.y),
              w: Math.round(rawCameraFrame.w),
              h: Math.round(rawCameraFrame.h),
            }
          : rawCameraFrame;
        cameraRectRef.current = cameraFrameForDraw;
        (window as unknown as Record<string, unknown>).__roughCutCanvasCameraRect = {
          x: cameraFrameForDraw.x / canvasWidth,
          y: cameraFrameForDraw.y / canvasHeight,
          w: cameraFrameForDraw.w / canvasWidth,
          h: cameraFrameForDraw.h / canvasHeight,
        };
        (window as unknown as Record<string, boolean>).__roughCutCameraFramePresent = true;
        cameraRadiusForDraw = resolveCameraRadius(frame.cameraPresentation, cameraFrameForDraw);
        cameraRadiusRef.current = cameraRadiusForDraw;
        cameraSourceForDraw = resolveCameraSourceRect(
          cameraVideo.videoWidth,
          cameraVideo.videoHeight,
          cameraFrameForDraw.w,
          cameraFrameForDraw.h,
          frame.cameraCrop,
        );
      } else {
        cameraRectRef.current = null;
        (window as unknown as Record<string, unknown>).__roughCutCanvasCameraRect = null;
        (window as unknown as Record<string, boolean>).__roughCutCameraFramePresent = false;
      }
      // Recorded on every draw so a pointer press inverts the transform that
      // actually produced the visible frame, not a stale one from before a zoom.
      const publishCensorMapping = () => {
        censorMappingRef.current = {
          screenX,
          screenY,
          screenDrawScale: effectiveScreenDrawScale,
          screenSource,
          transform: frame.cameraTransform ?? { scale: 1, offsetX: 0, offsetY: 0 },
          sourceWidth,
          sourceHeight,
        };
      };
      // Handles for the selected censor, in CANVAS space and outside the source
      // transform, so they keep a constant on-screen size at any zoom. Hidden during
      // playback, matching the camera and screen frame controls.
      const publishCensorHandles = () => {
        // While dragging, follow the live rect so the handles track the pointer
        // instead of lagging a document round-trip behind. Otherwise take the
        // resolved position: for a censor that follows moving content, its own
        // `rect` is not where it is drawn, and handles parked away from the box
        // would grab nothing.
        censorSourceFrameRef.current = frame.censorSourceFrame ?? 0;
        const sourceRect = censorDragRectRef.current
          ?? resolveCensorRectAtFrame(selectedCensor, censorSourceFrameRef.current)
          ?? null;
        const rect = sourceRect ? sourceRectToCanvasRect(censorMappingRef.current, sourceRect) : null;
        censorHandleRectRef.current = rect;
        if (rect && !activeTimelinePlayback && onCensorRectChange) {
          drawEditorFrameControls(ctx, rect, '#93c5fd');
        }
      };
      if (acceleratedTimelineFrameCompositor) {
        try {
          const frameStats = screenLayerRenderer.drawFrame({
            background: {
              ctx,
              canvasWidth,
              canvasHeight,
              startColor: backgroundStart,
              endColor: backgroundEnd,
              image: backgroundImageRef.current,
            },
            screen: {
              ctx,
              video,
              canvasWidth,
              canvasHeight,
              screenX,
              screenY,
              screenDrawScale: effectiveScreenDrawScale,
              screenSource,
              sourceWidth,
              sourceHeight,
              transform: frame.cameraTransform ?? { scale: 1, offsetX: 0, offsetY: 0 },
              previousTransform: previousMotionFrame.cameraTransform,
              nextTransform: nextMotionFrame.cameraTransform,
              blurPx: zoomMotionBlurPx,
              sharpZoom: false,
            },
            cursor: {
              ctx,
              canvasWidth,
              canvasHeight,
              sourceWidth,
              sourceHeight,
              screenX,
              screenY,
              screenDrawScale: effectiveScreenDrawScale,
              screenSource,
              transform: frame.cameraTransform ?? { scale: 1, offsetX: 0, offsetY: 0 },
              cursorEvents,
              cursorFrame,
              cursorPosition: cursorPos,
              cursorInside: cursorBounds?.inside !== false,
              clickEffect: resolvedCursor?.clickEffect ?? 'ring',
              visible: resolvedCursor?.visible !== false,
              style: resolvedCursor?.style ?? 'default',
              sizePercent: resolvedCursor?.sizePercent ?? 100,
            },
            camera: cameraVideo && cameraFrameForDraw && cameraSourceForDraw
              ? {
                  video: cameraVideo,
                  frame: cameraFrameForDraw,
                  source: cameraSourceForDraw,
                  sourceWidth: cameraVideo.videoWidth,
                  sourceHeight: cameraVideo.videoHeight,
                  radius: cameraRadiusForDraw,
                  presentation: frame.cameraPresentation,
                  shadow: false,
                }
              : null,
            presentationCanvas: webglCanvas,
          });
          publishScreenLayerRendererStats(frameStats);
        } catch {
          publishScreenLayerRendererStats(screenLayerRenderer.getDebugStats());
          scheduleNextDraw();
          return;
        }
        // Censors must be painted on every path that can reach the screen. This is
        // the accelerated compositor path; the Canvas2D path below has its own
        // call. Both are asserted by styled-video-preview.test.mjs — if you add a
        // third draw path, it needs a censor draw too.
        drawCensorRegions({
          ctx,
          video,
          regions: frame.censorRegions,
          // Recording frame, not the timeline frame: keyframed censors are
          // positioned in recording frames and the two diverge after a cut.
          frame: frame.censorSourceFrame ?? 0,
          draftRect: censorDraftRect,
          sourceWidth,
          sourceHeight,
          screenX,
          screenY,
          screenWidth,
          screenHeight,
          screenRadius,
          screenDrawScale: effectiveScreenDrawScale,
          screenSource,
          transform: frame.cameraTransform ?? { scale: 1, offsetX: 0, offsetY: 0 },
        });
        publishCensorMapping();
        publishCensorHandles();
        markDrawPhase('censor');
        if (nextOffscreen) {
          drawCursorOffscreenMarker(ctx, nextOffscreen, cursorPos, {
            screenX,
            screenY,
            screenWidth,
            screenHeight,
            screenDrawScale: effectiveScreenDrawScale,
            sourceWidth,
            sourceHeight,
            scale,
            offsetX,
            offsetY,
          });
        }
        // The accelerated compositor draws the entire recording — screen, cursor
        // and camera PiP — in one call, and this branch returns before the
        // Canvas2D path below. Without this the layers a user added in the
        // Editor disappear the moment playback goes accelerated.
        drawEditorOverlayLayers(ctx, canvasWidth, canvasHeight, overlayLayersAboveRef.current, renderFrame, editorLayerMediaRef.current, 'above', markOverlayLayerDirty, activeTimelinePlayback);
        markDrawPhase('accelerated-frame');
        publishResolvedLayout(resolvedScreenFrame, cameraRectRef.current, canvasWidth, canvasHeight);
        markDrawPhase('layout-publish-overlays');
        if (drawTimingEnabled && typeof performance !== 'undefined') {
          const totalDrawMs = Math.round((performance.now() - drawStartedAtMs) * 10) / 10;
          if (totalDrawMs > PLAYBACK_DRAW_COST_LOG_THRESHOLD_MS) {
            recordPlaybackDebug('render-draw-cost', {
              renderLoopId,
              totalDrawMs,
              phases: drawTimings,
              frame: currentFrame,
              sourceFrame,
              mediaTime: metadata?.mediaTime ?? null,
              expectedDisplayTime: metadata?.expectedDisplayTime ?? null,
              screenQuality: readPlaybackQuality(video),
              cameraQuality: readPlaybackQuality(cameraVideo),
              hasCameraFrame: Boolean(cameraFrameForDraw),
              screenScale: Math.round(scale * 1000) / 1000,
              canvasWidth,
              canvasHeight,
            });
          }
        }
        scheduleNextDraw();
        return;
      }
      if (!activeTimelinePlayback && background.bgShadowEnabled && background.bgShadowOpacity > 0 && background.bgShadowBlur > 0) {
        ctx.save();
        const shadowBlur = Math.max(0, background.bgShadowBlur);
        const shadowOpacity = Math.min(0.8, Math.max(0, background.bgShadowOpacity));
        const shadowOffsetY = Math.max(0, background.bgShadowOffsetY ?? DEFAULT_RECORDING_BACKGROUND.bgShadowOffsetY ?? 34);
        const shadowOffsetX = background.bgShadowOffsetX ?? 0;
        ctx.shadowColor = `rgba(0, 0, 0, ${shadowOpacity})`;
        ctx.shadowBlur = shadowBlur;
        ctx.shadowOffsetY = shadowOffsetY;
        ctx.shadowOffsetX = shadowOffsetX;
        ctx.fillStyle = '#000';
        addRoundedRect(ctx, screenX, screenY, screenWidth, screenHeight, screenRadius);
        ctx.fill();
        ctx.restore();
      }
      if (background.bgInset > 0) {
        ctx.save();
        ctx.lineWidth = background.bgInset;
        ctx.strokeStyle = background.bgInsetColor || 'rgba(255, 255, 255, 0.22)';
        addRoundedRect(ctx, screenX, screenY, screenWidth, screenHeight, screenRadius);
        ctx.stroke();
        ctx.restore();
      }
      if (!activeTimelinePlayback && onScreenFrameChange) drawEditorFrameControls(ctx, screenRectRef.current, '#38bdf8');
      markDrawPhase('screen-decoration');
      ctx.save();
      addRoundedRect(ctx, screenX, screenY, screenWidth, screenHeight, screenRadius);
      ctx.clip();
      try {
        const screenLayerStats = screenLayerRenderer.draw({
          ctx,
          video,
          canvasWidth,
          canvasHeight,
          screenX,
          screenY,
          screenDrawScale: effectiveScreenDrawScale,
          screenSource,
          sourceWidth,
          sourceHeight,
          transform: frame.cameraTransform ?? { scale: 1, offsetX: 0, offsetY: 0 },
          previousTransform: previousMotionFrame.cameraTransform,
          nextTransform: nextMotionFrame.cameraTransform,
          blurPx: zoomMotionBlurPx,
          sharpZoom: timeMode !== 'timeline' && !activeTimelinePlayback,
        });
        publishScreenLayerRendererStats(screenLayerStats);
      } catch {
        publishScreenLayerRendererStats(screenLayerRenderer.getDebugStats());
        ctx.restore();
        scheduleNextDraw();
        return;
      }
      markDrawPhase('screen-video');
      // Censors go on before the cursor, so the cursor stays visible on top of a
      // censored area. The accelerated compositor path above has its own call —
      // both are asserted by styled-video-preview.test.mjs.
      drawCensorRegions({
        ctx,
        video,
        regions: frame.censorRegions,
        // Recording frame, not the timeline frame: keyframed censors are
        // positioned in recording frames and the two diverge after a cut.
        frame: frame.censorSourceFrame ?? 0,
        draftRect: censorDraftRect,
        sourceWidth,
        sourceHeight,
        screenX,
        screenY,
        screenWidth,
        screenHeight,
        screenRadius,
        screenDrawScale: effectiveScreenDrawScale,
        screenSource,
        transform: frame.cameraTransform ?? { scale: 1, offsetX: 0, offsetY: 0 },
      });
      publishCensorMapping();
      publishCensorHandles();
      markDrawPhase('censor');
      ctx.save();
      applyScreenSourceTransform(ctx, {
        screenX,
        screenY,
        screenDrawScale: effectiveScreenDrawScale,
        screenSource,
        transform: frame.cameraTransform ?? { scale: 1, offsetX: 0, offsetY: 0 },
      });
      const cursorLayerStats = screenLayerRenderer.drawCursorOverlay({
        ctx,
        canvasWidth,
        canvasHeight,
        sourceWidth,
        sourceHeight,
        screenX,
        screenY,
        screenDrawScale: effectiveScreenDrawScale,
        screenSource,
        transform: frame.cameraTransform ?? { scale: 1, offsetX: 0, offsetY: 0 },
        cursorEvents,
        cursorFrame,
        cursorPosition: cursorPos,
        cursorInside: cursorBounds?.inside !== false,
        clickEffect: resolvedCursor?.clickEffect ?? 'ring',
        visible: resolvedCursor?.visible !== false,
        style: resolvedCursor?.style ?? 'default',
        sizePercent: resolvedCursor?.sizePercent ?? 100,
      });
      publishScreenLayerRendererStats(cursorLayerStats);
      ctx.restore();
      ctx.restore();
      if (zoomSafety) {
        drawZoomAuthoringSafetyOverlay(ctx, zoomSafety, cursorPos, {
          screenX,
          screenY,
          screenWidth,
          screenHeight,
          screenDrawScale: effectiveScreenDrawScale,
          sourceWidth,
          sourceHeight,
          scale,
          offsetX,
          offsetY,
        });
      }
      markDrawPhase('cursor');
      if (nextOffscreen) {
        drawCursorOffscreenMarker(ctx, nextOffscreen, cursorPos, {
          screenX,
          screenY,
          screenWidth,
          screenHeight,
          screenDrawScale: effectiveScreenDrawScale,
          sourceWidth,
          sourceHeight,
          scale,
          offsetX,
          offsetY,
        });
      }
      if (cameraVideo && cameraFrameForDraw && cameraSourceForDraw) {
        try {
          const cameraLayerStats = screenLayerRenderer.drawCamera({
            ctx,
            video: cameraVideo,
            canvasWidth,
            canvasHeight,
            frame: cameraFrameForDraw,
            source: cameraSourceForDraw,
            sourceWidth: cameraVideo.videoWidth,
            sourceHeight: cameraVideo.videoHeight,
            radius: cameraRadiusForDraw,
            presentation: frame.cameraPresentation,
            shadow: !activeTimelinePlayback,
          });
          publishScreenLayerRendererStats(cameraLayerStats);
        } catch {
          // The camera element can report seeking while playback is still
          // advancing. Keep the screen frame alive and draw PiP on the next
          // decoded camera frame instead of killing the whole preview loop.
        }
        if (!activeTimelinePlayback && onCameraFrameChange) drawEditorFrameControls(ctx, cameraFrameForDraw, '#f59e0b', frame.cameraPresentation);
      }
      markDrawPhase('camera-pip');
      // Layers on tracks ABOVE the recording, drawn once the WHOLE recording
      // composite is down — screen, cursor and camera PiP alike. The recording
      // is a clip on a track like any other, so nothing belonging to it may
      // survive on top of a track above it. Outside the zoom/screen transform on
      // purpose: these sit on the program, like titles, not inside the
      // recording's frame.
      drawEditorOverlayLayers(ctx, canvasWidth, canvasHeight, overlayLayersAboveRef.current, renderFrame, editorLayerMediaRef.current, 'above', markOverlayLayerDirty, activeTimelinePlayback);
      publishResolvedLayout(resolvedScreenFrame, cameraRectRef.current, canvasWidth, canvasHeight);
      const focalSelection = selectedZoomFocalRef.current;
      const focalScreenRect = screenRectRef.current;
      if (!activeTimelinePlayback && focalSelection && focalScreenRect) {
        const live = focalDragRef.current ?? { x: focalSelection.x, y: focalSelection.y };
        const focalCx = focalScreenRect.x + live.x * focalScreenRect.w;
        const focalCy = focalScreenRect.y + live.y * focalScreenRect.h;
        drawFocalTarget(ctx, focalCx, focalCy, focalTargetRadius(canvasWidth, canvasHeight), isDraggingFocalRef.current);
      }
      markDrawPhase('layout-publish-overlays');
      if (drawTimingEnabled && typeof performance !== 'undefined') {
        const totalDrawMs = Math.round((performance.now() - drawStartedAtMs) * 10) / 10;
        if (totalDrawMs > PLAYBACK_DRAW_COST_LOG_THRESHOLD_MS) {
          recordPlaybackDebug('render-draw-cost', {
            renderLoopId,
            totalDrawMs,
            phases: drawTimings,
            frame: currentFrame,
            sourceFrame,
            mediaTime: metadata?.mediaTime ?? null,
            expectedDisplayTime: metadata?.expectedDisplayTime ?? null,
            screenQuality: readPlaybackQuality(video),
            cameraQuality: readPlaybackQuality(cameraVideo),
            hasCameraFrame: cameraHasFrame,
            screenScale: Math.round(scale * 1000) / 1000,
            canvasWidth,
            canvasHeight,
          });
        }
      }
      scheduleNextDraw();
    }
    function publishCursorOffscreenStatus(next: CursorOffscreenStatus) {
      const previous = cursorOffscreenRef.current;
      const same = previous?.side === next?.side && Math.round((previous?.distance ?? 0) / 25) === Math.round((next?.distance ?? 0) / 25);
      if (same) return;
      cursorOffscreenRef.current = next;
      setCursorOffscreen(next);
    }
    scheduleNextDraw();
    return () => {
      recordPlaybackDebug('render-loop-cleanup', {
        renderLoopId,
        timeMode,
        isPlaying,
        lastDrawnFrame,
      });
      cancelScheduledDraw();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cutRanges/background read via stable content keys to avoid object-identity loop restarts
  }, [project, sourceWidth, sourceHeight, fps, canvasResolution.width, canvasResolution.height, backgroundRenderKey, cameraSrc, cameraSourceOffsetSec, trimStartSec, effectiveTrimEndSec, cutRangesKey, visibleDuration, timelineDuration, timeMode, isPlaying, requestedScreenLayerRendererKind]);

  React.useEffect(() => {
    const cameraVideo = cameraVideoRef.current;
    if (!cameraVideo || !cameraSrc) return undefined;
    const syncCameraStart = () => {
      syncCameraTime(0);
    };
    cameraVideo.addEventListener('loadedmetadata', syncCameraStart);
    if (cameraVideo.readyState >= 1) syncCameraStart();
    return () => cameraVideo.removeEventListener('loadedmetadata', syncCameraStart);
  }, [cameraSrc, cameraSourceOffsetSec]);

  async function togglePlayback() {
    const video = videoRef.current;
    const cameraVideo = cameraVideoRef.current;
    if (!video) return;

    if (timeMode === 'timeline') {
      if (isPlaying) {
        setInternalPlaying(false);
        onPlayingChangeRef.current?.(false);
        return;
      }
      try {
        await Promise.all([
          waitForVideoFrameReady(video),
          waitForVideoFrameReady(cameraVideo),
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Video playback failed.');
        return;
      }
      if (currentTimeRef.current >= timelineDuration - 1 / fps) {
        updateCurrentTime(0, { immediate: true });
      }
      setInternalPlaying(true);
      onPlayingChangeRef.current?.(true);
      return;
    }

    if (video.paused) {
      try {
        const atEnd = video.ended || sourceTimeToVisibleTime(video.currentTime) >= visibleDuration - 1 / fps;
        if (atEnd) {
          const startTime = visibleTimeToSourceTime(0);
          video.currentTime = startTime;
          syncCameraTime(startTime);
          updateCurrentTime(0, { immediate: true });
        } else if (cameraVideo) {
          syncCameraTime(video.currentTime);
        }
        claimAudiblePreviewVideo(video);
        await video.play();
        await cameraVideo?.play().catch(() => undefined);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Video playback failed.');
      }
      return;
    }

    pausePreviewVideo(video);
    cameraVideo?.pause();
    return;
  }

  async function playAtRate(rate: number) {
    const video = videoRef.current;
    const cameraVideo = cameraVideoRef.current;
    if (!video) return;
    // Canonical timeline speed; in timeline mode the draw tick nudges the
    // video's playbackRate around this to track the clock.
    timelineRateRef.current = rate;
    video.playbackRate = rate;
    if (cameraVideo) cameraVideo.playbackRate = rate;
    if (timeMode === 'timeline') {
      if (!isPlaying) {
        setInternalPlaying(true);
        onPlayingChangeRef.current?.(true);
      }
      return;
    }
    if (video.paused) await togglePlayback();
  }

  React.useEffect(() => {
    if (!showControls) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isEditableShortcutTarget(event.target)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        void togglePlayback();
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (timeMode === 'timeline') {
          setInternalPlaying(false);
          onPlayingChangeRef.current?.(false);
          return;
        }
        pausePreviewVideo(video);
        cameraVideoRef.current?.pause();
      } else if (event.key.toLowerCase() === 'l') {
        event.preventDefault();
        // Step off the canonical rate, not the drift-nudged video.playbackRate.
        const baseRate = timelineRateRef.current;
        void playAtRate(Math.min(4, baseRate >= 1 ? baseRate + 0.5 : 1));
      } else if (event.key.toLowerCase() === 'j') {
        event.preventDefault();
        void playAtRate(Math.max(0.25, timelineRateRef.current - 0.5));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showControls, visibleDuration, fps, trimStartSec, cutRanges, timeMode, isPlaying, timelineDuration]);

  const acceleratedPresentationActive = isAcceleratedScreenLayerRenderer(requestedScreenLayerRendererKind) && timeMode === 'timeline' && isPlaying;

  return (
    <div className="videoPreview styledPreview">
      <video
        ref={videoRef}
        src={src}
        preload="auto"
        playsInline
        className="hiddenSource"
        onLoadedMetadata={(event) => {
          setSourceMediaDuration(event.currentTarget.duration);
          if (trimStartSec > 0) event.currentTarget.currentTime = trimStartSec;
          setError(null);
        }}
        onPlay={(event) => {
          claimAudiblePreviewVideo(event.currentTarget);
          if (timeMode === 'timeline') return;
          setInternalPlaying(true);
          onPlayingChangeRef.current?.(true);
        }}
        onPause={(event) => {
          releaseAudiblePreviewVideo(event.currentTarget);
          if (timeMode === 'timeline') return;
          setInternalPlaying(false);
          onPlayingChangeRef.current?.(false);
        }}
        onEnded={(event) => {
          releaseAudiblePreviewVideo(event.currentTarget);
          if (timeMode === 'timeline') return;
          setInternalPlaying(false);
          onPlayingChangeRef.current?.(false);
        }}
        onSeeked={handleSeekSettled}
        onError={(event) => setError(videoErrorMessage(event.currentTarget))}
        onTimeUpdate={(event) => {
          const next = event.currentTarget.currentTime;
          const cutEnd = cutEndForSourceTime(next);
          if (cutEnd !== null) {
            event.currentTarget.currentTime = cutEnd;
            return;
          }
          const visibleTime = sourceTimeToVisibleTime(next);
          if (timeMode === 'timeline') return;
          updateCurrentTime(Math.min(visibleTime, visibleDuration));
        }}
      />
      {cameraSrc ? (
        <video
          ref={cameraVideoRef}
          src={cameraSrc}
          preload="auto"
          playsInline
          className="hiddenSource"
          muted
          onLoadedMetadata={(event) => setCameraMediaDuration(event.currentTarget.duration)}
        />
      ) : null}
      <canvas
        ref={webglCanvasRef}
        className={`styledPreviewAcceleratedCanvas styledPreviewWebglCanvas${acceleratedPresentationActive ? ' isActive' : ''}`}
        aria-hidden="true"
        style={{ aspectRatio: `${canvasResolution.width} / ${canvasResolution.height}` }}
      />
      <canvas
        ref={canvasRef}
        className={`styledPreviewCanvas styledPreviewOverlayCanvas${acceleratedPresentationActive ? ' isAcceleratedPresentationOverlay isWebglPresentationOverlay' : ''}${!isPlaying && isDraggingCamera ? ' draggingCamera' : ''}${!isPlaying && isDraggingScreen ? ' draggingScreen' : ''}${!isPlaying && isDraggingFocal ? ' draggingFocal' : ''}${censorDrawArmed ? ' censorDrawArmed' : ''}${isEditingCensor ? ' editingCensor' : ''}`}
        aria-label="Styled preview"
        data-camera-draggable={onCameraFrameChange ? 'true' : 'false'}
        data-screen-draggable={onScreenFrameChange ? 'true' : 'false'}
        data-censor-draw-armed={censorDrawArmed ? 'true' : 'false'}
        style={{ aspectRatio: `${canvasResolution.width} / ${canvasResolution.height}` }}
        onPointerMove={(event) => {
          if (timeMode === 'timeline' && isPlaying) return;
          const canvas = canvasRef.current;
          if (!canvas || (!onCameraFrameChange && !onScreenFrameChange && !onZoomFocalChange)) return;
          const rect = canvas.getBoundingClientRect();
          const xCanvas = ((event.clientX - rect.left) * canvas.width) / rect.width;
          const yCanvas = ((event.clientY - rect.top) * canvas.height) / rect.height;
          const censorEdit = censorEditRef.current;
          if (censorEdit && censorEdit.pointerId === event.pointerId) {
            const point = canvasPointToSourceNormalized(censorMappingRef.current, xCanvas, yCanvas);
            if (point) {
              censorDragRectRef.current = censorEdit.mode === 'move'
                ? moveCensorRect(censorEdit.startRect, point.x - censorEdit.grabX, point.y - censorEdit.grabY)
                : resizeCensorRect(censorEdit.startRect, censorEdit.handle, point.x, point.y);
              previewInteractionDirtyRef.current = true;
            }
            return;
          }
          const censorDraft = censorDraftRef.current;
          if (censorDraft && censorDraft.pointerId === event.pointerId) {
            const to = canvasPointToSourceNormalized(censorMappingRef.current, xCanvas, yCanvas);
            if (to) {
              censorDraft.to = to;
              setCensorDraftRect({
                x: censorDraft.from.x,
                y: censorDraft.from.y,
                w: to.x - censorDraft.from.x,
                h: to.y - censorDraft.from.y,
              });
              previewInteractionDirtyRef.current = true;
            }
            return;
          }
          const focalOrigin = focalDragOriginRef.current;
          if (focalOrigin && focalOrigin.pointerId === event.pointerId) {
            const sRect = screenRectRef.current;
            if (sRect && sRect.w > 0 && sRect.h > 0) {
              focalDragRef.current = {
                x: Math.max(0, Math.min(1, (xCanvas - sRect.x) / sRect.w)),
                y: Math.max(0, Math.min(1, (yCanvas - sRect.y) / sRect.h)),
              };
              previewInteractionDirtyRef.current = true;
            }
            return;
          }
          const origin = cameraDragOriginRef.current;
          if (origin && origin.pointerId === event.pointerId) {
            cameraDragRef.current = origin.mode === 'resize'
              ? resizeRectFromPointer(origin, xCanvas, yCanvas, canvas.width, canvas.height)
              : moveRectFromPointer(origin, xCanvas, yCanvas, canvas.width, canvas.height);
            previewInteractionDirtyRef.current = true;
            return;
          }
          const screenOrigin = screenDragOriginRef.current;
          if (screenOrigin && screenOrigin.pointerId === event.pointerId) {
            screenDragRef.current = screenOrigin.mode === 'resize'
              ? resizeRectFromPointer(screenOrigin, xCanvas, yCanvas, canvas.width, canvas.height)
              : moveRectFromPointer(screenOrigin, xCanvas, yCanvas, canvas.width, canvas.height);
            previewInteractionDirtyRef.current = true;
            return;
          }
          const screenRect = screenRectRef.current;
          const overFocal = isPointNearFocalTarget(xCanvas, yCanvas, screenRect, selectedZoomFocal, onZoomFocalChange, canvas.width, canvas.height);
          if (overFocal) {
            event.currentTarget.style.cursor = 'grab';
            return;
          }
          const cameraRect = cameraRectRef.current;
          const overCamera = !!onCameraFrameChange && !!cameraRect && xCanvas >= cameraRect.x && xCanvas <= cameraRect.x + cameraRect.w && yCanvas >= cameraRect.y && yCanvas <= cameraRect.y + cameraRect.h;
          const overScreen = !!onScreenFrameChange && !!screenRect && xCanvas >= screenRect.x && xCanvas <= screenRect.x + screenRect.w && yCanvas >= screenRect.y && yCanvas <= screenRect.y + screenRect.h;
          const cameraHandle = onCameraFrameChange && cameraRect ? resizeHandleAtPoint(xCanvas, yCanvas, cameraRect) : null;
          const screenHandle = onScreenFrameChange && screenRect ? resizeHandleAtPoint(xCanvas, yCanvas, screenRect) : null;
          // With a zoom selected, the screen body sets the focus point → crosshair.
          const overScreenForFocal = !!onZoomFocalChange && !!selectedZoomFocal && !!screenRect && !overCamera && !cameraHandle && !screenHandle
            && xCanvas >= screenRect.x && xCanvas <= screenRect.x + screenRect.w && yCanvas >= screenRect.y && yCanvas <= screenRect.y + screenRect.h;
          const censorRectNow = selectedCensor && onCensorRectChange ? censorHandleRectRef.current : null;
          const censorHandleNow = censorRectNow ? resizeHandleAtPoint(xCanvas, yCanvas, censorRectNow) : null;
          const overCensorNow = Boolean(censorRectNow) && !overCamera
            && xCanvas >= censorRectNow!.x && xCanvas <= censorRectNow!.x + censorRectNow!.w
            && yCanvas >= censorRectNow!.y && yCanvas <= censorRectNow!.y + censorRectNow!.h;
          event.currentTarget.style.cursor = censorHandleNow && !overCamera
            ? cursorForResizeHandle(censorHandleNow)
            : cameraHandle ? cursorForResizeHandle(cameraHandle) : screenHandle ? cursorForResizeHandle(screenHandle) : overScreenForFocal ? 'crosshair' : overCensorNow || overCamera || overScreen ? 'grab' : '';
        }}
        onPointerDown={(event) => {
          if (timeMode === 'timeline' && isPlaying) {
            recordPlaybackDebug('preview-pointerdown-ignored-playing', {
              pointerId: event.pointerId,
              clientX: Math.round(event.clientX),
              clientY: Math.round(event.clientY),
            });
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const xCanvas = ((event.clientX - rect.left) * canvas.width) / rect.width;
          const yCanvas = ((event.clientY - rect.top) * canvas.height) / rect.height;
          // The censor tool owns the whole preview while armed, ahead of camera
          // and frame dragging: the user explicitly asked to draw a rectangle.
          if (censorDrawArmed && onCensorDraw) {
            const start = canvasPointToSourceNormalized(censorMappingRef.current, xCanvas, yCanvas);
            if (!start) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            censorDraftRef.current = { pointerId: event.pointerId, from: start, to: start };
            setCensorDraftRect({ x: start.x, y: start.y, w: 0, h: 0 });
            previewInteractionDirtyRef.current = true;
            return;
          }
          // Selected censor sits between the camera PiP and the screen frame: it beats
          // the frame because the frame is the backdrop, and loses to the PiP because
          // the PiP is a small distinct object on top. Only active while selected, so
          // it cannot steal drags the rest of the time.
          if (selectedCensor && onCensorRectChange) {
            const handleRect = censorHandleRectRef.current;
            const censorHandle = handleRect ? resizeHandleAtPoint(xCanvas, yCanvas, handleRect) : null;
            const insideCensor = Boolean(handleRect)
              && xCanvas >= handleRect!.x && xCanvas <= handleRect!.x + handleRect!.w
              && yCanvas >= handleRect!.y && yCanvas <= handleRect!.y + handleRect!.h;
            const cameraRectNow = cameraRectRef.current;
            const overCameraNow = Boolean(onCameraFrameChange && cameraRectNow
              && xCanvas >= cameraRectNow.x && xCanvas <= cameraRectNow.x + cameraRectNow.w
              && yCanvas >= cameraRectNow.y && yCanvas <= cameraRectNow.y + cameraRectNow.h);
            if ((censorHandle || insideCensor) && !overCameraNow) {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              const grab = canvasPointToSourceNormalized(censorMappingRef.current, xCanvas, yCanvas);
              if (grab) {
                // Where the censor actually is on this frame, which for a tracked
                // one is not `rect`. Starting the drag from `rect` would make the
                // box jump to its untracked position the moment it was grabbed.
                const startRect = resolveCensorRectAtFrame(selectedCensor, censorSourceFrameRef.current)
                  ?? selectedCensor.rect;
                censorEditRef.current = {
                  pointerId: event.pointerId,
                  mode: censorHandle ? 'resize' : 'move',
                  handle: censorHandle,
                  startRect: { ...startRect },
                  grabX: grab.x,
                  grabY: grab.y,
                };
                censorDragRectRef.current = { ...startRect };
                setIsEditingCensor(true);
                previewInteractionDirtyRef.current = true;
                event.currentTarget.style.cursor = censorHandle ? cursorForResizeHandle(censorHandle) : 'grabbing';
              }
              return;
            }
          }
          if (!onCameraFrameChange && !onScreenFrameChange && !onZoomFocalChange) return;
          // Focus target wins over screen/camera drag since it sits inside them.
          if (isPointNearFocalTarget(xCanvas, yCanvas, screenRectRef.current, selectedZoomFocal, onZoomFocalChange, canvas.width, canvas.height) && selectedZoomFocal) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            focalDragOriginRef.current = { pointerId: event.pointerId };
            focalDragRef.current = { x: selectedZoomFocal.x, y: selectedZoomFocal.y };
            setIsDraggingFocal(true);
            previewInteractionDirtyRef.current = true;
            event.currentTarget.style.cursor = 'grabbing';
            return;
          }
          const cameraRect = cameraRectRef.current;
          const cameraHandle = onCameraFrameChange && cameraRect ? resizeHandleAtPoint(xCanvas, yCanvas, cameraRect) : null;
          const insideCamera = !!onCameraFrameChange && !!cameraRect && xCanvas >= cameraRect.x && xCanvas <= cameraRect.x + cameraRect.w && yCanvas >= cameraRect.y && yCanvas <= cameraRect.y + cameraRect.h;
          if ((insideCamera || cameraHandle) && cameraRect) {
            const mode = cameraHandle ? 'resize' : 'move';
            event.preventDefault();
            setAlignmentTarget('camera');
            event.currentTarget.setPointerCapture(event.pointerId);
            cameraDragOriginRef.current = {
              pointerId: event.pointerId,
              mode,
              handle: cameraHandle ?? undefined,
              offsetX: xCanvas - cameraRect.x,
              offsetY: yCanvas - cameraRect.y,
              startX: cameraRect.x,
              startY: cameraRect.y,
              width: cameraRect.w,
              height: cameraRect.h,
              aspect: Math.max(0.01, cameraRect.w / Math.max(1, cameraRect.h)),
            };
            cameraDragRef.current = {
              x: cameraRect.x / canvas.width,
              y: cameraRect.y / canvas.height,
              w: cameraRect.w / canvas.width,
              h: cameraRect.h / canvas.height,
            };
            setIsDraggingCamera(true);
            event.currentTarget.style.cursor = cameraHandle ? cursorForResizeHandle(cameraHandle) : 'grabbing';
            return;
          }
          const screenRect = screenRectRef.current;
          const screenHandle = onScreenFrameChange && screenRect ? resizeHandleAtPoint(xCanvas, yCanvas, screenRect) : null;
          const insideScreen = !!screenRect && xCanvas >= screenRect.x && xCanvas <= screenRect.x + screenRect.w && yCanvas >= screenRect.y && yCanvas <= screenRect.y + screenRect.h;
          // Screen resize handles keep priority so the screen stays resizable
          // even while a zoom is selected.
          if (screenHandle && onScreenFrameChange && screenRect) {
            event.preventDefault();
            setAlignmentTarget('screen');
            event.currentTarget.setPointerCapture(event.pointerId);
            screenDragOriginRef.current = {
              pointerId: event.pointerId,
              mode: 'resize',
              handle: screenHandle,
              offsetX: xCanvas - screenRect.x,
              offsetY: yCanvas - screenRect.y,
              startX: screenRect.x,
              startY: screenRect.y,
              width: screenRect.w,
              height: screenRect.h,
              aspect: sourceWidth / Math.max(1, sourceHeight),
            };
            screenDragRef.current = {
              x: screenRect.x / canvas.width,
              y: screenRect.y / canvas.height,
              w: screenRect.w / canvas.width,
              h: screenRect.h / canvas.height,
            };
            setIsDraggingScreen(true);
            event.currentTarget.style.cursor = cursorForResizeHandle(screenHandle);
            return;
          }
          // While a zoom is selected, the whole video is a focus surface: a
          // click places the focus where you click, then a drag fine-tunes it.
          // This dominates screen-body move so clicks can't be hijacked.
          if (selectedZoomFocal && onZoomFocalChange && insideScreen && screenRect && screenRect.w > 0 && screenRect.h > 0) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            focalDragOriginRef.current = { pointerId: event.pointerId };
            focalDragRef.current = {
              x: Math.max(0, Math.min(1, (xCanvas - screenRect.x) / screenRect.w)),
              y: Math.max(0, Math.min(1, (yCanvas - screenRect.y) / screenRect.h)),
            };
            setIsDraggingFocal(true);
            previewInteractionDirtyRef.current = true;
            event.currentTarget.style.cursor = 'grabbing';
            return;
          }
          // Otherwise drag the screen body (only when no zoom focus is active).
          if (!insideScreen || !onScreenFrameChange || !screenRect) return;
          event.preventDefault();
          setAlignmentTarget('screen');
          event.currentTarget.setPointerCapture(event.pointerId);
          screenDragOriginRef.current = {
            pointerId: event.pointerId,
            mode: 'move',
            handle: undefined,
            offsetX: xCanvas - screenRect.x,
            offsetY: yCanvas - screenRect.y,
            startX: screenRect.x,
            startY: screenRect.y,
            width: screenRect.w,
            height: screenRect.h,
            aspect: sourceWidth / Math.max(1, sourceHeight),
          };
          screenDragRef.current = {
            x: screenRect.x / canvas.width,
            y: screenRect.y / canvas.height,
            w: screenRect.w / canvas.width,
            h: screenRect.h / canvas.height,
          };
          setIsDraggingScreen(true);
          event.currentTarget.style.cursor = 'grabbing';
        }}
        onPointerUp={(event) => {
          if (timeMode === 'timeline' && isPlaying) {
            recordPlaybackDebug('preview-pointerup-ignored-playing', {
              pointerId: event.pointerId,
              clientX: Math.round(event.clientX),
              clientY: Math.round(event.clientY),
            });
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          const censorEdit = censorEditRef.current;
          if (censorEdit && censorEdit.pointerId === event.pointerId) {
            const finalRect = censorDragRectRef.current;
            censorEditRef.current = null;
            censorDragRectRef.current = null;
            setIsEditingCensor(false);
            event.currentTarget.style.cursor = '';
            try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
            previewInteractionDirtyRef.current = true;
            if (finalRect && selectedCensor) {
              onCensorRectChange?.(selectedCensor.id, finalRect, censorSourceFrameRef.current);
            }
            return;
          }
          const censorDraft = censorDraftRef.current;
          if (censorDraft && censorDraft.pointerId === event.pointerId) {
            censorDraftRef.current = null;
            setCensorDraftRect(null);
            previewInteractionDirtyRef.current = true;
            try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
            // A stray click with no drag is not a censor. The document layer
            // rejects a zero-area rect too; bailing here keeps the preview from
            // flashing an empty selection.
            onCensorDraw?.({
              x: censorDraft.from.x,
              y: censorDraft.from.y,
              w: censorDraft.to.x - censorDraft.from.x,
              h: censorDraft.to.y - censorDraft.from.y,
            });
            return;
          }
          const focalOrigin = focalDragOriginRef.current;
          if (focalOrigin && focalOrigin.pointerId === event.pointerId) {
            const drag = focalDragRef.current;
            const focal = selectedZoomFocal;
            focalDragOriginRef.current = null;
            focalDragRef.current = null;
            setIsDraggingFocal(false);
            event.currentTarget.style.cursor = '';
            try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
            if (drag && focal) onZoomFocalChange?.(focal.id, drag.x, drag.y);
            return;
          }
          const origin = cameraDragOriginRef.current;
          if (origin && origin.pointerId === event.pointerId) {
            const drag = cameraDragRef.current;
            cameraDragOriginRef.current = null;
            cameraDragRef.current = null;
            setIsDraggingCamera(false);
            event.currentTarget.style.cursor = '';
            try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
            if (drag) onCameraFrameChange?.(drag);
            return;
          }
          const screenOrigin = screenDragOriginRef.current;
          if (!screenOrigin || screenOrigin.pointerId !== event.pointerId) return;
          const screenDrag = screenDragRef.current;
          screenDragOriginRef.current = null;
          screenDragRef.current = null;
          setIsDraggingScreen(false);
          event.currentTarget.style.cursor = '';
          try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
          if (screenDrag) onScreenFrameChange?.(screenDrag);
        }}
        onPointerCancel={(event) => {
          if (timeMode === 'timeline' && isPlaying) {
            recordPlaybackDebug('preview-pointercancel-ignored-playing', {
              pointerId: event.pointerId,
              clientX: Math.round(event.clientX),
              clientY: Math.round(event.clientY),
            });
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          cameraDragOriginRef.current = null;
          cameraDragRef.current = null;
          screenDragOriginRef.current = null;
          screenDragRef.current = null;
          focalDragOriginRef.current = null;
          focalDragRef.current = null;
          setIsDraggingCamera(false);
          setIsDraggingScreen(false);
          setIsDraggingFocal(false);
          previewInteractionDirtyRef.current = true;
          event.currentTarget.style.cursor = '';
        }}
      />
      {editablePreview && !(timeMode === 'timeline' && isPlaying) ? (
        <div className="previewAlignmentToolbar" aria-label="Alignment tools">
          <div className="previewAlignmentTarget" role="group" aria-label="Selected frame">
            <button
              type="button"
              className={effectiveAlignmentTarget === 'screen' ? 'isActive' : ''}
              disabled={!canAlignScreen}
              aria-pressed={effectiveAlignmentTarget === 'screen'}
              onClick={() => setAlignmentTarget('screen')}
            >
              Screen
            </button>
            <button
              type="button"
              className={effectiveAlignmentTarget === 'camera' ? 'isActive' : ''}
              disabled={!canAlignCamera}
              aria-pressed={effectiveAlignmentTarget === 'camera'}
              onClick={() => setAlignmentTarget('camera')}
            >
              Camera
            </button>
          </div>
          <div className="previewAlignmentDivider" aria-hidden="true" />
          <button
            type="button"
            className={alignmentGridVisible ? 'isActive' : ''}
            title={alignmentGridVisible ? 'Hide alignment grid' : 'Show alignment grid'}
            aria-pressed={alignmentGridVisible}
            onClick={() => setAlignmentGridVisible((visible) => !visible)}
          >
            <PhosphorGridFour size={15} weight="duotone" />
            <span className="visuallyHidden">{alignmentGridVisible ? 'Hide alignment grid' : 'Show alignment grid'}</span>
          </button>
          <div className="previewAlignmentDivider" aria-hidden="true" />
          <div className="previewAlignmentActions" role="group" aria-label={`Align ${selectedAlignmentLabel.toLowerCase()}`}>
            <button type="button" title={`Align ${selectedAlignmentLabel.toLowerCase()} left`} onClick={() => alignSelectedFrame('left')}>
              <PhosphorAlignLeft size={15} weight="duotone" />
              <span className="visuallyHidden">Align left</span>
            </button>
            <button type="button" title={`Align ${selectedAlignmentLabel.toLowerCase()} horizontal center`} onClick={() => alignSelectedFrame('horizontal-center')}>
              <PhosphorAlignCenterHorizontal size={15} weight="duotone" />
              <span className="visuallyHidden">Align horizontal center</span>
            </button>
            <button type="button" title={`Align ${selectedAlignmentLabel.toLowerCase()} right`} onClick={() => alignSelectedFrame('right')}>
              <PhosphorAlignRight size={15} weight="duotone" />
              <span className="visuallyHidden">Align right</span>
            </button>
            <button type="button" title={`Align ${selectedAlignmentLabel.toLowerCase()} top`} onClick={() => alignSelectedFrame('top')}>
              <PhosphorAlignTop size={15} weight="duotone" />
              <span className="visuallyHidden">Align top</span>
            </button>
            <button type="button" title={`Align ${selectedAlignmentLabel.toLowerCase()} vertical center`} onClick={() => alignSelectedFrame('vertical-center')}>
              <PhosphorAlignCenterVertical size={15} weight="duotone" />
              <span className="visuallyHidden">Align vertical center</span>
            </button>
            <button type="button" title={`Align ${selectedAlignmentLabel.toLowerCase()} bottom`} onClick={() => alignSelectedFrame('bottom')}>
              <PhosphorAlignBottom size={15} weight="duotone" />
              <span className="visuallyHidden">Align bottom</span>
            </button>
          </div>
        </div>
      ) : null}
      {showControls ? (
        <div className="videoControls" aria-label="Video playback controls">
          <button type="button" className="transportButton" onClick={togglePlayback} title="Play or pause (Space)">
            {isPlaying ? <PhosphorPause size={18} weight="duotone" /> : <PhosphorPlay size={18} weight="duotone" />}
            <span className="visuallyHidden">{isPlaying ? 'Pause' : 'Play'}</span>
          </button>
          <span className="timecode">
            {formatClock(currentTime)} / {formatClock(displayDuration)}
          </span>
          {cursorOffscreen ? (
            <span className="cursorOffscreenHint" title={`Cursor is ${Math.round(cursorOffscreen.distance)}px outside the captured screen`}>
              Cursor off-screen {offscreenArrow(cursorOffscreen.side)}
            </span>
          ) : null}
          <span className="transportHint"><kbd>Space</kbd> play/pause</span>
        </div>
      ) : null}
      {error ? <p className="error">Video failed to load: {error}</p> : null}
    </div>
  );
}

function videoErrorMessage(video: HTMLVideoElement) {
  const code = video.error?.code;
  if (code === MediaError.MEDIA_ERR_ABORTED) return 'Loading was aborted.';
  if (code === MediaError.MEDIA_ERR_NETWORK) return 'Network or file access failed.';
  if (code === MediaError.MEDIA_ERR_DECODE) return 'The video could not be decoded.';
  if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) return 'The video source is not supported.';
  return 'Unknown media error.';
}

function offscreenArrow(side: CursorOffscreenSide) {
  if (side === 'left') return '←';
  if (side === 'right') return '→';
  if (side === 'top') return '↑';
  return '↓';
}

function drawCursorOffscreenMarker(
  ctx: CanvasRenderingContext2D,
  status: NonNullable<CursorOffscreenStatus>,
  cursor: { x: number; y: number } | null,
  geometry: {
    screenX: number;
    screenY: number;
    screenWidth: number;
    screenHeight: number;
    screenDrawScale: number;
    sourceWidth: number;
    sourceHeight: number;
    scale: number;
    offsetX: number;
    offsetY: number;
  },
) {
  const {
    screenX,
    screenY,
    screenWidth,
    screenHeight,
    screenDrawScale,
    sourceWidth,
    sourceHeight,
    scale,
    offsetX,
    offsetY,
  } = geometry;
  const sourceX = cursor?.x ?? sourceWidth / 2;
  const sourceY = cursor?.y ?? sourceHeight / 2;
  const projected = projectSourcePoint({
    x: Math.max(0, Math.min(sourceWidth, sourceX)),
    y: Math.max(0, Math.min(sourceHeight, sourceY)),
    screenX,
    screenY,
    screenDrawScale,
    sourceWidth,
    sourceHeight,
    scale,
    offsetX,
    offsetY,
  });
  const inset = 9;
  const x = status.side === 'left'
    ? screenX + inset
    : status.side === 'right'
      ? screenX + screenWidth - inset
      : Math.max(screenX + 18, Math.min(screenX + screenWidth - 18, projected.x));
  const y = status.side === 'top'
    ? screenY + inset
    : status.side === 'bottom'
      ? screenY + screenHeight - inset
      : Math.max(screenY + 18, Math.min(screenY + screenHeight - 18, projected.y));

  ctx.save();
  ctx.fillStyle = 'rgba(245, 158, 11, 0.96)';
  ctx.strokeStyle = 'rgba(45, 32, 12, 0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (status.side === 'right' || status.side === 'left') {
    const direction = status.side === 'right' ? 1 : -1;
    ctx.moveTo(x + direction * 7, y);
    ctx.lineTo(x - direction * 3, y - 6);
    ctx.lineTo(x - direction * 3, y + 6);
  } else {
    const direction = status.side === 'bottom' ? 1 : -1;
    ctx.moveTo(x, y + direction * 7);
    ctx.lineTo(x - 6, y - direction * 3);
    ctx.lineTo(x + 6, y - direction * 3);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawZoomAuthoringSafetyOverlay(
  ctx: CanvasRenderingContext2D,
  safety: ZoomAuthoringSafety,
  cursor: { x: number; y: number } | null,
  geometry: {
    screenX: number;
    screenY: number;
    screenWidth: number;
    screenHeight: number;
    screenDrawScale: number;
    sourceWidth: number;
    sourceHeight: number;
    scale: number;
    offsetX: number;
    offsetY: number;
  },
) {
  const topLeft = projectSourcePoint({ x: safety.crop.x, y: safety.crop.y, ...geometry });
  const topRight = projectSourcePoint({ x: safety.crop.x + safety.crop.w, y: safety.crop.y, ...geometry });
  const bottomRight = projectSourcePoint({ x: safety.crop.x + safety.crop.w, y: safety.crop.y + safety.crop.h, ...geometry });
  const bottomLeft = projectSourcePoint({ x: safety.crop.x, y: safety.crop.y + safety.crop.h, ...geometry });
  const corners = [topLeft, topRight, bottomRight, bottomLeft];
  const inside = safety.cursorInside !== false;
  const accent = inside ? 'rgba(56, 189, 248, 0.92)' : 'rgba(245, 158, 11, 0.96)';
  const label = inside ? 'Zoom crop' : 'Cursor outside crop';

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(7, 12, 20, 0.72)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(topLeft.x, topLeft.y);
  for (const corner of corners.slice(1)) ctx.lineTo(corner.x, corner.y);
  ctx.closePath();
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 7]);
  ctx.stroke();
  ctx.setLineDash([]);

  if (cursor) {
    const projectedCursor = projectSourcePoint({ x: cursor.x, y: cursor.y, ...geometry });
    ctx.beginPath();
    ctx.arc(projectedCursor.x, projectedCursor.y, inside ? 5 : 7, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(7, 12, 20, 0.8)';
    ctx.stroke();
  }

  const fontSize = Math.max(18, Math.min(26, geometry.screenWidth * 0.045));
  ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;
  const metrics = ctx.measureText(label);
  const padX = Math.round(fontSize * 0.72);
  const padY = Math.round(fontSize * 0.45);
  const labelW = Math.ceil(metrics.width + padX * 2);
  const labelH = Math.ceil(fontSize + padY * 2);
  const labelX = Math.max(geometry.screenX + 8, Math.min(geometry.screenX + geometry.screenWidth - labelW - 8, topLeft.x + 8));
  const labelY = Math.max(geometry.screenY + 8, Math.min(geometry.screenY + geometry.screenHeight - labelH - 8, topLeft.y + 8));
  ctx.fillStyle = 'rgba(7, 12, 20, 0.82)';
  addRoundedRect(ctx, labelX, labelY, labelW, labelH, Math.max(7, fontSize * 0.45));
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = 'rgba(245, 248, 255, 0.96)';
  ctx.fillText(label, labelX + padX, labelY + padY + fontSize * 0.76);
  ctx.restore();
}

function projectSourcePoint({
  x,
  y,
  screenX,
  screenY,
  screenDrawScale,
  sourceWidth,
  sourceHeight,
  scale,
  offsetX,
  offsetY,
}: {
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  screenDrawScale: number;
  sourceWidth: number;
  sourceHeight: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}) {
  return {
    x: screenX + screenDrawScale * (sourceWidth / 2 + offsetX + scale * (x - sourceWidth / 2)),
    y: screenY + screenDrawScale * (sourceHeight / 2 + offsetY + scale * (y - sourceHeight / 2)),
  };
}

function resolveCameraFrame(
  normalizedFrame: NormalizedRect | undefined,
  presentation: Partial<CameraPresentation> | undefined,
  canvasWidth: number,
  canvasHeight: number,
) {
  if (normalizedFrame) {
    return constrainCameraShapeFrame({
      x: normalizedFrame.x * canvasWidth,
      y: normalizedFrame.y * canvasHeight,
      w: normalizedFrame.w * canvasWidth,
      h: normalizedFrame.h * canvasHeight,
    }, presentation, canvasWidth, canvasHeight);
  }
  const rect = getCameraLayoutRect(
    { ...DEFAULT_CAMERA_PRESENTATION, ...(presentation ?? {}) },
    canvasWidth,
    canvasHeight,
  );
  return constrainCameraShapeFrame({
    x: rect.x,
    y: rect.y,
    w: rect.width,
    h: rect.height,
  }, presentation, canvasWidth, canvasHeight);
}

function constrainCameraShapeFrame(
  frame: { x: number; y: number; w: number; h: number },
  presentation: Partial<CameraPresentation> | undefined,
  canvasWidth: number,
  canvasHeight: number,
) {
  if (presentation?.shape !== 'circle') return frame;
  const size = Math.max(2, Math.min(frame.w, frame.h, canvasWidth, canvasHeight));
  return {
    x: Math.max(0, Math.min(canvasWidth - size, frame.x + (frame.w - size) / 2)),
    y: Math.max(0, Math.min(canvasHeight - size, frame.y + (frame.h - size) / 2)),
    w: size,
    h: size,
  };
}

function resolveScreenFrame(
  normalizedFrame: NormalizedRect | undefined,
  defaultX: number,
  defaultY: number,
  defaultWidth: number,
  defaultHeight: number,
  canvasWidth: number,
  canvasHeight: number,
) {
  if (!normalizedFrame) return { x: defaultX, y: defaultY, w: defaultWidth, h: defaultHeight };
  const w = Math.max(2, Math.min(canvasWidth, normalizedFrame.w * canvasWidth));
  const h = Math.max(2, Math.min(canvasHeight, normalizedFrame.h * canvasHeight));
  return {
    x: Math.max(0, Math.min(canvasWidth - w, normalizedFrame.x * canvasWidth)),
    y: Math.max(0, Math.min(canvasHeight - h, normalizedFrame.y * canvasHeight)),
    w,
    h,
  };
}

function rectToNormalizedFrame(rect: { x: number; y: number; w: number; h: number }, canvasWidth: number, canvasHeight: number): NormalizedRect {
  return {
    x: clampUnit(rect.x / Math.max(1, canvasWidth)),
    y: clampUnit(rect.y / Math.max(1, canvasHeight)),
    w: clampUnit(rect.w / Math.max(1, canvasWidth), 0.05),
    h: clampUnit(rect.h / Math.max(1, canvasHeight), 0.05),
  };
}

function clampUnit(value: number, min = 0): number {
  const safeValue = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(1, safeValue));
}

function alignRectInCanvas(
  rect: { x: number; y: number; w: number; h: number },
  mode: PreviewAlignmentMode,
  canvasWidth: number,
  canvasHeight: number,
) {
  const next = { ...rect };
  if (mode === 'left') next.x = 0;
  if (mode === 'horizontal-center') next.x = (canvasWidth - rect.w) / 2;
  if (mode === 'right') next.x = canvasWidth - rect.w;
  if (mode === 'top') next.y = 0;
  if (mode === 'vertical-center') next.y = (canvasHeight - rect.h) / 2;
  if (mode === 'bottom') next.y = canvasHeight - rect.h;
  return {
    ...next,
    x: Math.max(0, Math.min(canvasWidth - rect.w, next.x)),
    y: Math.max(0, Math.min(canvasHeight - rect.h, next.y)),
  };
}

/**
 * A layer the advanced Editor added to the shared timeline. Only the fields this
 * compositor needs to draw it; the Editor owns the rest.
 */
export type EditorOverlayLayer = {
  id?: string;
  type?: string;
  from?: number;
  durationInFrames?: number;
  mediaId?: string;
  src?: string;
  text?: string;
  sourceStart?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

/**
 * Decode surfaces for Editor video layers, keyed by source url.
 *
 * These follow the same rule as the recording's own decode surfaces: the element
 * NEVER owns the clock. It is seeked from canonical timeline time and drawn; a
 * stalled decode must not be able to stop or slow the compositor, which is why
 * every draw is guarded on readyState rather than awaited.
 */
/**
 * The last frame each overlay layer successfully decoded.
 *
 * A seek drops a video element back to readyState 1 for a moment. Skipping the
 * layer during that window makes it vanish and lets whatever is under it — the
 * recording — show through, which reads as the layer being on the wrong track.
 * A clip on a higher track covers the one below it on every frame, so hold the
 * last decoded picture until the next one arrives.
 */
const overlayLayerFrameCache = new WeakMap<HTMLVideoElement, HTMLCanvasElement>();

function cacheOverlayFrame(video: HTMLVideoElement): HTMLCanvasElement | null {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;
  let cache = overlayLayerFrameCache.get(video);
  if (!cache || cache.width !== width || cache.height !== height) {
    cache = document.createElement('canvas');
    cache.width = width;
    cache.height = height;
    overlayLayerFrameCache.set(video, cache);
  }
  const cacheCtx = cache.getContext('2d');
  if (!cacheCtx) return null;
  cacheCtx.drawImage(video, 0, 0, width, height);
  return cache;
}

function acquireOverlayVideo(
  pool: Map<string, HTMLVideoElement>,
  src: string,
  onDecoded?: () => void,
): HTMLVideoElement {
  const existing = pool.get(src);
  if (existing) return existing;
  const video = document.createElement('video');
  video.src = src;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  // A paused preview draws only when something marks it dirty, so a frame that
  // finishes decoding after the draw would otherwise never be shown.
  if (onDecoded) {
    for (const event of ['loadeddata', 'seeked', 'canplay'] as const) {
      video.addEventListener(event, onDecoded);
    }
  }
  pool.set(src, video);
  return video;
}

function drawEditorOverlayLayers(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  layers: EditorOverlayLayer[],
  timelineFrame: number,
  pool: Map<string, HTMLVideoElement>,
  pass: 'above' | 'below' = 'above',
  onDecoded?: () => void,
  playing = false,
) {
  // Why a layer did or did not land on the canvas is invisible from a
  // screenshot: an unresolved source and a correctly hidden layer look the
  // same. Publish the reason so a check can read it instead of guessing.
  const diag = ((window as unknown as Record<string, unknown>).__roughCutOverlayDiag ??= {}) as Record<string, unknown>;
  const report: Record<string, unknown>[] = [];
  diag[pass] = { frame: timelineFrame, count: layers.length, layers: report };
  if (!layers.length) return;
  for (const layer of layers) {
    const from = Number(layer.from ?? 0);
    const duration = Number(layer.durationInFrames ?? 0);
    // Half-open interval, matching the timeline convention used everywhere else.
    if (duration > 0 && (timelineFrame < from || timelineFrame >= from + duration)) {
      report.push({ id: layer.id, type: layer.type, drawn: false, reason: 'not-under-playhead', from, duration });
      continue;
    }

    // Editor coordinates are in composition pixels; the canvas may be a
    // different size, so scale rather than assuming they match.
    const scaleX = canvasWidth / 1920;
    const scaleY = canvasHeight / 1080;
    const x = Number(layer.x ?? 0) * scaleX;
    const y = Number(layer.y ?? 0) * scaleY;
    const w = layer.width ? Number(layer.width) * scaleX : canvasWidth;
    const h = layer.height ? Number(layer.height) * scaleY : canvasHeight;

    if (layer.type === 'video' && layer.src) {
      const video = acquireOverlayVideo(pool, layer.src, onDecoded);
      const sourceStart = Number(layer.sourceStart ?? 0);
      const wantedSec = Math.max(0, (timelineFrame - from + sourceStart) / 30);
      // While the timeline runs, let the layer's own decoder run with it and
      // only correct real drift. Seeking it once per drawn frame — which is what
      // this used to do — makes every frame wait on a fresh decode and drags the
      // whole preview down. Paused, a seek is exactly right.
      const drift = Math.abs(video.currentTime - wantedSec);
      const hasDuration = Number.isFinite(video.duration);
      if (playing) {
        if (video.paused) { void video.play().catch(() => undefined); }
        if (hasDuration && drift > 0.35) {
          try { video.currentTime = wantedSec; } catch { /* seek before metadata */ }
        }
      } else {
        if (!video.paused) video.pause();
        if (hasDuration && drift > 0.12) {
          try { video.currentTime = wantedSec; } catch { /* seek before metadata */ }
        }
      }
      const ready = video.readyState >= 2;
      // Fresh frame when there is one, last decoded frame while a seek is in
      // flight. Never nothing — a covering layer must keep covering.
      const cached = ready ? cacheOverlayFrame(video) : overlayLayerFrameCache.get(video) ?? null;
      if (ready) ctx.drawImage(video, x, y, w, h);
      else if (cached) ctx.drawImage(cached, x, y, w, h);
      report.push({
        id: layer.id,
        type: 'video',
        drawn: ready || Boolean(cached),
        reason: ready ? 'drawn' : cached ? 'held-last-frame' : 'source-not-decodable',
        src: layer.src,
        readyState: video.readyState,
        networkState: video.networkState,
        error: video.error?.code ?? null,
        rect: { x, y, w, h },
      });
      continue;
    }
    if (layer.type === 'text' && layer.text) {
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.font = `${Math.round(48 * scaleY)}px sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(layer.text, x || canvasWidth * 0.1, y || canvasHeight * 0.1);
      ctx.restore();
      report.push({ id: layer.id, type: 'text', drawn: true, reason: 'drawn' });
      continue;
    }
    report.push({ id: layer.id, type: layer.type, drawn: false, reason: 'unsupported-layer-type' });
  }
}

function drawAlignmentGrid(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
  const columns = 12;
  const rows = 12;
  ctx.beginPath();
  for (let i = 1; i < columns; i += 1) {
    const x = (canvasWidth / columns) * i;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasHeight);
  }
  for (let i = 1; i < rows; i += 1) {
    const y = (canvasHeight / rows) * i;
    ctx.moveTo(0, y);
    ctx.lineTo(canvasWidth, y);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.32)';
  ctx.beginPath();
  ctx.moveTo(canvasWidth / 2, 0);
  ctx.lineTo(canvasWidth / 2, canvasHeight);
  ctx.moveTo(0, canvasHeight / 2);
  ctx.lineTo(canvasWidth, canvasHeight / 2);
  ctx.moveTo(canvasWidth / 3, 0);
  ctx.lineTo(canvasWidth / 3, canvasHeight);
  ctx.moveTo((canvasWidth / 3) * 2, 0);
  ctx.lineTo((canvasWidth / 3) * 2, canvasHeight);
  ctx.moveTo(0, canvasHeight / 3);
  ctx.lineTo(canvasWidth, canvasHeight / 3);
  ctx.moveTo(0, (canvasHeight / 3) * 2);
  ctx.lineTo(canvasWidth, (canvasHeight / 3) * 2);
  ctx.stroke();
  ctx.restore();
}

function drawEditorFrameControls(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number } | null,
  color: string,
  presentation?: Partial<CameraPresentation>,
) {
  if (!rect) return;
  const handleSize = Math.max(14, Math.min(26, Math.min(rect.w, rect.h) * 0.12));
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.setLineDash([12, 8]);
  if (presentation?.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, Math.min(rect.w, rect.h) / 2, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  }
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.78)';
  ctx.lineWidth = 4;
  const handles = presentation?.shape === 'circle' ? circleFrameHandles(rect) : frameResizeHandles(rect);
  for (const handle of handles) {
    ctx.beginPath();
    ctx.roundRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize, 5);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function circleFrameHandles(rect: { x: number; y: number; w: number; h: number }) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const r = Math.min(rect.w, rect.h) / 2;
  const d = r / Math.SQRT2;
  return [
    { x: cx - d, y: cy - d },
    { x: cx + d, y: cy - d },
    { x: cx + d, y: cy + d },
    { x: cx - d, y: cy + d },
  ];
}

function resolveCameraSourceRect(
  sourceWidth: number,
  sourceHeight: number,
  destWidth: number,
  destHeight: number,
  crop?: RegionCrop,
) {
  if (![sourceWidth, sourceHeight, destWidth, destHeight].every((value) => Number.isFinite(value) && value > 0)) {
    return null;
  }
  const cropEnabled = crop?.enabled === true;
  const base = cropEnabled
    ? {
        x: Math.max(0, Math.min(sourceWidth - 1, Math.round(crop.x))),
        y: Math.max(0, Math.min(sourceHeight - 1, Math.round(crop.y))),
        w: Math.max(1, Math.min(sourceWidth, Math.round(crop.width))),
        h: Math.max(1, Math.min(sourceHeight, Math.round(crop.height))),
      }
    : { x: 0, y: 0, w: sourceWidth, h: sourceHeight };
  base.w = Math.max(1, Math.min(base.w, sourceWidth - base.x));
  base.h = Math.max(1, Math.min(base.h, sourceHeight - base.y));
  const covered = coverSourceRect(base.w, base.h, destWidth, destHeight);
  if (!covered) return null;
  return {
    sx: base.x + covered.sx,
    sy: base.y + covered.sy,
    sw: covered.sw,
    sh: covered.sh,
  };
}

function resolveScreenSourceViewport(sourceWidth: number, sourceHeight: number, crop?: RegionCrop) {
  if (![sourceWidth, sourceHeight].every((value) => Number.isFinite(value) && value > 0)) {
    return { x: 0, y: 0, w: Math.max(1, sourceWidth || 1), h: Math.max(1, sourceHeight || 1) };
  }
  if (crop?.enabled !== true) return { x: 0, y: 0, w: sourceWidth, h: sourceHeight };
  const x = Math.max(0, Math.min(sourceWidth - 1, Math.round(crop.x)));
  const y = Math.max(0, Math.min(sourceHeight - 1, Math.round(crop.y)));
  const w = Math.max(1, Math.min(sourceWidth - x, Math.round(crop.width)));
  const h = Math.max(1, Math.min(sourceHeight - y, Math.round(crop.height)));
  return { x, y, w, h };
}

function resolveCameraRadius(
  presentation: { shape?: string; roundness?: number } | undefined,
  frame: { w: number; h: number },
) {
  if (presentation?.shape === 'square') return 0;
  if (presentation?.shape === 'circle') return Math.min(frame.w, frame.h) / 2;
  return (Math.min(frame.w, frame.h) / 2) * Math.max(0, Math.min(1, (presentation?.roundness ?? 50) / 100));
}

function addRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function isEditableShortcutTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, button, [contenteditable="true"]'));
}

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainder = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}
