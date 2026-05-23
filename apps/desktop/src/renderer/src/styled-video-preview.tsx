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
  const cameraDragRef = React.useRef<NormalizedRect | null>(null);
  const cameraRectRef = React.useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const cameraDragOriginRef = React.useRef<PreviewDragOrigin | null>(null);
  const screenDragRef = React.useRef<NormalizedRect | null>(null);
  const screenRectRef = React.useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const screenDragOriginRef = React.useRef<PreviewDragOrigin | null>(null);
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
  const isDraggingFocalRef = React.useRef(false);
  isDraggingFocalRef.current = isDraggingFocal;
  const [currentTime, setCurrentTime] = React.useState(0);
  const currentTimeRef = React.useRef(0);
  const [internalPlaying, setInternalPlaying] = React.useState(false);
  const [sourceMediaDuration, setSourceMediaDuration] = React.useState<number | null>(null);
  const [cameraMediaDuration, setCameraMediaDuration] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [cursorOffscreen, setCursorOffscreen] = React.useState<CursorOffscreenStatus>(null);
  const cursorOffscreenRef = React.useRef<CursorOffscreenStatus>(null);

  // Force one repaint when the selected zoom focus changes so the target
  // appears/moves/disappears even while the playhead is parked on one frame.
  React.useEffect(() => {
    previewInteractionDirtyRef.current = true;
  }, [selectedZoomFocal?.id, selectedZoomFocal?.x, selectedZoomFocal?.y]);

  const isPlaying = controlledPlaying ?? internalPlaying;
  const src = project.mediaUrl ?? '';
  const cameraSrc = project.cameraMediaUrl ?? '';
  const sourceWidth = project.recording?.width ?? 1920;
  const sourceHeight = project.recording?.height ?? 1080;
  const fps = project.recording?.fps ?? 30;
  const cameraSourceInFrames = (project.recording?.camera as { sourceInFrames?: number } | null | undefined)?.sourceInFrames ?? 0;
  const cameraSourceOffsetSec = Math.max(0, cameraSourceInFrames / fps);
  const aspectRatio = project.document.settings?.aspectRatio ?? 'auto';
  const canvasResolution = getStyledCanvasResolution({ aspectRatio, sourceWidth, sourceHeight });
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

  function updateCurrentTime(nextTime: number) {
    currentTimeRef.current = nextTime;
    setCurrentTime(nextTime);
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

  React.useEffect(() => {
    setSourceMediaDuration(null);
    setCameraMediaDuration(null);
    updateCurrentTime(0);
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
    if (timeMode === 'timeline') {
      video.pause();
      cameraVideo?.pause();
      return;
    }
    if (controlledPlaying) {
      void video.play().catch(() => onPlayingChange?.(false));
      void cameraVideo?.play().catch(() => undefined);
    } else {
      video.pause();
      cameraVideo?.pause();
    }
  }, [controlledPlaying, onPlayingChange, timeMode]);

  React.useEffect(() => {
    if (timeMode !== 'timeline' || controlledPlaying !== undefined || !isPlaying) return undefined;
    let rafId = 0;
    let lastMs: number | null = null;

    function tick(nowMs: number) {
      if (lastMs === null) {
        lastMs = nowMs;
        rafId = window.requestAnimationFrame(tick);
        return;
      }

      const rate = Math.max(0.05, videoRef.current?.playbackRate ?? 1);
      const nextTime = currentTimeRef.current + ((nowMs - lastMs) / 1000) * rate;
      lastMs = nowMs;
      if (nextTime >= timelineDuration) {
        updateCurrentTime(timelineDuration);
        onCurrentTimeChange?.(timelineDuration);
        setInternalPlaying(false);
        onPlayingChange?.(false);
        return;
      }

      updateCurrentTime(nextTime);
      onCurrentTimeChange?.(nextTime);
      rafId = window.requestAnimationFrame(tick);
    }

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [timeMode, controlledPlaying, isPlaying, timelineDuration, onCurrentTimeChange, onPlayingChange]);

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
      updateCurrentTime(Math.max(0, requestedTime));
      onCurrentTimeChange?.(Math.max(0, requestedTime));
      seekingRef.current = false;
      previewInteractionDirtyRef.current = true;
      return;
    }
    const nextTime = Math.max(trimStartSec, Math.min(requestedSourceTime, Math.min(effectiveTrimEndSec, maxTime)));
    if (Math.abs(video.currentTime - nextTime) < 0.05) {
      const nextDisplayTime = timeMode === 'timeline' ? Math.max(0, requestedTime) : sourceTimeToVisibleTime(nextTime);
      updateCurrentTime(nextDisplayTime);
      onCurrentTimeChange?.(nextDisplayTime);
      seekingRef.current = false;
      return;
    }
    seekingRef.current = true;
    video.currentTime = nextTime;
    syncCameraTime(nextTime);
    const nextDisplayTime = timeMode === 'timeline' ? Math.max(0, requestedTime) : sourceTimeToVisibleTime(nextTime);
    updateCurrentTime(nextDisplayTime);
    onCurrentTimeChange?.(nextDisplayTime);
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
    let lastDrawnFrame = -1;
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

    const fillBackground = () => {
      const [backgroundStart, backgroundEnd] = getRecordingBackgroundColors(background);
      const gradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
      gradient.addColorStop(0, backgroundStart);
      gradient.addColorStop(1, backgroundEnd);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    };

    function tick() {
      if (!video || !canvas || !ctx) return;
      if (video.seeking || seekingRef.current || video.readyState < 2) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }
      if (cameraVideo && cameraSrc && cameraVideo.seeking && cameraCoversSourceTime(video.currentTime, cameraSourceOffsetSec, cameraVideo.duration, fps)) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }
      const sourceFrame = Math.max(0, Math.round(video.currentTime * fps));
      const currentFrame = timeMode === 'timeline' ? Math.max(0, Math.round(currentTimeRef.current * fps)) : sourceFrame;
      if (currentFrame === lastDrawnFrame && !previewInteractionDirtyRef.current && (timeMode !== 'timeline' || video.paused)) {
        rafId = window.requestAnimationFrame(tick);
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
        updateCurrentTime(clampedVisibleTime);
        onCurrentTimeChange?.(clampedVisibleTime);
      }
      const cutEnd = cutEndForSourceTime(video.currentTime);
      if (timeMode !== 'timeline' && cutEnd !== null) {
        video.currentTime = cutEnd;
        syncCameraTime(cutEnd);
        lastDrawnFrame = -1;
        rafId = window.requestAnimationFrame(tick);
        return;
      }
      if (!video.paused && timeMode !== 'timeline') {
        const visibleTime = sourceTimeToVisibleTime(video.currentTime);
        updateCurrentTime(Math.min(visibleTime, visibleDuration));
        onCurrentTimeChange?.(Math.min(visibleTime, visibleDuration));
      }
      let frame;
      try {
        frame = timeMode === 'timeline'
          ? resolveTimelinePreviewFrame(document, currentFrame, { getCursorPosition: getCursorPositionForFrame })
          : resolveFrame(document, currentFrame, {
              getCursorPosition: getCursorPositionForFrame,
            });
      } catch {
        frame = { cameraTransform: { scale: 1, offsetX: 0, offsetY: 0 } };
      }
      const screenLayer = frame.layers?.find((layer: { isCamera?: boolean }) => !layer.isCamera) ?? null;
      if (timeMode === 'timeline' && screenLayer) {
        const expectedSourceTime = Math.max(0, screenLayer.sourceFrame / fps);
        const sourceSyncTolerance = isPlaying ? Math.max(0.12, 4 / fps) : Math.max(0.035, 1 / fps);
        if (Math.abs(video.currentTime - expectedSourceTime) > sourceSyncTolerance) {
          video.currentTime = expectedSourceTime;
          syncCameraTime(expectedSourceTime);
          lastDrawnFrame = -1;
          rafId = window.requestAnimationFrame(tick);
          return;
        }
      }
      const { scale, offsetX, offsetY } = frame.cameraTransform ?? { scale: 1, offsetX: 0, offsetY: 0 };
      const dragScreenRect = screenDragRef.current;
      const resolvedScreenFrame = dragScreenRect
        ? { x: dragScreenRect.x * canvasWidth, y: dragScreenRect.y * canvasHeight, w: dragScreenRect.w * canvasWidth, h: dragScreenRect.h * canvasHeight }
        : resolveScreenFrame(frame.screenFrame, defaultScreenX, defaultScreenY, defaultScreenWidth, defaultScreenHeight, canvasWidth, canvasHeight);
      const screenDrawScale = Math.min(resolvedScreenFrame.w / sourceWidth, resolvedScreenFrame.h / sourceHeight);
      const screenWidth = sourceWidth * screenDrawScale;
      const screenHeight = sourceHeight * screenDrawScale;
      const screenX = resolvedScreenFrame.x + (resolvedScreenFrame.w - screenWidth) / 2;
      const screenY = resolvedScreenFrame.y + (resolvedScreenFrame.h - screenHeight) / 2;
      const screenRadius = Math.max(0, Math.min(background.bgCornerRadius, Math.min(screenWidth, screenHeight) / 2));
      screenRectRef.current = { x: screenX, y: screenY, w: screenWidth, h: screenHeight };
      const backgroundImage = backgroundImageRef.current;
      if (backgroundImage?.complete && backgroundImage.naturalWidth > 0 && backgroundImage.naturalHeight > 0) {
        fillBackground();
        ctx.drawImage(backgroundImage, 0, 0, canvasWidth, canvasHeight);
      } else {
        fillBackground();
      }
      if (timeMode === 'timeline' && !screenLayer) {
        publishCursorOffscreenStatus(null);
        // Keep the focus target visible/draggable even over a timeline gap,
        // anchored to the last-known screen rect.
        const gapFocal = selectedZoomFocalRef.current;
        const gapRect = screenRectRef.current;
        if (gapFocal && gapRect) {
          const live = focalDragRef.current ?? { x: gapFocal.x, y: gapFocal.y };
          drawFocalTarget(ctx, gapRect.x + live.x * gapRect.w, gapRect.y + live.y * gapRect.h, focalTargetRadius(canvasWidth, canvasHeight), isDraggingFocalRef.current);
        }
        rafId = window.requestAnimationFrame(tick);
        return;
      }
      if (background.bgShadowEnabled && background.bgShadowOpacity > 0 && background.bgShadowBlur > 0) {
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
      if (onScreenFrameChange) drawEditorFrameControls(ctx, screenRectRef.current, '#38bdf8');
      ctx.save();
      addRoundedRect(ctx, screenX, screenY, screenWidth, screenHeight, screenRadius);
      ctx.clip();
      ctx.translate(screenX, screenY);
      ctx.scale(screenDrawScale, screenDrawScale);
      ctx.translate(sourceWidth / 2 + offsetX, sourceHeight / 2 + offsetY);
      ctx.scale(scale, scale);
      ctx.translate(-sourceWidth / 2, -sourceHeight / 2);
      ctx.drawImage(video, 0, 0, sourceWidth, sourceHeight);
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
      if (nextOffscreen) {
        drawCursorOffscreenMarker(ctx, nextOffscreen, cursorPos, {
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
        if (Math.abs(cameraVideo.currentTime - expectedCameraTime) > Math.max(0.12, 2 / fps)) {
          cameraVideo.currentTime = expectedCameraTime;
          lastDrawnFrame = -1;
          rafId = window.requestAnimationFrame(tick);
          return;
        }
        const dragRect = cameraDragRef.current;
        const cameraFrame = dragRect
          ? { x: dragRect.x * canvasWidth, y: dragRect.y * canvasHeight, w: dragRect.w * canvasWidth, h: dragRect.h * canvasHeight }
          : resolveCameraFrame(frame.cameraFrame, frame.cameraPresentation, canvasWidth, canvasHeight);
        cameraRectRef.current = cameraFrame;
        (window as unknown as Record<string, boolean>).__roughCutCameraFramePresent = true;
        const cameraRadius = resolveCameraRadius(frame.cameraPresentation, cameraFrame);
        ctx.save();
        if (frame.cameraPresentation?.shadowEnabled !== false) {
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
        }
        ctx.restore();
        if (onCameraFrameChange) drawEditorFrameControls(ctx, cameraFrame, '#f59e0b');
      } else {
        cameraRectRef.current = null;
        (window as unknown as Record<string, boolean>).__roughCutCameraFramePresent = false;
      }
      const focalSelection = selectedZoomFocalRef.current;
      const focalScreenRect = screenRectRef.current;
      if (focalSelection && focalScreenRect) {
        const live = focalDragRef.current ?? { x: focalSelection.x, y: focalSelection.y };
        const focalCx = focalScreenRect.x + live.x * focalScreenRect.w;
        const focalCy = focalScreenRect.y + live.y * focalScreenRect.h;
        drawFocalTarget(ctx, focalCx, focalCy, focalTargetRadius(canvasWidth, canvasHeight), isDraggingFocalRef.current);
      }
      rafId = window.requestAnimationFrame(tick);
    }
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
    function publishCursorOffscreenStatus(next: CursorOffscreenStatus) {
      const previous = cursorOffscreenRef.current;
      const same = previous?.side === next?.side && Math.round((previous?.distance ?? 0) / 25) === Math.round((next?.distance ?? 0) / 25);
      if (same) return;
      cursorOffscreenRef.current = next;
      setCursorOffscreen(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cutRanges read via stable content key (cutRangesKey) to avoid per-frame loop restarts
  }, [project, sourceWidth, sourceHeight, fps, canvasResolution.width, canvasResolution.height, background, cameraSrc, cameraSourceOffsetSec, trimStartSec, effectiveTrimEndSec, cutRangesKey, visibleDuration, timeMode, onCurrentTimeChange]);

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
        onPlayingChange?.(false);
        return;
      }
      if (currentTimeRef.current >= timelineDuration - 1 / fps) {
        updateCurrentTime(0);
        onCurrentTimeChange?.(0);
      }
      setInternalPlaying(true);
      onPlayingChange?.(true);
      return;
    }

    if (video.paused) {
      try {
        const atEnd = video.ended || sourceTimeToVisibleTime(video.currentTime) >= visibleDuration - 1 / fps;
        if (atEnd) {
          const startTime = visibleTimeToSourceTime(0);
          video.currentTime = startTime;
          syncCameraTime(startTime);
          updateCurrentTime(0);
          onCurrentTimeChange?.(0);
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
  }

  async function playAtRate(rate: number) {
    const video = videoRef.current;
    const cameraVideo = cameraVideoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    if (cameraVideo) cameraVideo.playbackRate = rate;
    if (timeMode === 'timeline') {
      if (!isPlaying) {
        setInternalPlaying(true);
        onPlayingChange?.(true);
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
          onPlayingChange?.(false);
          return;
        }
        video.pause();
        cameraVideoRef.current?.pause();
      } else if (event.key.toLowerCase() === 'l') {
        event.preventDefault();
        void playAtRate(Math.min(4, video.playbackRate >= 1 ? video.playbackRate + 0.5 : 1));
      } else if (event.key.toLowerCase() === 'j') {
        event.preventDefault();
        void playAtRate(Math.max(0.25, video.playbackRate - 0.5));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showControls, visibleDuration, fps, trimStartSec, cutRanges, onCurrentTimeChange, onPlayingChange, timeMode, isPlaying, timelineDuration]);

  return (
    <div className="videoPreview styledPreview">
      <video
        ref={videoRef}
        src={src}
        preload="auto"
        className="hiddenSource"
        onLoadedMetadata={(event) => {
          setSourceMediaDuration(event.currentTarget.duration);
          if (trimStartSec > 0) event.currentTarget.currentTime = trimStartSec;
          setError(null);
        }}
        onPlay={() => {
          if (timeMode === 'timeline') return;
          setInternalPlaying(true);
          onPlayingChange?.(true);
        }}
        onPause={() => {
          if (timeMode === 'timeline') return;
          setInternalPlaying(false);
          onPlayingChange?.(false);
        }}
        onEnded={() => {
          if (timeMode === 'timeline') return;
          setInternalPlaying(false);
          onPlayingChange?.(false);
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
          onCurrentTimeChange?.(Math.min(visibleTime, visibleDuration));
        }}
      />
      {cameraSrc ? <video ref={cameraVideoRef} src={cameraSrc} preload="auto" className="hiddenSource" muted onLoadedMetadata={(event) => setCameraMediaDuration(event.currentTarget.duration)} /> : null}
      <canvas
        ref={canvasRef}
        className={`styledPreviewCanvas${isDraggingCamera ? ' draggingCamera' : ''}${isDraggingScreen ? ' draggingScreen' : ''}${isDraggingFocal ? ' draggingFocal' : ''}`}
        aria-label="Styled preview"
        data-camera-draggable={onCameraFrameChange ? 'true' : 'false'}
        data-screen-draggable={onScreenFrameChange ? 'true' : 'false'}
        style={{ aspectRatio: `${canvasResolution.width} / ${canvasResolution.height}` }}
        onPointerMove={(event) => {
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
