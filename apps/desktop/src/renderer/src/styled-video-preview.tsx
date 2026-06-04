import React from 'react';
import { Pause as PhosphorPause, Play as PhosphorPlay } from '@phosphor-icons/react';
import {
  resolveTimelineLengthFrames,
  createDefaultRecordingBackgroundStyle,
  getRecordingBackgroundColors,
  getStyledCanvasResolution,
  type NormalizedRect,
  type ProjectAspectRatio,
  type ProjectDocument,
  type RecordingBackgroundStyle,
  type TimelineClip,
} from '@rough-cut/project-model';
import { resolveFrame, resolveTimelineFrame, resolveTimelinePreviewFrame } from '@rough-cut/frame-resolver';
import { visibleDurationFrames, visibleFrameToSourceFrame } from './cut-ranges.mjs';
import { getCursorEvents } from './cursor-data.mjs';
import { getPrimaryRecordingAsset } from './zoom-markers.mjs';
import {
  cameraCoversSourceTime,
  clampedCameraTime,
  coverSourceRect,
  cursorAtTimeMs,
  cursorForResizeHandle,
  drawClickEmphasis,
  drawCursorPath,
  frameResizeHandles,
  getCursorBoundsStatus,
  moveRectFromPointer,
  resizeHandleAtPoint,
  resizeRectFromPointer,
  type PreviewDragOrigin,
} from './styled-preview.mjs';

const DEFAULT_RECORDING_BACKGROUND = createDefaultRecordingBackgroundStyle();
const PREVIEW_CANVAS_LONG_EDGE = 1280;
const PLAYBACK_DEBUG_LOG_LIMIT = 500;
const PLAYBACK_DRAW_COST_LOG_THRESHOLD_MS = 12;
const PLAYBACK_EXPECTED_DISPLAY_GAP_THRESHOLD_MS = 50;

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
export type ResolvedPreviewLayout = { screenFrame: NormalizedRect; cameraFrame: NormalizedRect | null };
type TimelinePlaybackSegment = {
  timelineIn: number;
  timelineOut: number;
  sourceIn: number;
  sourceOut: number;
  trackIndex: number;
};

export function StyledVideoPreview({
  project,
  seekTimeSec,
  trimStartSec = 0,
  trimEndSec,
  cutRanges = [],
  isPlaying: controlledPlaying,
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
}: {
  project: StyledPreviewProject;
  seekTimeSec?: number;
  trimStartSec?: number;
  trimEndSec?: number;
  cutRanges?: CutRange[];
  isPlaying?: boolean;
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
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const cameraVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
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
  const [isDraggingScreen, setIsDraggingScreen] = React.useState(false);
  const [isDraggingFocal, setIsDraggingFocal] = React.useState(false);
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
  const cursorOffscreenRef = React.useRef<CursorOffscreenStatus>(null);
  const isPlaying = controlledPlaying ?? internalPlaying;

  // Force one repaint when the selected zoom focus changes so the target
  // appears/moves/disappears even while the playhead is parked on one frame.
  React.useEffect(() => {
    if (timeMode === 'timeline' && isPlaying) return;
    previewInteractionDirtyRef.current = true;
  }, [isPlaying, selectedZoomFocal?.id, selectedZoomFocal?.x, selectedZoomFocal?.y, timeMode]);

  React.useEffect(() => {
    if (typeof PerformanceObserver === 'undefined') return undefined;
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          recordPlaybackDebug('main-thread-long-task', {
            startTime: Math.round(entry.startTime * 10) / 10,
            duration: Math.round(entry.duration * 10) / 10,
            name: entry.name,
          });
        }
      });
      observer.observe({ type: 'longtask', buffered: true } as PerformanceObserverInit);
    } catch {
      observer = null;
    }
    return () => observer?.disconnect();
  }, []);

  const src = project.mediaUrl ?? '';
  const cameraSrc = project.cameraMediaUrl ?? '';
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
    const nearStart = nextTime <= 0;
    const nearEnd = nextTime >= displayDuration - 1 / fps;
    const wholeSecondChanged = Math.floor(nextTime) !== Math.floor(last.timeSec);
    const shouldThrottle = timeMode === 'timeline' && isPlaying && !options.immediate;
    if (
      !shouldThrottle ||
      nearStart ||
      nearEnd ||
      wholeSecondChanged
    ) {
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
      updateCurrentTime(Math.max(0, seekTimeSec ?? 0));
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
      void video.play().catch(() => onPlayingChangeRef.current?.(false));
      void cameraVideo?.play().catch(() => undefined);
    } else {
      video.pause();
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
        segment = nextTimelineSegmentAfterFrame(segments, timelineFrame);
        if (!segment) {
          setInternalPlaying(false);
          onPlayingChangeRef.current?.(false);
          return;
        }
        timelineFrame = segment.timelineIn;
        updateCurrentTime(timelineFrame / fps, { immediate: true });
      }
      activeTimelineSegmentRef.current = segment;
      timelineFrameFallbackRef.current = timelineFrame;
      const sourceFrame = segment.sourceIn + (timelineFrame - segment.timelineIn);
      const sourceTime = Math.max(0, sourceFrame / fps);
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
      void video.play().catch(() => undefined);
      void cameraVideo?.play().catch(() => undefined);
    } else {
      video.pause();
      cameraVideo?.pause();
      video.playbackRate = timelineRateRef.current;
      if (cameraVideo) cameraVideo.playbackRate = timelineRateRef.current;
      activeTimelineSegmentRef.current = null;
      previewInteractionDirtyRef.current = true;
    }
  }, [timeMode, isPlaying, project, fps]);

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

  React.useEffect(() => {
    const video = videoRef.current;
    const cameraVideo = cameraVideoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return undefined;
    const screenVideo = video;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const canvasWidth = canvasResolution.width;
    const canvasHeight = canvasResolution.height;
    if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
    if (canvas.height !== canvasHeight) canvas.height = canvasHeight;
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
    let lastTickAtMs: number | null = null;
    let lastExpectedDisplayTimeMs: number | null = null;
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
    const backgroundGradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
    backgroundGradient.addColorStop(0, backgroundStart);
    backgroundGradient.addColorStop(1, backgroundEnd);
    const snapPlaybackCoord = (value: number) => (timeMode === 'timeline' && isPlaying ? Math.round(value) : value);
    const fillBackground = () => {
      ctx.fillStyle = backgroundGradient;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    };

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

    function scheduleNextDraw() {
      if (timeMode === 'timeline' && isPlaying && typeof screenVideo.requestVideoFrameCallback === 'function') {
        videoFrameCallbackId = screenVideo.requestVideoFrameCallback((now, metadata) => tick(now, metadata));
        return;
      }
      rafId = window.requestAnimationFrame((now) => tick(now));
    }

    function cancelScheduledDraw() {
      if (rafId) window.cancelAnimationFrame(rafId);
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
      updateCurrentTime(nextSegment.timelineIn / fps, { immediate: true });
      lastDrawnFrame = -1;
      return true;
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
      screenVideo.pause();
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
        const nextSegment = segment && decodedSourceFrame >= segment.sourceOut
          ? nextTimelineSegmentAfterFrame(segments, currentTimelineFrame)
          : timelineSegmentAtFrame(segments, currentTimelineFrame) ?? nextTimelineSegmentAfterFrame(segments, currentTimelineFrame);
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
      if (lastTickAtMs !== null) {
        const deltaMs = tickAtMs - lastTickAtMs;
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
      if (typeof metadata?.expectedDisplayTime === 'number') {
        if (lastExpectedDisplayTimeMs !== null) {
          const expectedGapMs = metadata.expectedDisplayTime - lastExpectedDisplayTimeMs;
          if (expectedGapMs > PLAYBACK_EXPECTED_DISPLAY_GAP_THRESHOLD_MS) {
            recordPlaybackDebug('render-expected-display-gap', {
              renderLoopId,
              expectedGapMs: Math.round(expectedGapMs * 10) / 10,
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
      }
      if (video.seeking || video.readyState < 2) {
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
      const sourceTime = timeMode === 'timeline' && Number.isFinite(metadata?.mediaTime)
        ? Number(metadata?.mediaTime)
        : video.currentTime;
      const sourceFrame = Math.max(0, Math.round(sourceTime * fps));
      const timelineDecoded = timeMode === 'timeline' && isPlaying
        ? handleTimelineDecodedFrame(sourceFrame)
        : null;
      if (timeMode === 'timeline' && isPlaying && !timelineDecoded) {
        recordPlaybackDebug('render-skip-no-timeline-frame', {
          renderLoopId,
          sourceFrame,
          sourceTime,
          activeSegment: activeTimelineSegmentRef.current,
        });
        scheduleNextDraw();
        return;
      }
      const currentFrame = timeMode === 'timeline'
        ? timelineDecoded?.timelineFrame ?? Math.max(0, Math.round(currentTimeRef.current * fps))
        : sourceFrame;
      if (timeMode === 'timeline' && isPlaying) {
        timelineFrameFallbackRef.current = currentFrame;
        updateCurrentTime(Math.min(timelineDuration, currentFrame / fps));
        (window as unknown as Record<string, unknown>).__roughCutTimelinePlaybackDebug = {
          phase: 'decoded-frame',
          driver: metadata ? 'rvfc' : 'raf',
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
        video.pause();
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
      const frame = resolveCurrentFrame(currentFrame);
      const activeTimelinePlayback = timeMode === 'timeline' && isPlaying;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = activeTimelinePlayback ? 'low' : 'high';
      const screenLayer = frame.layers?.find((layer: { isCamera?: boolean }) => !layer.isCamera) ?? null;
      const { scale, offsetX, offsetY } = frame.cameraTransform ?? { scale: 1, offsetX: 0, offsetY: 0 };
      const dragScreenRect = screenDragRef.current;
      const resolvedScreenFrame = dragScreenRect
        ? { x: dragScreenRect.x * canvasWidth, y: dragScreenRect.y * canvasHeight, w: dragScreenRect.w * canvasWidth, h: dragScreenRect.h * canvasHeight }
        : resolveScreenFrame(frame.screenFrame, defaultScreenX, defaultScreenY, defaultScreenWidth, defaultScreenHeight, canvasWidth, canvasHeight);
      const screenDrawScale = Math.min(resolvedScreenFrame.w / sourceWidth, resolvedScreenFrame.h / sourceHeight);
      const screenWidth = snapPlaybackCoord(sourceWidth * screenDrawScale);
      const screenHeight = snapPlaybackCoord(sourceHeight * screenDrawScale);
      const screenX = snapPlaybackCoord(resolvedScreenFrame.x + (resolvedScreenFrame.w - screenWidth) / 2);
      const screenY = snapPlaybackCoord(resolvedScreenFrame.y + (resolvedScreenFrame.h - screenHeight) / 2);
      const effectiveScreenDrawScale = screenWidth / sourceWidth;
      const screenRadius = Math.max(0, Math.min(background.bgCornerRadius, Math.min(screenWidth, screenHeight) / 2));
      screenRectRef.current = { x: screenX, y: screenY, w: screenWidth, h: screenHeight };
      screenRadiusRef.current = screenRadius;
      markDrawPhase('resolve-layout');
      const backgroundImage = backgroundImageRef.current;
      if (backgroundImage?.complete && backgroundImage.naturalWidth > 0 && backgroundImage.naturalHeight > 0) {
        fillBackground();
        ctx.drawImage(backgroundImage, 0, 0, canvasWidth, canvasHeight);
      } else {
        fillBackground();
      }
      markDrawPhase('background');
      if (timeMode === 'timeline' && !screenLayer) {
        publishCursorOffscreenStatus(null);
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
      ctx.translate(screenX, screenY);
      ctx.scale(effectiveScreenDrawScale, effectiveScreenDrawScale);
      ctx.translate(sourceWidth / 2 + offsetX, sourceHeight / 2 + offsetY);
      ctx.scale(scale, scale);
      ctx.translate(-sourceWidth / 2, -sourceHeight / 2);
      try {
        ctx.drawImage(video, 0, 0, sourceWidth, sourceHeight);
      } catch {
        ctx.restore();
        scheduleNextDraw();
        return;
      }
      markDrawPhase('screen-video');
      const resolvedCursor = frame.cursor;
      const cursorFrame = timeMode === 'timeline' ? screenLayer?.sourceFrame ?? currentFrame : currentFrame;
      drawClickEmphasis(ctx, cursorEvents, cursorFrame, resolvedCursor?.clickEffect ?? 'ring');
      const cursorPos = cursorAtTimeMs(cursorEvents, (cursorFrame / fps) * 1000, fps);
      const cursorBounds = getCursorBoundsStatus(cursorPos, sourceWidth, sourceHeight);
      const nextOffscreen = cursorBounds && !cursorBounds.inside
        ? { side: cursorBounds.side as 'left' | 'right' | 'top' | 'bottom', distance: cursorBounds.distance }
        : null;
      publishCursorOffscreenStatus(nextOffscreen);
      if (cursorPos && resolvedCursor?.visible !== false && cursorBounds?.inside !== false) {
        drawCursorPath(ctx, cursorPos.x, cursorPos.y, {
          style: resolvedCursor?.style ?? 'default',
          sizePercent: resolvedCursor?.sizePercent ?? 100,
        });
      }
      ctx.restore();
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
      const cameraHasFrame = Boolean(
        cameraVideo &&
        cameraSrc &&
        cameraVideo.readyState >= 2 &&
        frame.cameraPresentation?.visible !== false &&
        cameraCoversSourceTime((screenLayer?.sourceFrame ?? sourceFrame) / fps, cameraSourceOffsetSec, cameraVideo.duration, fps),
      );
      if (cameraHasFrame && cameraVideo) {
        const expectedCameraTime = clampedCameraTime((screenLayer?.sourceFrame ?? sourceFrame) / fps, cameraSourceOffsetSec, cameraVideo.duration, fps);
        if (timeMode !== 'timeline' && Math.abs(cameraVideo.currentTime - expectedCameraTime) > Math.max(0.12, 2 / fps)) {
          cameraVideo.currentTime = expectedCameraTime;
          lastDrawnFrame = -1;
          scheduleNextDraw();
          return;
        }
        const dragRect = cameraDragRef.current;
        const rawCameraFrame = dragRect
          ? { x: dragRect.x * canvasWidth, y: dragRect.y * canvasHeight, w: dragRect.w * canvasWidth, h: dragRect.h * canvasHeight }
          : resolveCameraFrame(frame.cameraFrame, frame.cameraPresentation, canvasWidth, canvasHeight);
        const cameraFrame = activeTimelinePlayback
          ? {
              x: Math.round(rawCameraFrame.x),
              y: Math.round(rawCameraFrame.y),
              w: Math.round(rawCameraFrame.w),
              h: Math.round(rawCameraFrame.h),
            }
          : rawCameraFrame;
        cameraRectRef.current = cameraFrame;
        (window as unknown as Record<string, unknown>).__roughCutCanvasCameraRect = {
          x: cameraFrame.x / canvasWidth,
          y: cameraFrame.y / canvasHeight,
          w: cameraFrame.w / canvasWidth,
          h: cameraFrame.h / canvasHeight,
        };
        (window as unknown as Record<string, boolean>).__roughCutCameraFramePresent = true;
        const cameraRadius = resolveCameraRadius(frame.cameraPresentation, cameraFrame);
        cameraRadiusRef.current = cameraRadius;
        ctx.save();
        if (!activeTimelinePlayback && frame.cameraPresentation?.shadowEnabled !== false) {
          ctx.shadowColor = `rgba(0, 0, 0, ${frame.cameraPresentation?.shadowOpacity ?? 0.45})`;
          ctx.shadowBlur = frame.cameraPresentation?.shadowBlur ?? 24;
          ctx.shadowOffsetY = 8;
        }
        addRoundedRect(ctx, cameraFrame.x, cameraFrame.y, cameraFrame.w, cameraFrame.h, cameraRadius);
        ctx.clip();
        const cameraSource = coverSourceRect(
          cameraVideo.videoWidth,
          cameraVideo.videoHeight,
          cameraFrame.w,
          cameraFrame.h,
        );
        if (cameraSource) {
          try {
            ctx.drawImage(
              cameraVideo,
              cameraSource.sx,
              cameraSource.sy,
              cameraSource.sw,
              cameraSource.sh,
              cameraFrame.x,
              cameraFrame.y,
              cameraFrame.w,
              cameraFrame.h,
            );
          } catch {
            // The camera element can report seeking while playback is still
            // advancing. Keep the screen frame alive and draw PiP on the next
            // decoded camera frame instead of killing the whole preview loop.
          }
        }
        ctx.restore();
        if (!activeTimelinePlayback && onCameraFrameChange) drawEditorFrameControls(ctx, cameraFrame, '#f59e0b');
      } else {
        cameraRectRef.current = null;
        (window as unknown as Record<string, unknown>).__roughCutCanvasCameraRect = null;
        (window as unknown as Record<string, boolean>).__roughCutCameraFramePresent = false;
      }
      markDrawPhase('camera-pip');
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
    function publishCursorOffscreenStatus(next: CursorOffscreenStatus) {
      const previous = cursorOffscreenRef.current;
      const same = previous?.side === next?.side && Math.round((previous?.distance ?? 0) / 25) === Math.round((next?.distance ?? 0) / 25);
      if (same) return;
      cursorOffscreenRef.current = next;
      setCursorOffscreen(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cutRanges read via stable content key (cutRangesKey) to avoid per-frame loop restarts
  }, [project, sourceWidth, sourceHeight, fps, canvasResolution.width, canvasResolution.height, background, cameraSrc, cameraSourceOffsetSec, trimStartSec, effectiveTrimEndSec, cutRangesKey, visibleDuration, timelineDuration, timeMode, isPlaying]);

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
        await video.play();
        await cameraVideo?.play().catch(() => undefined);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Video playback failed.');
      }
      return;
    }

    video.pause();
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
        video.pause();
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
        onPlay={() => {
          if (timeMode === 'timeline') return;
          setInternalPlaying(true);
          onPlayingChangeRef.current?.(true);
        }}
        onPause={() => {
          if (timeMode === 'timeline') return;
          setInternalPlaying(false);
          onPlayingChangeRef.current?.(false);
        }}
        onEnded={() => {
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
        ref={canvasRef}
        className={`styledPreviewCanvas${!isPlaying && isDraggingCamera ? ' draggingCamera' : ''}${!isPlaying && isDraggingScreen ? ' draggingScreen' : ''}${!isPlaying && isDraggingFocal ? ' draggingFocal' : ''}`}
        aria-label="Styled preview"
        data-camera-draggable={onCameraFrameChange ? 'true' : 'false'}
        data-screen-draggable={onScreenFrameChange ? 'true' : 'false'}
        style={{ aspectRatio: `${canvasResolution.width} / ${canvasResolution.height}` }}
        onPointerMove={(event) => {
          if (timeMode === 'timeline' && isPlaying) return;
          const canvas = canvasRef.current;
          if (!canvas || (!onCameraFrameChange && !onScreenFrameChange && !onZoomFocalChange)) return;
          const rect = canvas.getBoundingClientRect();
          const xCanvas = ((event.clientX - rect.left) * canvas.width) / rect.width;
          const yCanvas = ((event.clientY - rect.top) * canvas.height) / rect.height;
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
          event.currentTarget.style.cursor = cameraHandle ? cursorForResizeHandle(cameraHandle) : screenHandle ? cursorForResizeHandle(screenHandle) : overScreenForFocal ? 'crosshair' : overCamera || overScreen ? 'grab' : '';
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
          if (!canvas || (!onCameraFrameChange && !onScreenFrameChange && !onZoomFocalChange)) return;
          const rect = canvas.getBoundingClientRect();
          const xCanvas = ((event.clientX - rect.left) * canvas.width) / rect.width;
          const yCanvas = ((event.clientY - rect.top) * canvas.height) / rect.height;
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
  presentation: { position?: string; size?: number } | undefined,
  canvasWidth: number,
  canvasHeight: number,
) {
  if (normalizedFrame) {
    return {
      x: normalizedFrame.x * canvasWidth,
      y: normalizedFrame.y * canvasHeight,
      w: normalizedFrame.w * canvasWidth,
      h: normalizedFrame.h * canvasHeight,
    };
  }
  const sizeScale = Math.max(0.5, Math.min(2, (presentation?.size ?? 100) / 100));
  const width = Math.round(Math.min(canvasWidth, canvasHeight) * 0.22 * sizeScale);
  const height = width;
  const margin = Math.round(Math.min(canvasWidth, canvasHeight) * 0.06);
  const position = presentation?.position ?? 'corner-br';
  const left = position.endsWith('bl') || position.endsWith('tl');
  const top = position.endsWith('tl') || position.endsWith('tr');
  if (position === 'center') return { x: (canvasWidth - width) / 2, y: (canvasHeight - height) / 2, w: width, h: height };
  return {
    x: left ? margin : canvasWidth - width - margin,
    y: top ? margin : canvasHeight - height - margin,
    w: width,
    h: height,
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

function drawEditorFrameControls(ctx: CanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number } | null, color: string) {
  if (!rect) return;
  const handleSize = Math.max(14, Math.min(26, Math.min(rect.w, rect.h) * 0.12));
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.setLineDash([12, 8]);
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.78)';
  ctx.lineWidth = 4;
  for (const handle of frameResizeHandles(rect)) {
    ctx.beginPath();
    ctx.roundRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize, 5);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
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
