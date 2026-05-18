import React from 'react';
import { Pause as PhosphorPause, Play as PhosphorPlay } from '@phosphor-icons/react';
import {
  createDefaultRecordingBackgroundStyle,
  getRecordingBackgroundColors,
  getStyledCanvasResolution,
  type NormalizedRect,
  type ProjectAspectRatio,
  type ProjectDocument,
  type RecordingBackgroundStyle,
} from '@rough-cut/project-model';
import { resolveFrame } from '@rough-cut/frame-resolver';
import { visibleDurationFrames, visibleFrameToSourceFrame } from './cut-ranges.mjs';
import { getCursorEvents } from './cursor-data.mjs';
import { getPrimaryRecordingAsset } from './zoom-markers.mjs';
import {
  cameraCoversSourceTime,
  clampedCameraTime,
  coverSourceRect,
  cursorAtFrame,
  cursorForResizeHandle,
  drawClickEmphasis,
  drawCursorPath,
  frameResizeHandles,
  moveRectFromPointer,
  resizeHandleAtPoint,
  resizeRectFromPointer,
  type PreviewDragOrigin,
} from './styled-preview.mjs';

const DEFAULT_RECORDING_BACKGROUND = createDefaultRecordingBackgroundStyle();

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

export function StyledVideoPreview({
  project,
  seekTimeSec,
  trimStartSec = 0,
  trimEndSec,
  cutRanges = [],
  isPlaying: controlledPlaying,
  showControls = true,
  onCurrentTimeChange,
  onPlayingChange,
  onCameraFrameChange,
  onScreenFrameChange,
  onSourceMediaDurationChange,
}: {
  project: StyledPreviewProject;
  seekTimeSec?: number;
  trimStartSec?: number;
  trimEndSec?: number;
  cutRanges?: CutRange[];
  isPlaying?: boolean;
  showControls?: boolean;
  onCurrentTimeChange?: (sec: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  onCameraFrameChange?: (frame: NormalizedRect | null) => void;
  onScreenFrameChange?: (frame: NormalizedRect | null) => void;
  onSourceMediaDurationChange?: (sec: number | null) => void;
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
  const [currentTime, setCurrentTime] = React.useState(0);
  const [internalPlaying, setInternalPlaying] = React.useState(false);
  const [sourceMediaDuration, setSourceMediaDuration] = React.useState<number | null>(null);
  const [cameraMediaDuration, setCameraMediaDuration] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

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

  function visibleTimeToSourceTime(visibleTimeSec: number) {
    const visibleFrame = Math.round(Math.max(0, visibleTimeSec) * fps);
    return trimStartSec + visibleFrameToSourceFrame(cutRanges, visibleFrame, trimDurationFrames) / fps;
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
    setCurrentTime(0);
    setInternalPlaying(false);
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
    pendingSeekRef.current = seekTimeSec ?? 0;
    if (!seekingRef.current) flushPendingExternalSeek();
  }, [seekTimeSec, cameraSourceOffsetSec]);

  React.useEffect(() => {
    const video = videoRef.current;
    const cameraVideo = cameraVideoRef.current;
    if (!video || controlledPlaying === undefined) return;
    if (controlledPlaying) {
      void video.play().catch(() => onPlayingChange?.(false));
      void cameraVideo?.play().catch(() => undefined);
    } else {
      video.pause();
      cameraVideo?.pause();
    }
  }, [controlledPlaying, onPlayingChange]);

  function flushPendingExternalSeek() {
    const video = videoRef.current;
    if (!video) return;
    const requestedTime = pendingSeekRef.current;
    if (requestedTime === null) {
      seekingRef.current = false;
      return;
    }
    const maxTime = video.duration || requestedTime;
    const nextTime = Math.max(trimStartSec, Math.min(visibleTimeToSourceTime(requestedTime), Math.min(effectiveTrimEndSec, maxTime)));
    pendingSeekRef.current = null;
    if (Math.abs(video.currentTime - nextTime) < 0.05) {
      seekingRef.current = false;
      return;
    }
    seekingRef.current = true;
    video.currentTime = nextTime;
    syncCameraTime(nextTime);
    const nextVisibleTime = sourceTimeToVisibleTime(nextTime);
    setCurrentTime(nextVisibleTime);
    onCurrentTimeChange?.(nextVisibleTime);
  }

  function handleSeekSettled() {
    if (pendingSeekRef.current !== null) {
      flushPendingExternalSeek();
      return;
    }
    seekingRef.current = false;
  }

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
      const sourcePoint = cursorAtFrame(cursorEvents, frame);
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
      const currentFrame = Math.max(0, Math.round(video.currentTime * fps));
      if (currentFrame === lastDrawnFrame && !previewInteractionDirtyRef.current) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }
      previewInteractionDirtyRef.current = false;
      lastDrawnFrame = currentFrame;
      (window as unknown as Record<string, number>).__roughCutCanvasDrawCount =
        ((window as unknown as Record<string, number>).__roughCutCanvasDrawCount ?? 0) + 1;
      if (Number.isFinite(effectiveTrimEndSec) && video.currentTime > effectiveTrimEndSec + 0.02) {
        video.pause();
        video.currentTime = effectiveTrimEndSec;
        const clampedVisibleTime = Math.max(0, effectiveTrimEndSec - trimStartSec);
        setCurrentTime(clampedVisibleTime);
        onCurrentTimeChange?.(clampedVisibleTime);
      }
      const cutEnd = cutEndForSourceTime(video.currentTime);
      if (cutEnd !== null) {
        video.currentTime = cutEnd;
        syncCameraTime(cutEnd);
        lastDrawnFrame = -1;
        rafId = window.requestAnimationFrame(tick);
        return;
      }
      if (!video.paused) {
        const visibleTime = sourceTimeToVisibleTime(video.currentTime);
        setCurrentTime(Math.min(visibleTime, visibleDuration));
        onCurrentTimeChange?.(Math.min(visibleTime, visibleDuration));
      }
      let frame;
      try {
        frame = resolveFrame(document, currentFrame, {
          getCursorPosition: getCursorPositionForFrame,
        });
      } catch {
        frame = { cameraTransform: { scale: 1, offsetX: 0, offsetY: 0 } };
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
      drawClickEmphasis(ctx, cursorEvents, currentFrame, resolvedCursor?.clickEffect ?? 'ring');
      const cursorPos = cursorAtFrame(cursorEvents, currentFrame);
      if (cursorPos && resolvedCursor?.visible !== false) {
        drawCursorPath(ctx, cursorPos.x, cursorPos.y, {
          style: resolvedCursor?.style ?? 'default',
          sizePercent: resolvedCursor?.sizePercent ?? 100,
        });
      }
      ctx.restore();
      const cameraHasFrame = Boolean(
        cameraVideo &&
        cameraSrc &&
        cameraVideo.readyState >= 2 &&
        frame.cameraPresentation?.visible !== false &&
        cameraCoversSourceTime(video.currentTime, cameraSourceOffsetSec, cameraVideo.duration, fps),
      );
      if (cameraHasFrame && cameraVideo) {
        const expectedCameraTime = clampedCameraTime(video.currentTime, cameraSourceOffsetSec, cameraVideo.duration, fps);
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
      rafId = window.requestAnimationFrame(tick);
    }
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [project, sourceWidth, sourceHeight, fps, canvasResolution.width, canvasResolution.height, background, cameraSrc, cameraSourceOffsetSec, trimStartSec, effectiveTrimEndSec, cutRanges, visibleDuration, onCurrentTimeChange]);

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

    if (video.paused) {
      try {
        const atEnd = video.ended || sourceTimeToVisibleTime(video.currentTime) >= visibleDuration - 1 / fps;
        if (atEnd) {
          const startTime = visibleTimeToSourceTime(0);
          video.currentTime = startTime;
          syncCameraTime(startTime);
          setCurrentTime(0);
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
  }, [showControls, visibleDuration, fps, trimStartSec, cutRanges, onCurrentTimeChange]);

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
          setInternalPlaying(true);
          onPlayingChange?.(true);
        }}
        onPause={() => {
          setInternalPlaying(false);
          onPlayingChange?.(false);
        }}
        onEnded={() => {
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
          setCurrentTime(Math.min(visibleTime, visibleDuration));
          onCurrentTimeChange?.(Math.min(visibleTime, visibleDuration));
        }}
      />
      {cameraSrc ? <video ref={cameraVideoRef} src={cameraSrc} preload="auto" className="hiddenSource" muted onLoadedMetadata={(event) => setCameraMediaDuration(event.currentTarget.duration)} /> : null}
      <canvas
        ref={canvasRef}
        className={`styledPreviewCanvas${isDraggingCamera ? ' draggingCamera' : ''}${isDraggingScreen ? ' draggingScreen' : ''}`}
        aria-label="Styled preview"
        data-camera-draggable={onCameraFrameChange ? 'true' : 'false'}
        data-screen-draggable={onScreenFrameChange ? 'true' : 'false'}
        style={{ aspectRatio: `${canvasResolution.width} / ${canvasResolution.height}` }}
        onPointerMove={(event) => {
          const canvas = canvasRef.current;
          if (!canvas || (!onCameraFrameChange && !onScreenFrameChange)) return;
          const rect = canvas.getBoundingClientRect();
          const xCanvas = ((event.clientX - rect.left) * canvas.width) / rect.width;
          const yCanvas = ((event.clientY - rect.top) * canvas.height) / rect.height;
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
          const cameraRect = cameraRectRef.current;
          const overCamera = !!onCameraFrameChange && !!cameraRect && xCanvas >= cameraRect.x && xCanvas <= cameraRect.x + cameraRect.w && yCanvas >= cameraRect.y && yCanvas <= cameraRect.y + cameraRect.h;
          const screenRect = screenRectRef.current;
          const overScreen = !!onScreenFrameChange && !!screenRect && xCanvas >= screenRect.x && xCanvas <= screenRect.x + screenRect.w && yCanvas >= screenRect.y && yCanvas <= screenRect.y + screenRect.h;
          const cameraHandle = onCameraFrameChange && cameraRect ? resizeHandleAtPoint(xCanvas, yCanvas, cameraRect) : null;
          const screenHandle = onScreenFrameChange && screenRect ? resizeHandleAtPoint(xCanvas, yCanvas, screenRect) : null;
          event.currentTarget.style.cursor = cameraHandle ? cursorForResizeHandle(cameraHandle) : screenHandle ? cursorForResizeHandle(screenHandle) : overCamera || overScreen ? 'grab' : '';
        }}
        onPointerDown={(event) => {
          const canvas = canvasRef.current;
          if (!canvas || (!onCameraFrameChange && !onScreenFrameChange)) return;
          const rect = canvas.getBoundingClientRect();
          const xCanvas = ((event.clientX - rect.left) * canvas.width) / rect.width;
          const yCanvas = ((event.clientY - rect.top) * canvas.height) / rect.height;
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
          const insideScreen = !!onScreenFrameChange && !!screenRect && xCanvas >= screenRect.x && xCanvas <= screenRect.x + screenRect.w && yCanvas >= screenRect.y && yCanvas <= screenRect.y + screenRect.h;
          if ((!insideScreen && !screenHandle) || !screenRect) return;
          const mode = screenHandle ? 'resize' : 'move';
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          screenDragOriginRef.current = {
            pointerId: event.pointerId,
            mode,
            handle: screenHandle ?? undefined,
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
          event.currentTarget.style.cursor = screenHandle ? cursorForResizeHandle(screenHandle) : 'grabbing';
        }}
        onPointerUp={(event) => {
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
          setIsDraggingCamera(false);
          setIsDraggingScreen(false);
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
            {formatClock(currentTime)} / {formatClock(visibleDuration)}
          </span>
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
