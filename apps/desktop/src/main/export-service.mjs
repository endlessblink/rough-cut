import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getPrimaryRecording } from './project-files.mjs';
import { createZoomSendcmdLayer } from './zoom-sendcmd.mjs';
import { HEADLESS_EXPORT_BACKEND, attemptExperimentalHeadlessRender } from './headless-export-renderer.mjs';
import {
  resolveCensorBlurSpacing,
  resolveCensorRectAtFrame,
  censorKeyframeSegments,
  censorRegionIsAnimated,
} from '../shared/censor-regions.mjs';
import { canonicalizeProjectDocument, computeTimelineDuration, createDefaultCameraPresentation, getRecordingBackgroundColors, getStyledCanvasResolution } from '@rough-cut/project-model';
import {
  getCameraLayoutRect,
  normalizeCompositionPresentationStyle as normalizePresentationStyle,
  resolveCompositionFrame,
  resolveHeadlessCameraLayout,
  resolveHeadlessScreenLayout,
} from '@rough-cut/frame-resolver';

export const EXPORT_MODES = Object.freeze({
  RAW: 'raw',
  STYLED: 'styled',
  EXPERIMENTAL_HEADLESS: 'experimental-headless',
});

export const EXPORT_SCOPES = Object.freeze({
  TIMELINE: 'timeline',
  USED_CONTENT: 'used-content',
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const STYLED_VIDEO_ENCODERS = Object.freeze({
  CPU: 'libx264',
  NVENC: 'h264_nvenc',
});
let styledVideoEncoderPromise = null;

export function normalizeExportMode(mode = EXPORT_MODES.RAW) {
  if (mode === EXPORT_MODES.RAW || mode === EXPORT_MODES.STYLED || mode === EXPORT_MODES.EXPERIMENTAL_HEADLESS) return mode;
  throw new Error(`Unsupported export mode: ${mode}`);
}

export function normalizeExportScope(scope = EXPORT_SCOPES.TIMELINE) {
  if (scope === EXPORT_SCOPES.TIMELINE || scope === EXPORT_SCOPES.USED_CONTENT) return scope;
  throw new Error(`Unsupported export scope: ${scope}`);
}

export async function exportProjectToMp4({ project, outputPath, mode = EXPORT_MODES.RAW, exportScope = EXPORT_SCOPES.TIMELINE, onProgress = () => undefined, signal = null } = {}) {
  const exportMode = normalizeExportMode(mode);
  const scope = normalizeExportScope(exportScope);
  const recording = getPrimaryRecording(project);
  if (!recording) throw new Error('Project has no recording to export.');
  assertDistinctExportPath(recording.filePath, outputPath);
  const timelineRecording = resolveTimelineExportRecording(project, recording, { exportScope: scope });
  const exportRecording = timelineRecording ?? recording;
  const hasCutRanges = Array.isArray(exportRecording.cutRanges) && exportRecording.cutRanges.length > 0;
  const canExportRaw = !hasCutRanges && isSingleUneditedTimelineRecording(project, recording.assetId, { exportScope: scope });
  const canExportTrimmedRaw = !hasCutRanges && isSingleTrimmedTimelineRecording(project, recording.assetId, { exportScope: scope });
  const canExportStyled = canExportRaw || canExportTrimmedRaw || hasCutRanges || canExportStyledTimeline(project, recording.assetId, { exportScope: scope });
  const needsStyledCapability = exportMode === EXPORT_MODES.STYLED || exportMode === EXPORT_MODES.EXPERIMENTAL_HEADLESS;
  if ((exportMode === EXPORT_MODES.RAW && !canExportRaw) || (needsStyledCapability && !canExportStyled)) {
    if (!(exportMode === EXPORT_MODES.RAW && canExportTrimmedRaw)) {
      throw new Error('Only unedited or head/tail-trimmed single-recording exports are supported in the MVP.');
    }
  }

  if (exportMode === EXPORT_MODES.EXPERIMENTAL_HEADLESS) {
    return exportExperimentalHeadlessProjectToMp4({ project, recording: exportRecording, outputPath, onProgress, signal });
  }

  if (exportMode === EXPORT_MODES.STYLED) {
    return exportStyledProjectToMp4({ project, recording: exportRecording, outputPath, onProgress, signal });
  }

  if (canExportTrimmedRaw && !canExportRaw) {
    return exportRawTrimmedProjectToMp4({ recording: exportRecording, outputPath, onProgress, signal });
  }

  onProgress({ phase: 'copying', progress: 0 });
  await mkdir(dirname(outputPath), { recursive: true });
  await copyFile(recording.filePath, outputPath);
  const [source, exported] = await Promise.all([stat(recording.filePath), stat(outputPath)]);
  onProgress({ phase: 'complete', progress: 1 });

  return {
    outputPath,
    sourcePath: recording.filePath,
    bytes: exported.size,
    byteEqualCandidate: source.size === exported.size,
  };
}

export async function exportExperimentalHeadlessProjectToMp4({
  project,
  recording,
  outputPath,
  onProgress = () => undefined,
  signal = null,
  attemptHeadlessRender = attemptExperimentalHeadlessRender,
} = {}) {
  const compositionPlan = buildExperimentalHeadlessExportPlan({ project, recording });
  const renderPlan = experimentalHeadlessExportEnabled()
    ? buildExperimentalHeadlessExportPlan({ project, recording, frameSelection: 'all' })
    : compositionPlan;
  const headlessRender = await attemptHeadlessRender({ compositionPlan: renderPlan, outputPath, signal });
  let fallback = {
    active: true,
    from: 'headless-export',
    to: 'ffmpeg-styled',
    reason: headlessRender.reason,
  };
  if (headlessRender.ok) {
    fallback = {
      active: false,
      from: 'headless-export',
      to: 'ffmpeg-styled',
      reason: null,
    };
  }
  onProgress({
    phase: 'rendering-headless-prototype',
    progress: 0.01,
    experimentalBackend: 'headless-export',
    headlessRender,
    fallback,
    compositionPlan,
  });
  if (headlessRender.ok) {
    try {
      const result = await exportHeadlessFrameArtifactsToMp4({
        headlessRender,
        compositionPlan: renderPlan,
        recording,
        outputPath,
        signal,
        onProgress,
      });
      return {
        ...result,
        experimentalBackend: 'headless-export',
        headlessRender,
        fallback,
        compositionPlan,
      };
    } catch (err) {
      fallback = {
        active: true,
        from: 'headless-export',
        to: 'ffmpeg-styled',
        reason: 'experimental-headless-encode-failed',
        error: err instanceof Error ? err.message : String(err),
      };
      onProgress({
        phase: 'rendering-headless-prototype',
        progress: 0.01,
        notice: 'Experimental headless export encode failed; falling back to FFmpeg styled export.',
        experimentalBackend: 'headless-export',
        headlessRender,
        fallback,
        compositionPlan,
      });
    }
  }
  const result = await exportStyledProjectToMp4({
    project,
    recording,
    outputPath,
    signal,
    onProgress: (event) => onProgress({
      ...event,
      experimentalBackend: 'headless-export',
      headlessRender,
      fallback,
    }),
  });
  return {
    ...result,
    experimentalBackend: 'headless-export',
    headlessRender,
    fallback,
    compositionPlan,
  };
}

export function experimentalHeadlessExportEnabled(env = process.env) {
  return env.ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT === '1';
}

export function buildExperimentalHeadlessExportPlan({ project, recording, frameSelection = 'samples' } = {}) {
  const document = canonicalizeProjectDocument(project);
  const fps = Number.isFinite(recording?.fps) && recording.fps > 0 ? recording.fps : 30;
  const durationFrames = Math.max(1, Math.round(recording?.timelineDurationFrames ?? recording?.trimmedDuration ?? recording?.duration ?? fps));
  const canvas = getStyledCanvasResolution({
    aspectRatio: document?.settings?.aspectRatio ?? 'auto',
    sourceWidth: recording?.width ?? 1920,
    sourceHeight: recording?.height ?? 1080,
  });
  const sampleFrames = uniqueSortedFrames([
    0,
    Math.floor(durationFrames / 2),
    durationFrames - 1,
  ]);
  const selectedFrames = frameSelection === 'all'
    ? Array.from({ length: durationFrames }, (_value, index) => index)
    : sampleFrames;
  const cursorEvents = Array.isArray(recording?.cursorEvents) ? recording.cursorEvents : [];
  const assetMap = new Map((document?.assets ?? []).map((asset) => [asset.id, asset]));
  return {
    kind: 'experimental-headless-export-plan',
    version: 1,
    backend: 'headless-export',
    fallbackBackend: 'ffmpeg-styled',
    output: canvas,
    fps,
    durationFrames,
    sampledFrames: sampleFrames,
    frameSelection,
    frames: selectedFrames.map((frameIndex) => summarizeCompositionFrame(resolveCompositionFrame(document, frameIndex, {
      mode: 'timeline',
      includeEditorOverlays: false,
      getCursorPosition: (_assetId, sourceFrame) => cursorPositionAtFrame(cursorEvents, sourceFrame, recording?.width, recording?.height),
    }), assetMap)),
    audio: {
      sourcePath: recording?.filePath ?? null,
      preservedBy: 'ffmpeg-styled-fallback',
    },
  };
}

async function exportHeadlessFrameArtifactsToMp4({ headlessRender, compositionPlan, recording, outputPath, onProgress = () => undefined, signal = null } = {}) {
  await mkdir(dirname(outputPath), { recursive: true });
  const fps = Number.isFinite(compositionPlan?.fps) && compositionPlan.fps > 0 ? compositionPlan.fps : 30;
  const durationFrames = Math.max(1, Math.round(compositionPlan?.durationFrames ?? headlessRender?.frameCount ?? fps));
  const durationSeconds = durationFrames / fps;
  const audioInputPath = recording?.filePath && await sourceHasAudioStream(recording.filePath, signal)
    ? recording.filePath
    : null;
  const args = buildHeadlessFrameExportArgs({
    framePattern: headlessRender?.renderSurface?.framePattern,
    outputPath,
    width: compositionPlan?.output?.width,
    height: compositionPlan?.output?.height,
    fps,
    durationSeconds,
    audioInputPath,
    timelineAudioSegments: audioInputPath && Array.isArray(recording?.timelineSegments) ? recording.timelineSegments : [],
  });

  onProgress({
    phase: 'rendering-headless-export',
    progress: 0.01,
    experimentalBackend: 'headless-export',
    frameCount: headlessRender?.frameCount,
    audioPreserved: Boolean(audioInputPath),
  });
  const result = await run('ffmpeg', args, {
    signal,
    onStdout: (chunk) => {
      const progress = parseFfmpegProgress(chunk, durationSeconds);
      if (progress !== null) {
        onProgress({
          phase: 'rendering-headless-export',
          progress: 0.01 + progress * 0.98,
          experimentalBackend: 'headless-export',
          frameCount: headlessRender?.frameCount,
          audioPreserved: Boolean(audioInputPath),
        });
      }
    },
  });
  if (result.cancelled) {
    await rm(outputPath, { force: true });
    return createCancelledExportResult({ outputPath, sourcePath: recording?.filePath });
  }
  if (result.code !== 0) {
    throw new Error(`Experimental headless export failed: ${result.stderr.trim()}`);
  }
  const exported = await stat(outputPath);
  onProgress({
    phase: 'complete',
    progress: 1,
    experimentalBackend: 'headless-export',
    frameCount: headlessRender?.frameCount,
    audioPreserved: Boolean(audioInputPath),
  });
  return {
    outputPath,
    sourcePath: recording?.filePath ?? null,
    bytes: exported.size,
    byteEqualCandidate: false,
    rendererBackend: HEADLESS_EXPORT_BACKEND,
    frameArtifacts: headlessRender?.frameArtifacts ?? [],
    audioPreserved: Boolean(audioInputPath),
  };
}

async function exportRawTrimmedProjectToMp4({ recording, outputPath, onProgress = () => undefined, signal = null }) {
  onProgress({ phase: 'trimming', progress: 0 });
  await mkdir(dirname(outputPath), { recursive: true });
  const fps = Number.isFinite(recording.fps) && recording.fps > 0 ? recording.fps : 30;
  const result = await run('ffmpeg', buildRawTrimExportArgs({
    inputPath: recording.filePath,
    outputPath,
    startFrame: recording.sourceIn ?? 0,
    endFrame: recording.sourceOut ?? recording.duration,
    fps,
  }), { signal });
  if (result.cancelled) {
    await rm(outputPath, { force: true });
    return createCancelledExportResult({ outputPath, sourcePath: recording.filePath });
  }
  if (result.code !== 0) throw new Error(`Raw trim export failed: ${result.stderr.trim()}`);
  const exported = await stat(outputPath);
  onProgress({ phase: 'complete', progress: 1 });
  return {
    outputPath,
    sourcePath: recording.filePath,
    bytes: exported.size,
    byteEqualCandidate: false,
  };
}

function assertDistinctExportPath(sourcePath, outputPath) {
  if (resolve(sourcePath) !== resolve(outputPath)) return;
  throw new Error('Export output must be different from the source recording. Choose a new file name.');
}

export async function exportStyledProjectToMp4({ project, recording, outputPath, onProgress = () => undefined, signal = null }) {
  onProgress({ phase: 'rendering-styled', progress: 0.01 });
  await mkdir(dirname(outputPath), { recursive: true });
  const canvas = getStyledCanvasResolution({
    aspectRatio: project?.settings?.aspectRatio ?? 'auto',
    sourceWidth: recording.width,
    sourceHeight: recording.height,
  });
  const presentationStyle = normalizePresentationStyle(recording.presentation?.background);
  const [backgroundStart, backgroundEnd] = getRecordingBackgroundColors(recording.presentation?.background);
  const backgroundImagePath = resolveRendererPublicAsset(recording.presentation?.background?.bgImage);
  const cursorLayer = await createCursorSubtitleLayer({
    cursorEvents: recording.cursorEvents,
    width: recording.width,
    height: recording.height,
    fps: recording.fps,
    durationFrames: recording.timelineDurationFrames ?? recording.duration,
    onDownsampleNotice: (info) => {
      // Send a non-progressive notice through the existing progress channel so
      // renderer can show a "Cursor detail reduced" toast without us defining
      // a separate IPC. Progress stays at the current rendering-styled stage —
      // the notice is informational only.
      onProgress({
        phase: 'rendering-styled',
        progress: 0.01,
        notice: `Cursor detail reduced: ${info.originalEvents} → ${info.sampledEvents} samples (stride ${info.stride}). Recording is longer than ${info.maxEvents} cursor events.`,
        downsample: info,
      });
    },
  });
  const zoomLayer = await createZoomSendcmdLayer({
    markers: Array.isArray(recording.zoomMarkers) ? recording.zoomMarkers : [],
    cursorEvents: recording.cursorEvents,
    sourceWidth: recording.width,
    sourceHeight: recording.height,
    fps: recording.fps,
    totalFrames: recording.timelineDurationFrames ?? recording.duration,
  });
  const includeTimelineAudio = Array.isArray(recording.timelineSegments)
    && recording.timelineSegments.length > 0
    && await sourceHasAudioStream(recording.filePath, signal);
  let useSimpleFastPath = false;
  try {
    const fps = Number.isFinite(recording.fps) && recording.fps > 0 ? recording.fps : 30;
    const durationSeconds = (recording.trimmedDuration ?? recording.timelineDurationFrames ?? recording.duration) / fps;
    const videoEncoder = await resolveStyledVideoEncoder(signal);
    const styledArgsInput = {
      inputPath: recording.filePath,
      outputPath,
      width: canvas.width,
      height: canvas.height,
      screenPadding: presentationStyle.screenPadding,
      screenCornerRadius: presentationStyle.screenCornerRadius,
      screenShadowEnabled: presentationStyle.screenShadowEnabled,
      screenShadowBlur: presentationStyle.screenShadowBlur,
      screenShadowOpacity: presentationStyle.screenShadowOpacity,
      screenShadowOffsetY: presentationStyle.screenShadowOffsetY,
      screenShadowOffsetX: presentationStyle.screenShadowOffsetX,
      backgroundStart,
      backgroundEnd,
      backgroundImagePath,
      cursorAssPath: cursorLayer?.path,
      sourceWidth: recording.width,
      sourceHeight: recording.height,
      sourceFps: recording.fps,
      sourceTrimStartFrame: recording.sourceIn ?? 0,
      sourceTrimEndFrame: recording.sourceOut ?? recording.duration,
      timelineSegments: recording.timelineSegments ?? [],
      timelineDurationFrames: recording.timelineDurationFrames ?? null,
      timelineAudioSegments: includeTimelineAudio ? recording.timelineSegments ?? [] : [],
      zoomCropFilter: zoomLayer?.filterFragment ?? null,
      zoomSendcmdPath: zoomLayer?.path ?? null,
      cameraInputPath: recording.camera?.filePath ?? null,
      cameraSourceWidth: recording.camera?.width ?? null,
      cameraSourceHeight: recording.camera?.height ?? null,
      cameraSourceInFrames: recording.camera?.sourceInFrames ?? 0,
      cameraTimelineSegments: recording.camera?.timelineSegments ?? [],
      cameraPresentation: recording.presentation?.camera ?? null,
      cameraFrame: recording.presentation?.cameraFrame ?? null,
      cameraCrop: recording.presentation?.cameraCrop ?? null,
      screenFrame: recording.presentation?.screenFrame ?? null,
      screenCrop: recording.presentation?.screenCrop ?? null,
      // The whole list with its source frame ranges — the filter chain time-gates
      // each region itself, unlike the canvas renderers which get a per-frame list.
      censorRegions: recording.presentation?.censorRegions ?? [],
      cutRanges: recording.cutRanges ?? [],
      outputDurationSeconds: durationSeconds,
    };
    useSimpleFastPath = canUseSimpleStyledExportFastPath({
      ...styledArgsInput,
      zoomCropFilter: zoomLayer?.filterFragment ?? null,
      zoomSendcmdPath: zoomLayer?.path ?? null,
    });
    if (useSimpleFastPath) {
      onProgress({
        phase: 'rendering-styled',
        progress: 0.01,
        fastPath: 'simple-styled',
      });
    }
    const styledArgs = (encoder) => {
      const args = {
        ...styledArgsInput,
        zoomCropFilter: zoomLayer?.filterFragment ?? null,
        zoomSendcmdPath: zoomLayer?.path ?? null,
        videoEncoder: encoder,
      };
      return useSimpleFastPath ? buildSimpleStyledExportArgs(args) : buildStyledExportArgs(args);
    };
    if (videoEncoder === STYLED_VIDEO_ENCODERS.NVENC) {
      onProgress({
        phase: 'rendering-styled',
        progress: 0.01,
        notice: 'Using NVIDIA NVENC for styled export encoding.',
        videoEncoder,
      });
    }
    let result = await run('ffmpeg', styledArgs(videoEncoder), {
      signal,
      onStdout: (chunk) => {
        const progress = parseFfmpegProgress(chunk, durationSeconds);
        if (progress !== null) {
          onProgress({ phase: 'rendering-styled', progress: 0.01 + progress * 0.98 });
        }
      },
    });
    if (!result.cancelled && result.code !== 0 && videoEncoder === STYLED_VIDEO_ENCODERS.NVENC) {
      await rm(outputPath, { force: true });
      onProgress({
        phase: 'rendering-styled',
        progress: 0.01,
        notice: 'NVIDIA NVENC styled export failed; retrying with CPU encoder.',
        videoEncoder: STYLED_VIDEO_ENCODERS.CPU,
        fallbackFrom: STYLED_VIDEO_ENCODERS.NVENC,
      });
      result = await run('ffmpeg', styledArgs(STYLED_VIDEO_ENCODERS.CPU), {
        signal,
        onStdout: (chunk) => {
          const progress = parseFfmpegProgress(chunk, durationSeconds);
          if (progress !== null) {
            onProgress({ phase: 'rendering-styled', progress: 0.01 + progress * 0.98 });
          }
        },
      });
    }
    if (result.cancelled) {
      await rm(outputPath, { force: true });
      return createCancelledExportResult({ outputPath, sourcePath: recording.filePath });
    }
    if (result.code !== 0) {
      throw new Error(`Styled export failed: ${result.stderr.trim()}`);
    }
  } finally {
    if (cursorLayer) await cursorLayer.cleanup();
    if (zoomLayer) await zoomLayer.cleanup();
  }
  const exported = await stat(outputPath);
  onProgress({ phase: 'complete', progress: 1 });

  return {
    outputPath,
    sourcePath: recording.filePath,
    bytes: exported.size,
    byteEqualCandidate: false,
    fastPath: useSimpleFastPath ? 'simple-styled' : null,
  };
}

async function resolveStyledVideoEncoder(signal = null) {
  const requested = process.env.ROUGH_CUT_STYLED_VIDEO_ENCODER ?? process.env.ROUGH_CUT_STYLED_ENCODER ?? 'auto';
  if (requested === STYLED_VIDEO_ENCODERS.CPU) return STYLED_VIDEO_ENCODERS.CPU;
  if (requested === STYLED_VIDEO_ENCODERS.NVENC) return STYLED_VIDEO_ENCODERS.NVENC;
  if (requested !== 'auto') return STYLED_VIDEO_ENCODERS.CPU;
  if (!styledVideoEncoderPromise) {
    styledVideoEncoderPromise = ffmpegEncoderAvailable(STYLED_VIDEO_ENCODERS.NVENC, signal)
      .then((available) => (available ? STYLED_VIDEO_ENCODERS.NVENC : STYLED_VIDEO_ENCODERS.CPU))
      .catch(() => STYLED_VIDEO_ENCODERS.CPU);
  }
  return styledVideoEncoderPromise;
}

async function ffmpegEncoderAvailable(encoder, signal = null) {
  if (encoder !== STYLED_VIDEO_ENCODERS.NVENC) return false;
  const result = await run('ffmpeg', [
    '-hide_banner',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=16x16:r=1:d=0.1',
    '-frames:v',
    '1',
    '-c:v',
    STYLED_VIDEO_ENCODERS.NVENC,
    '-preset',
    'p4',
    '-tune',
    'hq',
    '-rc',
    'vbr',
    '-cq',
    '19',
    '-b:v',
    '0',
    '-pix_fmt',
    'yuv420p',
    '-f',
    'null',
    '-',
  ], { signal });
  if (result.cancelled || result.code !== 0) return false;
  return true;
}

function createCancelledExportResult({ outputPath, sourcePath }) {
  return {
    outputPath,
    sourcePath,
    bytes: 0,
    byteEqualCandidate: false,
    cancelled: true,
  };
}

export function resolveTimelineExportRecording(project, recording, { exportScope = EXPORT_SCOPES.TIMELINE } = {}) {
  const timelineModel = selectPrimaryTimelineModel(project, recording?.assetId);
  if (!timelineModel || timelineModel.screenClips.length === 0) return null;
  const scope = normalizeExportScope(exportScope);
  const usedStartFrame = Math.min(...timelineModel.screenClips.map((clip) => clip.timelineIn));
  const usedEndFrame = Math.max(...timelineModel.screenClips.map((clip) => clip.timelineOut));
  const timelineOffset = scope === EXPORT_SCOPES.USED_CONTENT ? usedStartFrame : 0;
  const timelineDurationFrames = scope === EXPORT_SCOPES.USED_CONTENT
    ? Math.max(1, usedEndFrame - usedStartFrame)
    : timelineModel.timelineDurationFrames;
  const screenClips = timelineModel.screenClips.map((clip) => ({
    ...clip,
    timelineIn: clip.timelineIn - timelineOffset,
    timelineOut: clip.timelineOut - timelineOffset,
  }));
  const cameraClips = timelineModel.cameraClips.map((clip) => ({
    ...clip,
    timelineIn: clip.timelineIn - timelineOffset,
    timelineOut: clip.timelineOut - timelineOffset,
  }));
  const sourceIn = screenClips[0].sourceIn;
  const sourceOut = screenClips[screenClips.length - 1].sourceOut;
  const needsSegmentComposition = screenClips.length !== 1
    || screenClips[0].timelineIn !== 0
    || screenClips[0].timelineOut !== timelineDurationFrames;
  const timelineSegments = needsSegmentComposition
    ? screenClips.map((clip) => ({
        timelineIn: clip.timelineIn,
        timelineOut: clip.timelineOut,
        sourceIn: clip.sourceIn,
        sourceOut: clip.sourceOut,
      }))
    : [];
  const timingSegments = screenClips.map((clip) => ({
    timelineIn: clip.timelineIn,
    timelineOut: clip.timelineOut,
    sourceIn: clip.sourceIn,
    sourceOut: clip.sourceOut,
  }));
  const cameraTimelineSegments = needsSegmentComposition
    ? cameraClips.map((clip) => ({
        timelineIn: clip.timelineIn,
        timelineOut: clip.timelineOut,
        sourceIn: clip.sourceIn,
        sourceOut: clip.sourceOut,
      }))
    : [];
  const zoomMarkers = shiftMarkersForExport(timelineModel.zoomMarkers, timelineOffset, timelineDurationFrames);
  const cutRanges = shiftMarkersForExport(timelineModel.cutRanges, timelineOffset, timelineDurationFrames);

  return {
    ...recording,
    sourceIn,
    sourceOut,
    trimmedDuration: timelineDurationFrames,
    timelineDurationFrames,
    timelineSegments,
    cursorEvents: mapCursorEventsToTimeline(recording.cursorEvents, timingSegments),
    camera: recording.camera && cameraClips[0]
      ? { ...recording.camera, sourceInFrames: cameraClips[0].sourceIn, timelineSegments: cameraTimelineSegments }
      : recording.camera,
    zoomMarkers: zoomMarkers.length > 0 ? zoomMarkers : recording.zoomMarkers,
    cutRanges: cutRanges.length > 0 ? cutRanges : recording.cutRanges,
  };
}

function selectPrimaryTimelineModel(project, assetId) {
  if (!project?.timeline || !assetId) return null;
  const document = canonicalizeProjectDocument(project);
  const sourceId = `source:${assetId}:screen`;
  const cameraSourceId = `source:${assetId}:camera`;
  const linkedGroupId = `linked:${assetId}`;
  const screenClips = clipsForMedia(document.timeline.tracks, sourceId);
  const cameraClips = clipsForMedia(document.timeline.tracks, cameraSourceId);
  if (screenClips.length === 0) return null;
  const compositionDuration = Number(document.composition?.duration);
  const timelineDurationFrames = Math.max(
    1,
    computeTimelineDuration(document.timeline),
    Number.isFinite(compositionDuration) ? Math.round(compositionDuration) : 0,
  );
  return {
    document,
    screenClips,
    cameraClips,
    timelineDurationFrames,
    cutRanges: markersForKind(document.timeline.markers, 'cut', linkedGroupId, timelineDurationFrames),
    zoomMarkers: markersForKind(document.timeline.markers, 'zoom', linkedGroupId, timelineDurationFrames)
      .map((marker) => marker.params?.marker && typeof marker.params.marker === 'object'
        ? { ...marker.params.marker, id: marker.id, startFrame: marker.startFrame, endFrame: marker.endFrame }
        : { id: marker.id, startFrame: marker.startFrame, endFrame: marker.endFrame }),
  };
}

function clipsForMedia(tracks, mediaId) {
  if (!Array.isArray(tracks)) return [];
  return tracks
    .flatMap((track) => {
      if (track?.kind !== 'video' || track.enabled === false) return [];
      return (track.clips ?? [])
        .filter((clip) => clip?.mediaId === mediaId)
        .map((clip) => ({ ...clip, trackId: clip.trackId ?? track.id }));
    })
    .filter((clip) => clip.enabled !== false)
    .sort((left, right) => left.timelineIn - right.timelineIn || left.timelineOut - right.timelineOut || String(left.id).localeCompare(String(right.id)));
}

function markersForKind(markers, kind, linkedGroupId, durationFrames) {
  if (!Array.isArray(markers)) return [];
  return markers
    .filter((marker) => marker?.kind === kind && marker.linkedGroupId === linkedGroupId)
    .map((marker) => ({
      ...marker,
      startFrame: clampFrame(marker.startFrame, 0, Math.max(0, durationFrames - 1)),
      endFrame: clampFrame(marker.endFrame, 1, durationFrames),
    }))
    .filter((marker) => marker.endFrame > marker.startFrame)
    .sort((left, right) => left.startFrame - right.startFrame || left.endFrame - right.endFrame || String(left.id).localeCompare(String(right.id)));
}

function mapCursorEventsToTimeline(cursorEvents, segments) {
  if (!Array.isArray(cursorEvents) || segments.length === 0) return [];
  return cursorEvents.flatMap((event) => {
    if (!event || !Number.isFinite(event.frame)) return [];
    const frame = Math.round(event.frame);
    const segment = segments.find((candidate) => frame >= candidate.sourceIn && frame < candidate.sourceOut);
    if (!segment) return [];
    return [{
      ...event,
      frame: segment.timelineIn + (frame - segment.sourceIn),
    }];
  });
}

function shiftMarkersForExport(markers, timelineOffset, timelineDurationFrames) {
  return (Array.isArray(markers) ? markers : [])
    .map((marker) => ({
      ...marker,
      startFrame: marker.startFrame - timelineOffset,
      endFrame: marker.endFrame - timelineOffset,
    }))
    .map((marker) => ({
      ...marker,
      startFrame: clampFrame(marker.startFrame, 0, Math.max(0, timelineDurationFrames - 1)),
      endFrame: clampFrame(marker.endFrame, 1, timelineDurationFrames),
    }))
    .filter((marker) => marker.endFrame > marker.startFrame)
    .sort((left, right) => left.startFrame - right.startFrame || left.endFrame - right.endFrame || String(left.id).localeCompare(String(right.id)));
}

function uniqueSortedFrames(frames) {
  return [...new Set(frames.map((frame) => Math.max(0, Math.round(frame))).filter(Number.isFinite))]
    .sort((left, right) => left - right);
}

function cursorPositionAtFrame(cursorEvents, sourceFrame, sourceWidth, sourceHeight) {
  if (!Array.isArray(cursorEvents) || !Number.isFinite(sourceFrame)) return null;
  const event = [...cursorEvents]
    .filter((candidate) => candidate && Number.isFinite(candidate.frame) && candidate.frame <= sourceFrame)
    .sort((left, right) => right.frame - left.frame)[0];
  if (!event || !Number.isFinite(event.x) || !Number.isFinite(event.y)) return null;
  const width = Number.isFinite(sourceWidth) && sourceWidth > 0 ? sourceWidth : 1920;
  const height = Number.isFinite(sourceHeight) && sourceHeight > 0 ? sourceHeight : 1080;
  return {
    x: clampNumber(event.x / width, 0, 1),
    y: clampNumber(event.y / height, 0, 1),
  };
}

function summarizeCompositionFrame(frame, assetMap = new Map()) {
  const [backgroundStart, backgroundEnd] = getRecordingBackgroundColors(frame.backgroundLayer.style);
  const backgroundImagePath = resolveRendererPublicAsset(frame.backgroundLayer.style?.bgImage);
  const screenLayout = frame.screenLayer ? resolveHeadlessScreenLayout(frame) : null;
  const cameraLayout = frame.cameraLayer ? resolveHeadlessCameraLayout(frame) : null;
  const screenStyle = normalizePresentationStyle(frame.backgroundLayer.style);
  return {
    frameIndex: frame.frameIndex,
    timeSec: frame.timeSec,
    fps: frame.fps,
    mode: frame.mode,
    output: frame.output,
    timelineGap: frame.timelineGap,
    sourceFrame: frame.sourceFrame,
    background: {
      color: frame.backgroundLayer.color,
      startColor: backgroundStart,
      endColor: backgroundEnd,
      gradient: frame.backgroundLayer.style?.bgGradient ?? null,
      image: frame.backgroundLayer.style?.bgImage ?? null,
      imagePath: backgroundImagePath,
      imageUrl: backgroundImagePath ? pathToFileURL(backgroundImagePath).href : null,
      styleKind: frame.backgroundLayer.style?.bgGradient ? 'gradient' : 'color',
    },
    screen: frame.screenLayer
      ? {
          assetId: frame.screenLayer.assetId,
          sourcePath: assetSourcePath(assetMap.get(frame.screenLayer.assetId)),
          sourceUrl: assetSourceUrl(assetMap.get(frame.screenLayer.assetId)),
          sourceFrame: frame.screenLayer.sourceFrame,
          fps: frame.fps,
          sourceSize: frame.screenLayer.sourceSize,
          sourceViewport: frame.screenLayer.sourceViewport ?? null,
          crop: frame.screenLayer.crop ?? null,
          hasSourceViewport: Boolean(frame.screenLayer.sourceViewport),
          hasCrop: Boolean(frame.screenLayer.crop),
          frame: screenLayout?.frame ?? frame.screenLayer.frame ?? null,
          frameSource: screenLayout?.source ?? (frame.screenLayer.frame ? 'manual' : 'unknown'),
          style: {
            cornerRadius: screenStyle.screenCornerRadius,
            shadowEnabled: screenStyle.screenShadowEnabled,
            shadowBlur: screenStyle.screenShadowBlur,
            shadowOpacity: screenStyle.screenShadowOpacity,
            shadowOffsetX: screenStyle.screenShadowOffsetX,
            shadowOffsetY: screenStyle.screenShadowOffsetY,
          },
          zoomTransform: frame.screenLayer.zoomTransform,
          reducedMotion: frame.screenLayer.reducedMotion,
        }
      : null,
    camera: frame.cameraLayer
      ? {
          assetId: frame.cameraLayer.assetId,
          sourcePath: assetSourcePath(assetMap.get(frame.cameraLayer.assetId)),
          sourceUrl: assetSourceUrl(assetMap.get(frame.cameraLayer.assetId)),
          sourceFrame: frame.cameraLayer.sourceFrame,
          fps: frame.fps,
          sourceSize: frame.cameraLayer.sourceSize,
          sourceViewport: frame.cameraLayer.sourceViewport ?? null,
          crop: frame.cameraLayer.crop ?? null,
          visible: frame.cameraLayer.visible,
          frame: cameraLayout?.frame ?? frame.cameraLayer.frame ?? null,
          frameSource: cameraLayout?.source ?? (frame.cameraLayer.frame ? 'manual' : 'presentation'),
          radius: cameraLayout?.radius ?? 0,
          presentation: cameraLayout?.presentation ?? frame.cameraLayer.presentation ?? null,
          style: cameraLayout?.style ?? null,
          hasCrop: Boolean(frame.cameraLayer.crop),
        }
      : null,
    // Taken straight off the resolved render frame, already filtered to this
    // frame. The export must never do its own filtering, or it could disagree with
    // the preview about what is hidden.
    //
    // The position is resolved here too, so the canvas renderer downstream can stay
    // a plain "draw this rect" and needs no keyframe logic of its own — a second
    // implementation of the interpolation is exactly how the two export backends
    // would drift apart again.
    censorRegions: (frame.renderFrame?.censorRegions ?? []).map((region) => {
      const rect = resolveCensorRectAtFrame(region, frame.renderFrame?.censorSourceFrame ?? 0);
      if (!rect || rect === region.rect) return region;
      const { keyframes: _resolved, ...rest } = region;
      return { ...rest, rect };
    }),
    cursor: {
      sourceFrame: frame.cursorLayer.sourceFrame,
      sourcePosition: frame.cursorLayer.sourcePosition,
      visible: frame.cursorLayer.visible,
      style: frame.cursorLayer.style,
      sizePercent: frame.cursorLayer.sizePercent,
      offscreen: frame.cursorLayer.offscreen,
    },
    click: {
      sourceFrame: frame.clickLayer.sourceFrame,
      sourcePosition: frame.clickLayer.sourcePosition,
      visible: frame.clickLayer.visible,
      effect: frame.clickLayer.effect,
      soundEnabled: frame.clickLayer.soundEnabled,
    },
    motion: frame.motion,
  };
}

function assetSourcePath(asset) {
  return typeof asset?.filePath === 'string' && asset.filePath.length > 0 ? asset.filePath : null;
}

function assetSourceUrl(asset) {
  const sourcePath = assetSourcePath(asset);
  return sourcePath ? pathToFileURL(sourcePath).href : null;
}

/**
 * Censor filters for the styled (FFmpeg) export. (TASK-252)
 *
 * Inserted into the screen chain while the stream is still at SOURCE resolution,
 * BEFORE the zoom crop and before the cursor burn-in. That ordering is what makes
 * censors survive zoom and pan for free — the zoom filter crops the already-
 * censored frame — and keeps the cursor drawn on top of a censor, matching the
 * preview.
 *
 * Time gating uses `enable='between(t,start/fps,end/fps)'`, the same
 * source-frame-over-fps convention `buildZoomSendcmd` uses for its command
 * timestamps. If that convention is ever wrong under trims, zoom and censor are
 * wrong together and get fixed together, rather than drifting apart.
 *
 * ## The mosaic is `geq`, and must stay fork-free
 *
 * `solid` is one `drawbox`. `pixelate` is a `geq` that quantizes the sample
 * coordinate inside the region — a real mosaic, every block a flat colour — followed,
 * when softness > 0, by a second `geq` that box-averages inside the region to soften
 * the block edges. Blocks stay visible; that is the "blur over the pixelation" look.
 *
 * Every tap in the second pass is `clip()`-ed to the region bounds. That is what makes
 * it safe: the blur can only read pixels the mosaic already destroyed, so it cannot
 * pull real detail in from just outside the edge or smear the censor outward.
 * Measured: comparing the crisp mosaic to the blurred one through an identical format
 * path, zero pixels outside the region changed while 64% inside did.
 *
 * The obvious mosaic (`split` → `crop` → downscale → nearest-neighbour upscale →
 * `overlay`) **deadlocks** whenever zoom is active: the zoom `sendcmd`/`crop`
 * downstream pulls frames in a pattern that starves one split branch, and ffmpeg
 * parks at 0% CPU with an empty output file, forever. Measured directly: zoom +
 * split-mosaic hangs, zoom + single-filter completes, zoom with no censor completes.
 * `fifo` on the split branches does not help — it is a no-op in modern ffmpeg.
 *
 * `geq` also has to run on native yuv420p. Routing it through `gbrp` so one
 * expression could cover all planes shifted colour across ~4% of the whole frame, so
 * the luma and chroma expressions are written separately here: chroma planes are
 * half resolution in yuv420p, so their region bounds and block size are halved.
 *
 * Cost: roughly 30ms per 1080p frame, and only on projects that have censors.
 *
 * Do not replace this with split+overlay, and do not add a format conversion,
 * without re-running `scripts/smoke-censor-export.mjs` — it covers the zoomed case
 * specifically, because that is the one that hangs.
 */
export function buildCensorSourceFilters({
  censorRegions = [],
  sourceWidth,
  sourceHeight,
  fps,
  cutRanges = [],
  trimStartFrame = 0,
  inputLabel = '[base]',
  outputPrefix = 'censored',
} = {}) {
  const effectiveFps = fps > 0 ? fps : 30;
  const trimStart = Math.max(0, Math.round(Number(trimStartFrame) || 0));
  const cuts = (Array.isArray(cutRanges) ? cutRanges : [])
    .map((range) => ({
      startFrame: Math.round(Number(range?.startFrame) || 0),
      endFrame: Math.round(Number(range?.endFrame) || 0),
    }))
    .filter((range) => range.endFrame > range.startFrame)
    .sort((left, right) => left.startFrame - right.startFrame);

  /**
   * A source frame's position in the stream these filters actually see.
   *
   * The chain trims and then `select`s cut frames away, re-stamping timestamps,
   * *before* the censor filters run. Gating on raw source time therefore fires a
   * censor at the wrong moment in any trimmed or cut export — and a censor that
   * arrives late is a censor that shows the thing it exists to hide. Returns null
   * for a frame that was cut away and so never plays at all.
   */
  const toOutputFrame = (sourceFrame) => {
    if (sourceFrame < trimStart) return 0;
    let removed = 0;
    for (const range of cuts) {
      if (sourceFrame <= range.startFrame) break;
      if (sourceFrame < range.endFrame) return null;
      removed += range.endFrame - Math.max(range.startFrame, trimStart);
    }
    return Math.max(0, sourceFrame - trimStart - removed);
  };
  /** Same mapping for a span's exclusive end, which may land inside a cut. */
  const toOutputEnd = (sourceFrame) => {
    const direct = toOutputFrame(sourceFrame);
    if (direct !== null) return direct;
    // Ends inside a cut: it lasts until the cut swallows it.
    const range = cuts.find((entry) => sourceFrame > entry.startFrame && sourceFrame < entry.endFrame);
    return toOutputFrame(range.startFrame);
  };

  /**
   * Normalized rect → the integer source-pixel box the filters actually use.
   * Returns null for anything with no usable area.
   */
  const toPixelBox = (rect) => {
    if (!rect) return null;
    if (!(sourceWidth > 0) || !(sourceHeight > 0)) return null;
    const x1 = clampNumber(Number(rect.x), 0, 1);
    const y1 = clampNumber(Number(rect.y), 0, 1);
    const x2 = clampNumber(Number(rect.x) + Number(rect.w), 0, 1);
    const y2 = clampNumber(Number(rect.y) + Number(rect.h), 0, 1);
    // Drop degenerate regions BEFORE the even-pixel floor below. Applying the
    // floor first would turn a zero-area rect into a 2px censor, so a stray
    // click would leave a phantom box in the export.
    const rawW = Math.abs(x2 - x1) * sourceWidth;
    const rawH = Math.abs(y2 - y1) * sourceHeight;
    if (rawW < 2 || rawH < 2) return null;
    // Even pixel dimensions: odd crop sizes break some encoders and make the
    // mosaic downscale/upscale round unevenly.
    const x = Math.max(0, Math.round(Math.min(x1, x2) * sourceWidth));
    const y = Math.max(0, Math.round(Math.min(y1, y2) * sourceHeight));
    const w = Math.min(Math.max(2, Math.round(rawW / 2) * 2), sourceWidth - x);
    const h = Math.min(Math.max(2, Math.round(rawH / 2) * 2), sourceHeight - y);
    if (w < 2 || h < 2) return null;
    return { x, y, w, h };
  };

  // One entry per *span* of constant motion, not per region: see the note above on
  // why a moving censor is many short filters rather than one long expression.
  const usable = [];
  let regionCount = 0;
  for (const region of Array.isArray(censorRegions) ? censorRegions : []) {
    const style = {
      id: region?.id,
      mode: region?.mode === 'solid' ? 'solid' : 'pixelate',
      blockSize: Number.isFinite(region?.blockSize) && region.blockSize > 0 ? region.blockSize : 24,
      soften: region?.soften !== false,
      fillColor: typeof region?.fillColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(region.fillColor)
        ? region.fillColor
        : '#0b0f14',
      // Resolved through the shared helper, not derived here, so the export and the
      // preview cannot soften by different amounts.
      blurSpacing: resolveCensorBlurSpacing(region),
    };
    const startFrame = Math.max(0, Math.round(Number(region?.startFrame) || 0));
    const endFrame = Math.max(startFrame + 1, Math.round(Number(region?.endFrame) || 0));
    const before = usable.length;

    // Spans are split at cut boundaries as well as at keyframes. A span that
    // straddled a cut would otherwise interpolate across frames the viewer never
    // sees, so the censor would arrive at the far side already out of position.
    const spans = censorRegionIsAnimated(region)
      // Static, including the one-keyframe case: the resolver answers with the
      // keyframe's rect there, so a pinned censor lands where the preview shows it.
      ? censorKeyframeSegments({ ...region, startFrame, endFrame })
      : [{ startFrame, endFrame, fromRect: resolveCensorRectAtFrame(region, startFrame), toRect: resolveCensorRectAtFrame(region, startFrame) }];

    for (const segment of spans) {
      const pieces = [];
      let cursor = segment.startFrame;
      for (const cut of cuts) {
        if (cut.endFrame <= cursor || cut.startFrame >= segment.endFrame) continue;
        if (cut.startFrame > cursor) pieces.push([cursor, cut.startFrame]);
        cursor = Math.max(cursor, cut.endFrame);
      }
      if (cursor < segment.endFrame) pieces.push([cursor, segment.endFrame]);

      for (const [pieceStart, pieceEnd] of pieces) {
        const outStart = toOutputFrame(pieceStart);
        const outEnd = toOutputEnd(pieceEnd);
        // Wholly inside a cut: it never plays, so it needs no filter at all.
        if (outStart === null || outEnd === null || outEnd <= outStart) continue;
        const from = toPixelBox(resolveCensorRectAtFrame(region, pieceStart));
        const to = toPixelBox(resolveCensorRectAtFrame(region, pieceEnd));
        // A span is only usable if BOTH ends are: interpolating from or to a
        // degenerate box would sweep the censor through nothing.
        if (!from || !to) continue;
        if (style.mode === 'solid' && (from.x !== to.x || from.y !== to.y || from.w !== to.w || from.h !== to.h)) {
          // drawbox evaluates its geometry ONCE — there is no eval=frame for it — so
          // a time expression leaves the box parked while the target walks out from
          // under it. One box per frame is the only per-frame geometry it offers.
          // This also matches the preview exactly, which resolves per whole frame.
          for (let frame = pieceStart; frame < pieceEnd; frame += 1) {
            const box = toPixelBox(resolveCensorRectAtFrame(region, frame));
            if (!box) continue;
            const at = outStart + (frame - pieceStart);
            usable.push({ ...style, from: box, to: box, startSec: at / effectiveFps, endSec: (at + 1) / effectiveFps });
          }
          continue;
        }
        usable.push({
          ...style,
          from,
          to,
          startSec: outStart / effectiveFps,
          endSec: outEnd / effectiveFps,
        });
      }
    }
    if (usable.length > before) regionCount += 1;
  }

  if (usable.length === 0) return { filters: [], outputLabel: inputLabel, count: 0 };

  const filters = [];
  let current = inputLabel;
  // geq's lum/cb/cr expressions only mean anything on planar YUV. The timeline-
  // segment path hands us rgba, where those planes do not exist and the mosaic
  // would silently do nothing, so pin the format first. The chain converts back to
  // rgba downstream for the rounded-corner alpha, and the file encodes to yuv420p
  // regardless, so this costs nothing on the common path.
  if (usable.some((region) => region.mode === 'pixelate')) {
    const pinned = `[${outputPrefix}_yuv]`;
    filters.push(`${current}format=yuv420p${pinned}`);
    current = pinned;
  }
  usable.forEach((region, index) => {
    const enable = `enable='between(t,${formatFilterNumber(region.startSec)},${formatFilterNumber(region.endSec)})'`;
    const next = `[${outputPrefix}_${index}]`;

    // Geometry is a plain number while the censor is still, and a time expression
    // while it moves. Keeping the still case numeric is not just tidiness: geq
    // evaluates these per pixel, so an expression that always answers the same
    // number is paid for on every pixel of every frame for nothing.
    const span = region.endSec - region.startSec;
    const axis = (timeVar, from, to) => {
      if (from === to || !(span > 0)) return String(from);
      return `(${formatFilterNumber(from)}+(${formatFilterNumber(to - from)})*clip((${timeVar}-${formatFilterNumber(region.startSec)})/${formatFilterNumber(span)},0,1))`;
    };
    const moves = region.from.x !== region.to.x
      || region.from.y !== region.to.y
      || region.from.w !== region.to.w
      || region.from.h !== region.to.h;

    if (region.mode === 'solid') {
      const hex = region.fillColor.replace('#', '0x');
      // drawbox reads time as lowercase `t`. geq below reads it as uppercase `T`,
      // and each rejects the other's spelling outright.
      const box = ['x', 'y', 'w', 'h'].map((key) => {
        const value = axis('t', region.from[key], region.to[key]);
        return `${key}=${value.startsWith('(') ? `'${value}'` : value}`;
      }).join(':');
      filters.push(`${current}drawbox=${box}:color=${hex}@1:t=fill:${enable}${next}`);
    } else {
      // Quantize the sample coordinate to the block grid inside the region, and
      // sample the untouched pixel outside it. Chroma planes are half resolution.
      const block = Math.max(2, Math.round(region.blockSize / 2) * 2);
      const cblock = Math.max(1, Math.round(block / 2));
      // Luma bounds, then the same box in half-resolution chroma coordinates. Both
      // are strings so a moving censor can substitute an expression wherever a
      // still one substitutes a number, with no second copy of this algebra.
      const x = axis('T', region.from.x, region.to.x);
      const y = axis('T', region.from.y, region.to.y);
      const w = axis('T', region.from.w, region.to.w);
      const h = axis('T', region.from.h, region.to.h);
      const bounds = moves
        ? {
            loX: x,
            hiX: `((${x})+(${w})-1)`,
            loY: y,
            hiY: `((${y})+(${h})-1)`,
            cLoX: `((${x})/2)`,
            cHiX: `(((${x})+(${w}))/2-1)`,
            cLoY: `((${y})/2)`,
            cHiY: `(((${y})+(${h}))/2-1)`,
          }
        : {
            loX: String(region.from.x),
            hiX: String(region.from.x + region.from.w - 1),
            loY: String(region.from.y),
            hiY: String(region.from.y + region.from.h - 1),
            cLoX: String(Math.round(region.from.x / 2)),
            cHiX: String(Math.round(region.from.x / 2) + Math.max(1, Math.round(region.from.w / 2)) - 1),
            cLoY: String(Math.round(region.from.y / 2)),
            cHiY: String(Math.round(region.from.y / 2) + Math.max(1, Math.round(region.from.h / 2)) - 1),
          };
      const insideLuma = `between(X,${bounds.loX},${bounds.hiX})*between(Y,${bounds.loY},${bounds.hiY})`;
      const insideChroma = `between(X,${bounds.cLoX},${bounds.cHiX})*between(Y,${bounds.cLoY},${bounds.cHiY})`;
      const snap = (plane, ox, oy, size) =>
        `${plane}(${ox}+floor((X-${ox})/${size})*${size}+${size}/2,${oy}+floor((Y-${oy})/${size})*${size}+${size}/2)`;
      const expr = [
        `lum='if(${insideLuma},${snap('lum', bounds.loX, bounds.loY, block)},lum(X,Y))'`,
        `cb='if(${insideChroma},${snap('cb', bounds.cLoX, bounds.cLoY, cblock)},cb(X,Y))'`,
        `cr='if(${insideChroma},${snap('cr', bounds.cLoX, bounds.cLoY, cblock)},cr(X,Y))'`,
      ].join(':');

      const spacing = region.blurSpacing;
      if (spacing > 0) {
        // Second pass: soften the block edges by averaging inside the region. Every
        // tap is clipped to the region, so this only ever reads pixels the mosaic
        // above already destroyed — it cannot pull detail in from outside the edge,
        // and it cannot smear the censor outward.
        const mosaicLabel = `[${outputPrefix}_m${index}]`;
        filters.push(`${current}geq=${expr}:${enable}${mosaicLabel}`);
        const average = (plane, lo, hi, step) => {
          const clip = (coord, delta, low, high) => `clip(${coord}+(${delta}),${low},${high})`;
          const taps = [];
          for (const dx of [-step, 0, step]) {
            for (const dy of [-step, 0, step]) {
              taps.push(`${plane}(${clip('X', dx, lo.x, hi.x)},${clip('Y', dy, lo.y, hi.y)})`);
            }
          }
          return `(${taps.join('+')})/9`;
        };
        const chromaStep = Math.max(1, Math.round(spacing / 2));
        const lumaLo = { x: bounds.loX, y: bounds.loY };
        const lumaHi = { x: bounds.hiX, y: bounds.hiY };
        const chromaLo = { x: bounds.cLoX, y: bounds.cLoY };
        const chromaHi = { x: bounds.cHiX, y: bounds.cHiY };
        const blurExpr = [
          `lum='if(${insideLuma},${average('lum', lumaLo, lumaHi, spacing)},lum(X,Y))'`,
          `cb='if(${insideChroma},${average('cb', chromaLo, chromaHi, chromaStep)},cb(X,Y))'`,
          `cr='if(${insideChroma},${average('cr', chromaLo, chromaHi, chromaStep)},cr(X,Y))'`,
        ].join(':');
        filters.push(`${mosaicLabel}geq=${blurExpr}:${enable}${next}`);
      } else {
        filters.push(`${current}geq=${expr}:${enable}${next}`);
      }
    }
    current = next;
  });

  // Censors, not filters: a moving censor is many filters and the caller reports
  // this to the user as "how much is hidden".
  return { filters, outputLabel: current, count: regionCount };
}

export function buildStyledExportArgs({
  inputPath,
  outputPath,
  width = 1920,
  height = 1080,
  cursorAssPath = null,
  sourceWidth = null,
  sourceHeight = null,
  sourceFps = null,
  sourceTrimStartFrame = 0,
  sourceTrimEndFrame = null,
  timelineSegments = [],
  timelineDurationFrames = null,
  timelineAudioSegments = [],
  screenPadding = 96,
  screenCornerRadius = 32,
  screenShadowEnabled = true,
  screenShadowBlur = 58,
  screenShadowOpacity = 0.2,
  screenShadowOffsetY = 34,
  screenShadowOffsetX = 0,
  backgroundStart = '#e8ebf0',
  backgroundEnd = '#f0e8e8',
  backgroundImagePath = null,
  censorRegions = [],
  zoomCropFilter = null,
  zoomSendcmdPath = null,
  cameraInputPath = null,
  cameraSourceWidth = null,
  cameraSourceHeight = null,
  cameraSourceInFrames = 0,
  cameraTimelineSegments = [],
  cameraPresentation = null,
  cameraFrame: cameraFrameOverride = null,
  cameraCrop = null,
  screenFrame: screenFrameOverride = null,
  screenCrop = null,
  cutRanges = [],
  videoEncoder = STYLED_VIDEO_ENCODERS.CPU,
  outputDurationSeconds = null,
}) {
  const safePadding = clampNumber(screenPadding, 0, Math.min(width, height) / 2 - 2);
  const maxVideoWidth = Math.round(width - safePadding * 2);
  const maxVideoHeight = Math.round(height - safePadding * 2);
  const cropPercent = 1;
  const shadowBlur = Math.round(clampNumber(screenShadowBlur, 0, 120));
  const shadowOpacity = screenShadowEnabled ? clampNumber(screenShadowOpacity, 0, 0.8) : 0;
  const shadowOffsetY = Math.round(clampNumber(screenShadowOffsetY, 0, 120));
  const shadowOffsetX = Math.round(clampNumber(screenShadowOffsetX, -120, 120));
  const backgroundExpression = buildBackgroundExpression(backgroundStart, backgroundEnd);
  const fps = Number.isFinite(sourceFps) && sourceFps > 0 ? sourceFps : 30;
  const staticLoop = buildStaticLoopFilter(fps, outputDurationSeconds);
  const backgroundFilter = backgroundImagePath
      ? [
        `nullsrc=s=${width}x${height}:r=1:d=1,format=rgb24,geq=${backgroundExpression},format=rgba[bg_base]`,
        `movie=${escapeFilterPath(backgroundImagePath)},scale=${width}:${height},format=rgba[bg_image]`,
        `[bg_base][bg_image]overlay=(W-w)/2:(H-h)/2,${staticLoop}[bg]`,
      ]
    : [`nullsrc=s=${width}x${height}:r=1:d=1,format=rgb24,geq=${backgroundExpression},format=rgba,${staticLoop}[bg]`];
  const trimStartFrame = Math.max(0, Math.round(sourceTrimStartFrame || 0));
  const trimEndFrame = Number.isFinite(sourceTrimEndFrame) ? Math.max(trimStartFrame + 1, Math.round(sourceTrimEndFrame)) : null;
  const trimDurationFrames = trimEndFrame === null ? null : trimEndFrame - trimStartFrame;
  const normalizedTimelineSegments = normalizeTimelineSegments(timelineSegments);
  const useTimelineSegments = normalizedTimelineSegments.length > 0;
  const normalizedTimelineAudioSegments = normalizeTimelineSegments(timelineAudioSegments);
  const useTimelineAudio = useTimelineSegments && normalizedTimelineAudioSegments.length > 0;
  const normalizedCameraTimelineSegments = normalizeTimelineSegments(cameraTimelineSegments);
  const useCameraTimelineSegments = Boolean(cameraInputPath) && useTimelineSegments && normalizedCameraTimelineSegments.length > 0;
  const timelineDuration = useTimelineSegments
    ? Math.max(
        1,
        Number.isFinite(timelineDurationFrames) ? Math.round(timelineDurationFrames) : 0,
        ...normalizedTimelineSegments.map((segment) => segment.timelineOut),
      )
    : null;
  const normalizedCutRanges = normalizeCutRanges(cutRanges, trimStartFrame, trimEndFrame);
  const cutFilter = buildCutSelectFilter(normalizedCutRanges, trimStartFrame);
  // Censors go on before the cursor burn-in and before the zoom crop, so the
  // cursor stays on top and the zoom carries the censor with the content.
  const censorLayer = buildCensorSourceFilters({
    censorRegions,
    sourceWidth,
    sourceHeight,
    fps,
    // The trim and the cut both run upstream of these filters and renumber the
    // frames, so the censor gates have to be expressed in the stream they will
    // actually see rather than in recording time.
    cutRanges: normalizedCutRanges,
    trimStartFrame,
    inputLabel: '[base]',
  });
  const screenInput = cursorAssPath ? '[with_cursor]' : censorLayer.outputLabel;
  const zoomActive = Boolean(zoomCropFilter && zoomSendcmdPath);
  const screenFrame = resolveScreenOverlayFrame(width, height, maxVideoWidth, maxVideoHeight, screenFrameOverride);
  const screenManualCropStep = buildCameraManualCropStep(screenCrop, sourceWidth, sourceHeight);
  const screenLayoutSourceWidth = screenManualCropStep && Number.isFinite(screenCrop?.width) && screenCrop.width > 0 ? screenCrop.width : sourceWidth;
  const screenLayoutSourceHeight = screenManualCropStep && Number.isFinite(screenCrop?.height) && screenCrop.height > 0 ? screenCrop.height : sourceHeight;
  const screenRenderSize = resolveContainedSize(screenLayoutSourceWidth, screenLayoutSourceHeight, screenFrame.w, screenFrame.h);
  const screenRadius = Math.round(clampNumber(screenCornerRadius, 0, Math.min(screenFrame.w, screenFrame.h) / 2));
  const screenScaleStep = `scale=${screenRenderSize.w}:${screenRenderSize.h}:force_original_aspect_ratio=decrease,pad=${screenRenderSize.w}:${screenRenderSize.h}:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba`;
  const screenStep = zoomActive
    ? `${zoomCropFilter},sendcmd=f=${escapeFilterPath(zoomSendcmdPath)},${screenManualCropStep ? `${screenManualCropStep},` : ''}${screenScaleStep}`
    : `${screenManualCropStep ?? `crop=iw*${cropPercent}:ih*${cropPercent}:(iw-ow)/2:(ih-oh)/2`},${screenScaleStep}`;
  const cameraFrame = cameraInputPath ? resolveCameraOverlayFrame(cameraPresentation, width, height, cameraFrameOverride) : null;
  const cameraTrim = Math.max(0, Math.round(cameraSourceInFrames));
  const cameraRadius = cameraFrame ? resolveCameraOverlayRadius(cameraPresentation, cameraFrame) : 0;
  const cameraAlpha = buildRoundedAlphaExpression(cameraRadius);
  const screenAlpha = buildRoundedAlphaExpression(screenRadius);
  const cameraManualCropStep = buildCameraManualCropStep(cameraCrop, cameraSourceWidth, cameraSourceHeight);
  const cameraScaleStep = cameraFrame
    ? `${cameraManualCropStep ? `${cameraManualCropStep},` : ''}scale=${cameraFrame.w}:${cameraFrame.h}:force_original_aspect_ratio=increase,crop=${cameraFrame.w}:${cameraFrame.h},format=rgba`
    : null;
  const sourceBaseFilters = useTimelineSegments
    ? buildTimelineVideoBaseFilters({
        segments: normalizedTimelineSegments,
        sourceWidth,
        sourceHeight,
        fps,
        durationFrames: timelineDuration,
        inputIndex: 0,
        outputLabel: 'base',
      })
    : [`[0:v]setpts=PTS-STARTPTS${cutFilter}[base]`];
  const cameraBaseFilters = useCameraTimelineSegments
    ? buildTimelineVideoBaseFilters({
        segments: normalizedCameraTimelineSegments,
        sourceWidth: cameraSourceWidth,
        sourceHeight: cameraSourceHeight,
        fps,
        durationFrames: timelineDuration,
        inputIndex: 1,
        outputLabel: 'camera_base',
        transparent: true,
      })
    : [];
  const audioFilters = useTimelineAudio
    ? buildTimelineAudioFilters({
        segments: normalizedTimelineAudioSegments,
        fps,
        durationFrames: timelineDuration,
      })
    : [];
  const screenCompositeFilters = [
    `${screenInput}${screenStep}[screen]`,
    `nullsrc=s=${screenRenderSize.w}x${screenRenderSize.h}:r=1:d=1,format=gray,geq=lum='${screenAlpha}',${staticLoop}[screen_mask]`,
    '[screen][screen_mask]alphamerge[rounded]',
    `nullsrc=s=${screenRenderSize.w}x${screenRenderSize.h}:r=1:d=1,format=rgba,geq=r='0':g='0':b='0':a='(${screenAlpha})*${formatFilterNumber(shadowOpacity)}',boxblur=${shadowBlur}:5,${staticLoop}[shadow]`,
    `[bg][shadow]overlay=${screenFrame.x}${shadowOffsetX === 0 ? '' : shadowOffsetX > 0 ? `+${shadowOffsetX}` : shadowOffsetX}:${screenFrame.y}+${shadowOffsetY}:shortest=1[with_shadow]`,
    `[with_shadow][rounded]overlay=${screenFrame.x}:${screenFrame.y}:shortest=1[with_screen]`,
  ];
  const filter = [
    ...backgroundFilter,
    ...sourceBaseFilters,
    ...cameraBaseFilters,
    ...audioFilters,
    ...censorLayer.filters,
    ...(cursorAssPath ? [`${censorLayer.outputLabel}subtitles=${escapeFilterPath(cursorAssPath)}[with_cursor]`] : []),
    ...screenCompositeFilters,
    ...(cameraFrame
      ? [
          useCameraTimelineSegments
            ? `[camera_base]${cameraScaleStep}[camera_scaled]`
            : `[1:v]setpts=PTS-STARTPTS${cameraTrim > 0 ? `,trim=start_frame=${cameraTrim},setpts=PTS-STARTPTS` : ''}${cutFilter},${cameraScaleStep}[camera_scaled]`,
          `nullsrc=s=${cameraFrame.w}x${cameraFrame.h}:r=1:d=1,format=gray,geq=lum='${cameraAlpha}',${staticLoop}[camera_mask]`,
          '[camera_scaled][camera_mask]alphamerge[camera_rounded]',
          `[with_screen][camera_rounded]overlay=${cameraFrame.x}:${cameraFrame.y}:eof_action=pass:repeatlast=0,format=yuv420p[v]`,
        ]
      : ['[with_screen]format=yuv420p[v]']),
  ].join(';');

  return [
    '-y',
    '-progress',
    'pipe:1',
    '-nostats',
    ...(!useTimelineSegments && trimStartFrame > 0 ? ['-ss', formatFilterNumber(trimStartFrame / fps)] : []),
    ...(!useTimelineSegments && trimDurationFrames !== null ? ['-t', formatFilterNumber(trimDurationFrames / fps)] : []),
    '-i',
    inputPath,
    ...(cameraInputPath ? ['-i', cameraInputPath] : []),
    '-filter_complex',
    filter,
    '-map',
    '[v]',
    ...(useTimelineAudio ? ['-map', '[a]'] : normalizedCutRanges.length === 0 && !useTimelineSegments ? ['-map', '0:a?'] : ['-an']),
    ...buildStyledVideoOutputArgs(videoEncoder),
    ...(useTimelineAudio ? ['-c:a', 'aac', '-b:a', '192k'] : ['-c:a', 'copy']),
    '-movflags',
    '+faststart',
    '-metadata',
    `rough_cut_style=canvas:${width}x${height}:studio-demo`,
    outputPath,
  ];
}

export function canUseSimpleStyledExportFastPath({
  backgroundImagePath = null,
  censorRegions = [],
  zoomCropFilter = null,
  zoomSendcmdPath = null,
  cameraInputPath = null,
  timelineSegments = [],
  timelineAudioSegments = [],
  cameraTimelineSegments = [],
  screenFrame = null,
  screenCrop = null,
  cameraFrame = null,
  cameraCrop = null,
  cutRanges = [],
} = {}) {
  if (backgroundImagePath) return false;
  // The fast path skips the screen chain the censor filters live in. Rather than
  // maintain a second censor implementation there, censored projects take the full
  // path — slower, and it actually hides what the user asked to hide.
  if (Array.isArray(censorRegions) && censorRegions.length > 0) return false;
  if (zoomCropFilter || zoomSendcmdPath) return false;
  if (cameraInputPath || cameraFrame || cameraCrop) return false;
  if (screenFrame || screenCrop) return false;
  if (Array.isArray(timelineSegments) && timelineSegments.length > 0) return false;
  if (Array.isArray(timelineAudioSegments) && timelineAudioSegments.length > 0) return false;
  if (Array.isArray(cameraTimelineSegments) && cameraTimelineSegments.length > 0) return false;
  if (Array.isArray(cutRanges) && cutRanges.length > 0) return false;
  return true;
}

export function buildSimpleStyledExportArgs({
  inputPath,
  outputPath,
  width = 1920,
  height = 1080,
  cursorAssPath = null,
  sourceWidth = null,
  sourceHeight = null,
  sourceFps = null,
  sourceTrimStartFrame = 0,
  sourceTrimEndFrame = null,
  screenPadding = 96,
  screenCornerRadius = 32,
  screenShadowEnabled = true,
  screenShadowBlur = 58,
  screenShadowOpacity = 0.2,
  screenShadowOffsetY = 34,
  screenShadowOffsetX = 0,
  backgroundStart = '#e8ebf0',
  backgroundEnd = '#f0e8e8',
  videoEncoder = STYLED_VIDEO_ENCODERS.CPU,
  outputDurationSeconds = null,
}) {
  const safePadding = clampNumber(screenPadding, 0, Math.min(width, height) / 2 - 2);
  const maxVideoWidth = Math.round(width - safePadding * 2);
  const maxVideoHeight = Math.round(height - safePadding * 2);
  const shadowBlur = Math.round(clampNumber(screenShadowBlur, 0, 120));
  const shadowOpacity = screenShadowEnabled ? clampNumber(screenShadowOpacity, 0, 0.8) : 0;
  const shadowOffsetY = Math.round(clampNumber(screenShadowOffsetY, 0, 120));
  const shadowOffsetX = Math.round(clampNumber(screenShadowOffsetX, -120, 120));
  const backgroundExpression = buildBackgroundExpression(backgroundStart, backgroundEnd);
  const fps = Number.isFinite(sourceFps) && sourceFps > 0 ? sourceFps : 30;
  const staticLoop = buildStaticLoopFilter(fps, outputDurationSeconds);
  const trimStartFrame = Math.max(0, Math.round(sourceTrimStartFrame || 0));
  const trimEndFrame = Number.isFinite(sourceTrimEndFrame) ? Math.max(trimStartFrame + 1, Math.round(sourceTrimEndFrame)) : null;
  const trimDurationFrames = trimEndFrame === null ? null : trimEndFrame - trimStartFrame;
  const screenFrame = resolveScreenOverlayFrame(width, height, maxVideoWidth, maxVideoHeight, null);
  const screenRenderSize = resolveContainedSize(sourceWidth, sourceHeight, screenFrame.w, screenFrame.h);
  const screenRadius = Math.round(clampNumber(screenCornerRadius, 0, Math.min(screenFrame.w, screenFrame.h) / 2));
  const screenAlpha = buildRoundedAlphaExpression(screenRadius);
  const screenInput = cursorAssPath ? '[with_cursor]' : '[base]';
  const filters = [
    `nullsrc=s=${width}x${height}:r=1:d=1,format=rgb24,geq=${backgroundExpression},format=rgba,${staticLoop}[bg]`,
    `[0:v]setpts=PTS-STARTPTS[base]`,
    ...(cursorAssPath ? [`[base]subtitles=${escapeFilterPath(cursorAssPath)}[with_cursor]`] : []),
    `${screenInput}scale=${screenRenderSize.w}:${screenRenderSize.h}:force_original_aspect_ratio=decrease,pad=${screenRenderSize.w}:${screenRenderSize.h}:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba[screen]`,
    `nullsrc=s=${screenRenderSize.w}x${screenRenderSize.h}:r=1:d=1,format=gray,geq=lum='${screenAlpha}',${staticLoop}[screen_mask]`,
    '[screen][screen_mask]alphamerge[rounded]',
    `nullsrc=s=${screenRenderSize.w}x${screenRenderSize.h}:r=1:d=1,format=rgba,geq=r='0':g='0':b='0':a='(${screenAlpha})*${formatFilterNumber(shadowOpacity)}',boxblur=${shadowBlur}:5,${staticLoop}[shadow]`,
    `[bg][shadow]overlay=${screenFrame.x}${shadowOffsetX === 0 ? '' : shadowOffsetX > 0 ? `+${shadowOffsetX}` : shadowOffsetX}:${screenFrame.y}+${shadowOffsetY}:shortest=1[with_shadow]`,
    `[with_shadow][rounded]overlay=${screenFrame.x}:${screenFrame.y}:shortest=1,format=yuv420p[v]`,
  ];

  return [
    '-y',
    '-progress',
    'pipe:1',
    '-nostats',
    ...(trimStartFrame > 0 ? ['-ss', formatFilterNumber(trimStartFrame / fps)] : []),
    ...(trimDurationFrames !== null ? ['-t', formatFilterNumber(trimDurationFrames / fps)] : []),
    '-i',
    inputPath,
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[v]',
    '-map',
    '0:a?',
    ...buildStyledVideoOutputArgs(videoEncoder),
    '-c:a',
    'copy',
    '-movflags',
    '+faststart',
    '-metadata',
    `rough_cut_style=canvas:${width}x${height}:studio-demo-fast`,
    outputPath,
  ];
}

export function buildHeadlessFrameExportArgs({
  framePattern,
  outputPath,
  width = 1920,
  height = 1080,
  fps = 30,
  durationSeconds = null,
  audioInputPath = null,
  timelineAudioSegments = [],
  videoEncoder = STYLED_VIDEO_ENCODERS.CPU,
} = {}) {
  if (!framePattern || typeof framePattern !== 'string') {
    throw new Error('Headless frame export requires a frame pattern');
  }
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 30;
  const safeDuration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null;
  const safeWidth = Number.isFinite(width) && width > 0 ? Math.round(width) : 1920;
  const safeHeight = Number.isFinite(height) && height > 0 ? Math.round(height) : 1080;
  const normalizedTimelineAudioSegments = normalizeTimelineSegments(timelineAudioSegments);
  const useTimelineAudio = Boolean(audioInputPath) && normalizedTimelineAudioSegments.length > 0 && safeDuration !== null;
  const audioFilters = useTimelineAudio
    ? buildTimelineAudioFilters({
        segments: normalizedTimelineAudioSegments,
        fps: safeFps,
        durationFrames: Math.max(1, Math.round(safeDuration * safeFps)),
        audioInputLabel: '1:a',
      })
    : [];
  return [
    '-y',
    '-progress',
    'pipe:1',
    '-nostats',
    '-framerate',
    formatFilterNumber(safeFps),
    '-start_number',
    '0',
    '-i',
    framePattern,
    ...(audioInputPath ? ['-i', audioInputPath] : []),
    ...(audioFilters.length > 0 ? ['-filter_complex', audioFilters.join(';')] : []),
    ...(safeDuration ? ['-t', formatFilterNumber(safeDuration)] : []),
    '-map',
    '0:v',
    ...(useTimelineAudio ? ['-map', '[a]'] : audioInputPath ? ['-map', '1:a?'] : ['-an']),
    ...buildStyledVideoOutputArgs(videoEncoder),
    ...(audioInputPath ? ['-c:a', 'aac', '-b:a', '192k'] : []),
    ...(audioInputPath && !useTimelineAudio ? ['-shortest'] : []),
    '-movflags',
    '+faststart',
    '-metadata',
    `rough_cut_style=experimental-headless:${safeWidth}x${safeHeight}:studio-demo`,
    outputPath,
  ];
}

function buildStaticLoopFilter(fps = 30, durationSeconds = null) {
  const fpsValue = Number.isFinite(fps) && fps > 0 ? fps : 30;
  const duration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? `,trim=duration=${formatFilterNumber(durationSeconds)}` : '';
  return `loop=loop=-1:size=1:start=0${duration},fps=${formatFilterNumber(fpsValue)},setpts=N/${formatFilterNumber(fpsValue)}/TB`;
}

function buildStyledVideoOutputArgs(videoEncoder = STYLED_VIDEO_ENCODERS.CPU) {
  if (videoEncoder === STYLED_VIDEO_ENCODERS.NVENC) {
    return [
      '-c:v',
      STYLED_VIDEO_ENCODERS.NVENC,
      '-preset',
      'p4',
      '-tune',
      'hq',
      '-rc',
      'vbr',
      '-cq',
      '19',
      '-b:v',
      '0',
      '-pix_fmt',
      'yuv420p',
    ];
  }

  return [
    '-c:v',
    STYLED_VIDEO_ENCODERS.CPU,
    '-preset',
    'veryfast',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
  ];
}

function resolveScreenOverlayFrame(canvasWidth, canvasHeight, defaultWidth, defaultHeight, normalizedFrame = null) {
  if (normalizedFrame && Number.isFinite(normalizedFrame.x) && Number.isFinite(normalizedFrame.y) && Number.isFinite(normalizedFrame.w) && Number.isFinite(normalizedFrame.h)) {
    const w = Math.max(2, Math.min(canvasWidth, Math.round(normalizedFrame.w * canvasWidth)));
    const h = Math.max(2, Math.min(canvasHeight, Math.round(normalizedFrame.h * canvasHeight)));
    return {
      x: Math.max(0, Math.min(canvasWidth - w, Math.round(normalizedFrame.x * canvasWidth))),
      y: Math.max(0, Math.min(canvasHeight - h, Math.round(normalizedFrame.y * canvasHeight))),
      w,
      h,
      custom: true,
    };
  }
  return {
    x: '(W-w)/2',
    y: '(H-h)/2',
    w: defaultWidth,
    h: defaultHeight,
    custom: false,
  };
}

function resolveContainedSize(sourceWidth, sourceHeight, maxWidth, maxHeight) {
  const safeSourceWidth = Number.isFinite(sourceWidth) && sourceWidth > 0 ? sourceWidth : maxWidth;
  const safeSourceHeight = Number.isFinite(sourceHeight) && sourceHeight > 0 ? sourceHeight : maxHeight;
  const sourceAspect = safeSourceWidth / safeSourceHeight;
  const frameAspect = maxWidth / maxHeight;
  if (sourceAspect >= frameAspect) {
    return {
      w: maxWidth,
      h: Math.max(2, Math.round(maxWidth / sourceAspect)),
    };
  }
  return {
    w: Math.max(2, Math.round(maxHeight * sourceAspect)),
    h: maxHeight,
  };
}

function normalizeCutRanges(ranges, trimStartFrame, trimEndFrame) {
  const maxFrame = Number.isFinite(trimEndFrame) ? trimEndFrame : Number.POSITIVE_INFINITY;
  return (Array.isArray(ranges) ? ranges : [])
    .map((range) => {
      const startFrame = Math.max(trimStartFrame, Math.round(Number(range?.startFrame) || 0));
      const endFrame = Math.min(maxFrame, Math.round(Number(range?.endFrame) || 0));
      return endFrame > startFrame ? { startFrame, endFrame } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.startFrame - right.startFrame || left.endFrame - right.endFrame);
}

function buildCutSelectFilter(cutRanges, trimStartFrame) {
  if (!cutRanges.length) return '';
  const expressions = cutRanges.map((range) => {
    const start = Math.max(0, range.startFrame - trimStartFrame);
    const end = Math.max(start, range.endFrame - trimStartFrame - 1);
    return `between(n\\,${start}\\,${end})`;
  });
  return `,select='not(${expressions.join('+')})',setpts=N/FRAME_RATE/TB`;
}

function normalizeTimelineSegments(segments) {
  return (Array.isArray(segments) ? segments : [])
    .map((segment) => {
      const timelineIn = Math.max(0, Math.round(Number(segment?.timelineIn) || 0));
      const timelineOut = Math.max(timelineIn + 1, Math.round(Number(segment?.timelineOut) || 0));
      const sourceIn = Math.max(0, Math.round(Number(segment?.sourceIn) || 0));
      const sourceOut = Math.max(sourceIn + 1, Math.round(Number(segment?.sourceOut) || 0));
      const duration = Math.min(timelineOut - timelineIn, sourceOut - sourceIn);
      return duration > 0
        ? { timelineIn, timelineOut: timelineIn + duration, sourceIn, sourceOut: sourceIn + duration }
        : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.timelineIn - right.timelineIn || left.timelineOut - right.timelineOut || left.sourceIn - right.sourceIn);
}

function buildTimelineVideoBaseFilters({ segments, sourceWidth, sourceHeight, fps, durationFrames, inputIndex = 0, outputLabel = 'base', transparent = false }) {
  const safeWidth = Math.max(2, Math.round(Number.isFinite(sourceWidth) ? sourceWidth : 1280));
  const safeHeight = Math.max(2, Math.round(Number.isFinite(sourceHeight) ? sourceHeight : 720));
  const totalFrames = Math.max(1, Math.round(durationFrames || 1));
  const filters = [];
  const labels = [];
  let cursor = 0;
  let partIndex = 0;
  const pushGap = (frames) => {
    if (frames <= 0) return;
    const label = `${outputLabel}_gap_${partIndex++}`;
    filters.push(`color=c=${transparent ? 'black@0' : 'black'}:s=${safeWidth}x${safeHeight}:r=${fps}:d=${formatFilterNumber(frames / fps)},format=rgba[${label}]`);
    labels.push(`[${label}]`);
  };
  segments.forEach((segment, index) => {
    pushGap(segment.timelineIn - cursor);
    const segmentLabel = `${outputLabel}_seg_${index}`;
    filters.push(`[${inputIndex}:v]trim=start_frame=${segment.sourceIn}:end_frame=${segment.sourceOut},setpts=PTS-STARTPTS,format=rgba[${segmentLabel}]`);
    labels.push(`[${segmentLabel}]`);
    cursor = segment.timelineOut;
  });
  pushGap(totalFrames - cursor);
  if (labels.length === 1) {
    filters.push(`${labels[0]}copy[${outputLabel}]`);
  } else {
    filters.push(`${labels.join('')}concat=n=${labels.length}:v=1:a=0[${outputLabel}]`);
  }
  return filters;
}

function buildTimelineAudioFilters({ segments, fps, durationFrames, audioInputLabel = '0:a' }) {
  const durationSeconds = formatFilterNumber(Math.max(1, Math.round(durationFrames || 1)) / fps);
  const filters = [`anullsrc=channel_layout=stereo:sample_rate=48000:d=${durationSeconds}[audio_blank]`];
  const labels = ['[audio_blank]'];
  segments.forEach((segment, index) => {
    const label = `audio_seg_${index}`;
    const start = formatFilterNumber(segment.sourceIn / fps);
    const end = formatFilterNumber(segment.sourceOut / fps);
    const delayMs = Math.max(0, Math.round((segment.timelineIn / fps) * 1000));
    filters.push(`[${audioInputLabel}]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,adelay=${delayMs}:all=1[${label}]`);
    labels.push(`[${label}]`);
  });
  filters.push(`${labels.join('')}amix=inputs=${labels.length}:duration=first:dropout_transition=0[a]`);
  return filters;
}

function resolveRendererPublicAsset(assetPath) {
  if (!assetPath || typeof assetPath !== 'string') return null;
  if (assetPath.includes('..') || assetPath.startsWith('/') || /^[a-zA-Z]+:/.test(assetPath)) return null;
  const builtPath = resolve(__dirname, '../../dist/renderer', assetPath);
  const sourcePath = resolve(__dirname, '../renderer/public', assetPath);
  if (existsSync(builtPath)) return builtPath;
  if (existsSync(sourcePath)) return sourcePath;
  return null;
}

export function buildRawTrimExportArgs({ inputPath, outputPath, startFrame = 0, endFrame, fps = 30 }) {
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 30;
  const safeStart = Math.max(0, Math.round(startFrame || 0));
  const safeEnd = Math.max(safeStart + 1, Math.round(endFrame));
  return [
    '-y',
    '-ss',
    formatFilterNumber(safeStart / safeFps),
    '-t',
    formatFilterNumber((safeEnd - safeStart) / safeFps),
    '-i',
    inputPath,
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    outputPath,
  ];
}

function resolveCameraOverlayFrame(camera = null, canvasWidth, canvasHeight, normalizedFrame = null) {
  if (normalizedFrame && Number.isFinite(normalizedFrame.x) && Number.isFinite(normalizedFrame.y) && Number.isFinite(normalizedFrame.w) && Number.isFinite(normalizedFrame.h)) {
    const w = Math.max(2, Math.round(normalizedFrame.w * canvasWidth));
    const h = Math.max(2, Math.round(normalizedFrame.h * canvasHeight));
    return constrainCameraShapeFrame({
      x: Math.max(0, Math.round(normalizedFrame.x * canvasWidth)),
      y: Math.max(0, Math.round(normalizedFrame.y * canvasHeight)),
      w,
      h,
    }, camera, canvasWidth, canvasHeight);
  }
  const rect = getCameraLayoutRect(
    { ...createDefaultCameraPresentation(), ...(camera ?? {}) },
    canvasWidth,
    canvasHeight,
  );
  return constrainCameraShapeFrame({
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    w: Math.round(rect.width),
    h: Math.round(rect.height),
  }, camera, canvasWidth, canvasHeight);
}

function buildCameraManualCropStep(crop = null, sourceWidth = null, sourceHeight = null) {
  if (!crop?.enabled) return null;
  const sourceW = Number.isFinite(sourceWidth) && sourceWidth > 0 ? Math.round(sourceWidth) : null;
  const sourceH = Number.isFinite(sourceHeight) && sourceHeight > 0 ? Math.round(sourceHeight) : null;
  let w = Math.max(1, Math.round(Number(crop.width) || 1));
  let h = Math.max(1, Math.round(Number(crop.height) || 1));
  let x = Math.max(0, Math.round(Number(crop.x) || 0));
  let y = Math.max(0, Math.round(Number(crop.y) || 0));
  if (sourceW !== null) {
    w = Math.max(1, Math.min(w, sourceW));
    x = Math.max(0, Math.min(x, sourceW - w));
  }
  if (sourceH !== null) {
    h = Math.max(1, Math.min(h, sourceH));
    y = Math.max(0, Math.min(y, sourceH - h));
  }
  return `crop=${w}:${h}:${x}:${y}`;
}

function constrainCameraShapeFrame(frame, camera = null, canvasWidth, canvasHeight) {
  if (camera?.shape !== 'circle') return frame;
  const size = Math.max(2, Math.min(frame.w, frame.h, canvasWidth, canvasHeight));
  return {
    x: Math.max(0, Math.min(canvasWidth - size, Math.round(frame.x + (frame.w - size) / 2))),
    y: Math.max(0, Math.min(canvasHeight - size, Math.round(frame.y + (frame.h - size) / 2))),
    w: size,
    h: size,
  };
}

function resolveCameraOverlayRadius(camera = null, frame) {
  if (camera?.shape === 'square') return 0;
  if (camera?.shape === 'circle') return Math.min(frame.w, frame.h) / 2;
  return Math.round((Math.min(frame.w, frame.h) / 2) * clampNumber((camera?.roundness ?? 50) / 100, 0, 1));
}

export function parseFfmpegProgress(chunk, durationSeconds) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  const text = String(chunk);
  const match = text.match(/out_time_(?:us|ms)=(\d+)/);
  if (!match) return null;
  const elapsedSeconds = Number(match[1]) / 1_000_000;
  if (!Number.isFinite(elapsedSeconds)) return null;
  return clampNumber(elapsedSeconds / durationSeconds, 0, 1);
}

export function buildBackgroundExpression(startColor = '#e8ebf0', endColor = '#f0e8e8') {
  const defaultStart = parseHexColor('#e8ebf0');
  const defaultEnd = parseHexColor('#f0e8e8');
  const parsedStart = parseHexColor(startColor);
  const parsedEnd = parseHexColor(endColor);
  const start = parsedStart && parsedEnd ? parsedStart : defaultStart;
  const end = parsedStart && parsedEnd ? parsedEnd : defaultEnd;
  return [
    `r='${start.r}+${end.r - start.r}*X/W'`,
    `g='${start.g}+${end.g - start.g}*X/W'`,
    `b='${start.b}+${end.b - start.b}*X/W'`,
  ].join(':');
}

function parseHexColor(color) {
  const match = String(color).match(/^#([0-9a-fA-F]{6})$/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function toHexByte(value) {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function clampFrame(value, min, max) {
  const frame = Number.isFinite(value) ? Math.round(value) : min;
  return Math.max(min, Math.min(max, frame));
}

function formatFilterNumber(value) {
  return Number(value).toFixed(3).replace(/\.?0+$/, '');
}

// Default cap on dialogue lines emitted by the ASS cursor layer. Each event
// is one Dialogue line; libass copes well into the tens of thousands. 30k
// covers ~16 minutes at the 33ms cursor sample rate without striding, which
// is enough for the long-form recordings TASK-072 is targeting. Beyond that,
// stride sampling kicks in *and we surface a notice* — silent downsampling
// is the bug that TASK-072 closes.
export const DEFAULT_MAX_CURSOR_ASS_EVENTS = 30_000;

export async function createCursorSubtitleLayer({ cursorEvents = [], width, height, fps = 30, durationFrames = null, onDownsampleNotice = null } = {}) {
  const summary = { downsampled: false, originalEvents: 0, sampledEvents: 0, stride: 1 };
  const ass = buildCursorAss({
    cursorEvents,
    width,
    height,
    fps,
    durationFrames,
    onDownsampleNotice: (info) => {
      summary.downsampled = true;
      summary.originalEvents = info.originalEvents;
      summary.sampledEvents = info.sampledEvents;
      summary.stride = info.stride;
      console.warn(`[cursor-ass] Cursor detail reduced: ${info.originalEvents} samples → ${info.sampledEvents} (stride ${info.stride}).`);
      if (typeof onDownsampleNotice === 'function') onDownsampleNotice(info);
    },
  });
  if (!ass) return null;

  const root = await mkdtemp(join(tmpdir(), 'rough-cut-cursor-layer-'));
  const path = join(root, 'cursor.ass');
  await writeFile(path, ass, 'utf8');
  return {
    path,
    cleanup: () => rm(root, { recursive: true, force: true }),
    summary,
  };
}

export function buildCursorAss({ cursorEvents = [], width = 1920, height = 1080, fps = 30, durationFrames = null, maxEvents = DEFAULT_MAX_CURSOR_ASS_EVENTS, onDownsampleNotice = null } = {}) {
  const events = cursorEvents
    .filter((event) => event && event.type === 'move' && Number.isFinite(event.frame) && Number.isFinite(event.x) && Number.isFinite(event.y))
    .sort((a, b) => a.frame - b.frame);
  const clicks = cursorEvents
    .filter((event) => event && event.type === 'down' && Number.isFinite(event.frame) && Number.isFinite(event.x) && Number.isFinite(event.y))
    .sort((a, b) => a.frame - b.frame);
  if (events.length === 0 && clicks.length === 0) return null;

  const stride = Math.max(1, Math.ceil(events.length / maxEvents));
  const sampled = stride === 1 ? events.slice() : events.filter((_event, index) => index % stride === 0);
  if (stride > 1 && typeof onDownsampleNotice === 'function') {
    onDownsampleNotice({ originalEvents: events.length, sampledEvents: sampled.length, stride, maxEvents });
  }
  // Preserve the very last recorded event so the exported cursor reflects
  // its actual final position. Stride filtering can otherwise drop the last
  // event when (events.length - 1) % stride !== 0, leaving the cursor stuck
  // at an earlier sampled position for the tail of the recording.
  const lastEvent = events[events.length - 1] ?? null;
  if (lastEvent && (sampled.length === 0 || sampled[sampled.length - 1] !== lastEvent)) {
    sampled.push(lastEvent);
  }
  const fpsValue = Number.isFinite(fps) && fps > 0 ? fps : 30;
  const totalFrames = Number.isFinite(durationFrames) && durationFrames > 0 ? Math.round(durationFrames) : null;
  const lines = [];
  for (let index = 0; index < sampled.length; index += 1) {
    const event = sampled[index];
    const next = sampled[index + 1];
    const startFrame = Math.max(0, Math.round(event.frame));
    const endFrame = Math.max(startFrame, next ? Math.round(next.frame) - 1 : Math.max(startFrame + 15, (totalFrames ?? startFrame + 16) - 1));
    const x = roundCursorPosition(event.x);
    const y = roundCursorPosition(event.y);
    const nextX = roundCursorPosition(next?.x ?? event.x);
    const nextY = roundCursorPosition(next?.y ?? event.y);
    const startMs = Math.round((startFrame / fpsValue) * 1000);
    const endMs = Math.max(startMs + 34, Math.round(((endFrame + 1) / fpsValue) * 1000));
    const moveMs = Math.max(1, endMs - startMs);
    lines.push(`Dialogue: 0,${formatAssTime(startMs)},${formatAssTime(endMs)},Cursor,,0,0,0,,{\\an7\\move(${x},${y},${nextX},${nextY},0,${moveMs})\\p1}m 0 0 l 0 26 l 7 20 l 12 33 l 18 31 l 13 19 l 24 19 l 0 0{\\p0}`);
  }

  for (const click of clicks) {
    const startFrame = Math.max(0, Math.round(click.frame));
    const startMs = Math.round((startFrame / fpsValue) * 1000);
    const endMs = Math.max(startMs + 220, Math.round(((startFrame + 12) / fpsValue) * 1000));
    const x = roundCursorPosition(click.x);
    const y = roundCursorPosition(click.y);
    lines.push(`Dialogue: 1,${formatAssTime(startMs)},${formatAssTime(endMs)},Click,,0,0,0,,{\\an5\\pos(${x},${y})\\1a&HFF&\\3c&HFFAA55&\\3a&H20&\\bord3\\t(0,${endMs - startMs},\\fscx220\\fscy220\\3a&HDD&)}o`);
  }

  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${Math.round(width)}
PlayResY: ${Math.round(height)}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cursor,Arial,28,&H00FFFFFF,&H00FFFFFF,&H00333A46,&H55000000,-1,0,0,0,100,100,0,0,1,2.2,1.2,7,0,0,0,1
Style: Click,Arial,42,&H00FFFFFF,&H00FFFFFF,&H007AA7FF,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,5,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lines.join('\n')}
`;
}

function roundCursorPosition(value) {
  // Pass through to ASS as-is; subtitle renderer clips to PlayRes so off-screen
  // anchors (e.g. cursor on a second monitor) naturally disappear past the edge
  // instead of sticking to the visible bound.
  return Math.round(Number.isFinite(value) ? value : 0);
}

function formatAssTime(ms) {
  const totalCentiseconds = Math.max(0, Math.round(ms / 10));
  const centiseconds = totalCentiseconds % 100;
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

function escapeFilterPath(path) {
  return path.replaceAll('\\', '\\\\').replaceAll(':', '\\:').replaceAll("'", "\\'");
}

function buildRoundedAlphaExpression(radius) {
  const left = `lt(X,${radius})`;
  const right = `gte(X,W-${radius})`;
  const top = `lt(Y,${radius})`;
  const bottom = `gte(Y,H-${radius})`;
  const topLeft = `${left}*${top}*gt(hypot(${radius}-X,${radius}-Y),${radius})`;
  const topRight = `${right}*${top}*gt(hypot(X-(W-${radius}),${radius}-Y),${radius})`;
  const bottomLeft = `${left}*${bottom}*gt(hypot(${radius}-X,Y-(H-${radius})),${radius})`;
  const bottomRight = `${right}*${bottom}*gt(hypot(X-(W-${radius}),Y-(H-${radius})),${radius})`;
  return `if(${topLeft}+${topRight}+${bottomLeft}+${bottomRight},0,255)`;
}

export function isSingleUneditedRecording(project, assetId) {
  if (project.assets.length !== 1) return false;
  const tracks = project.composition.tracks;
  if (tracks.length !== 1) return false;
  const clips = tracks[0].clips;
  if (clips.length !== 1) return false;

  const clip = clips[0];
  const asset = project.assets[0];
  return (
    asset.id === assetId &&
    clip.assetId === asset.id &&
    clip.enabled === true &&
    clip.timelineIn === 0 &&
    clip.sourceIn === 0 &&
    clip.timelineOut === asset.duration &&
    clip.sourceOut === asset.duration &&
    clip.effects.length === 0 &&
    clip.keyframes.length === 0 &&
    project.composition.duration === asset.duration
  );
}

export function isSingleUneditedTimelineRecording(project, assetId, { exportScope = EXPORT_SCOPES.TIMELINE } = {}) {
  const model = selectPrimaryTimelineModel(project, assetId);
  if (!model || project.assets.length !== 1 || model.screenClips.length !== 1) return false;
  const scope = normalizeExportScope(exportScope);
  const clip = normalizeClipForScope(model.screenClips[0], scope === EXPORT_SCOPES.USED_CONTENT ? model.screenClips[0].timelineIn : 0);
  const duration = scope === EXPORT_SCOPES.USED_CONTENT ? clip.timelineOut - clip.timelineIn : model.timelineDurationFrames;
  const asset = project.assets[0];
  return Boolean(
    asset?.id === assetId &&
      clip.mediaId === `source:${assetId}:screen` &&
      clip.timelineIn === 0 &&
      clip.sourceIn === 0 &&
      clip.timelineOut === asset.duration &&
      clip.sourceOut === asset.duration &&
      duration === asset.duration,
  );
}

export function isSingleTrimmedTimelineRecording(project, assetId, { exportScope = EXPORT_SCOPES.TIMELINE } = {}) {
  const model = selectPrimaryTimelineModel(project, assetId);
  if (!model || project.assets.length !== 1 || model.screenClips.length !== 1) return false;
  const scope = normalizeExportScope(exportScope);
  const clip = normalizeClipForScope(model.screenClips[0], scope === EXPORT_SCOPES.USED_CONTENT ? model.screenClips[0].timelineIn : 0);
  const duration = scope === EXPORT_SCOPES.USED_CONTENT ? clip.timelineOut - clip.timelineIn : model.timelineDurationFrames;
  const asset = project.assets[0];
  return Boolean(
    asset?.id === assetId &&
      clip.mediaId === `source:${assetId}:screen` &&
      clip.timelineIn === 0 &&
      clip.timelineOut === clip.sourceOut - clip.sourceIn &&
      clip.sourceIn >= 0 &&
      clip.sourceOut <= asset.duration &&
      clip.sourceOut > clip.sourceIn &&
      (clip.sourceIn > 0 || clip.sourceOut < asset.duration) &&
      duration === clip.sourceOut - clip.sourceIn,
  );
}

function canExportStyledTimeline(project, assetId, { exportScope = EXPORT_SCOPES.TIMELINE } = {}) {
  const model = selectPrimaryTimelineModel(project, assetId);
  if (!model || model.screenClips.length === 0) return false;
  const linkedGroupId = `linked:${assetId}`;
  const enabledVideoClips = model.document.timeline.tracks.flatMap((track) => {
    if (track.kind !== 'video' || track.enabled === false) return [];
    return (track.clips ?? []).filter((clip) => clip.enabled !== false);
  });
  const unsupportedClips = enabledVideoClips.filter((clip) => clip.mediaId !== `source:${assetId}:screen` && clip.linkGroupId !== linkedGroupId);
  if (unsupportedClips.length > 0) return false;

  const linkedVideoClips = enabledVideoClips.filter((clip) => clip.mediaId !== `source:${assetId}:screen`);
  if (linkedVideoClips.length === 0) return true;
  void exportScope;
  return linkedVideoClips.every((clip) => model.screenClips.some((screenClip) => (
    clip.timelineIn === screenClip.timelineIn &&
    clip.timelineOut === screenClip.timelineOut
  )));
}

function normalizeClipForScope(clip, timelineOffset) {
  return {
    ...clip,
    timelineIn: clip.timelineIn - timelineOffset,
    timelineOut: clip.timelineOut - timelineOffset,
  };
}

export function isSingleTrimmedRecording(project, assetId) {
  if (project.assets.length !== 1) return false;
  const tracks = project.composition.tracks;
  if (tracks.length !== 1) return false;
  const clips = tracks[0].clips;
  if (clips.length !== 1) return false;

  const clip = clips[0];
  const asset = project.assets[0];
  return isHeadTailTrimmedClip(clip, asset, assetId) && project.composition.duration === clip.sourceOut - clip.sourceIn;
}

export function isSingleUneditedRecordingWithCamera(project, assetId) {
  if (project.assets.length !== 2) return false;
  const recording = project.assets.find((asset) => asset.id === assetId && asset.type === 'recording');
  if (!recording?.cameraAssetId) return false;
  const camera = project.assets.find((asset) => asset.id === recording.cameraAssetId && asset.metadata?.isCamera === true);
  if (!camera) return false;
  const tracks = project.composition.tracks;
  if (tracks.length !== 2) return false;
  const clips = tracks.flatMap((track) => track.clips);
  const screenClip = clips.find((clip) => clip.assetId === recording.id);
  const cameraClip = clips.find((clip) => clip.assetId === camera.id);
  const cameraOffset = Number.isFinite(camera.metadata?.sourceInFrames) ? camera.metadata.sourceInFrames : 0;
  return isFullLengthPlainClip(screenClip, recording) && isCameraAlignedClip(cameraClip, camera, cameraOffset, 0, recording.duration) && project.composition.duration === recording.duration;
}

export function isSingleTrimmedRecordingWithCamera(project, assetId) {
  if (project.assets.length !== 2) return false;
  const recording = project.assets.find((asset) => asset.id === assetId && asset.type === 'recording');
  if (!recording?.cameraAssetId) return false;
  const camera = project.assets.find((asset) => asset.id === recording.cameraAssetId && asset.metadata?.isCamera === true);
  if (!camera) return false;
  const clips = project.composition.tracks.flatMap((track) => track.clips);
  const screenClip = clips.find((clip) => clip.assetId === recording.id);
  const cameraClip = clips.find((clip) => clip.assetId === camera.id);
  if (!isHeadTailTrimmedClip(screenClip, recording, recording.id)) return false;
  if (!cameraClip || cameraClip.enabled !== true || cameraClip.timelineIn !== 0 || cameraClip.timelineOut !== screenClip.timelineOut || cameraClip.effects.length !== 0 || cameraClip.keyframes.length !== 0) return false;
  const cameraOffset = Number.isFinite(camera.metadata?.sourceInFrames) ? camera.metadata.sourceInFrames : 0;
  return cameraClip.sourceIn === cameraOffset + screenClip.sourceIn && cameraClip.sourceOut === cameraOffset + screenClip.sourceOut && project.composition.duration === screenClip.sourceOut - screenClip.sourceIn;
}

function isHeadTailTrimmedClip(clip, asset, assetId) {
  return Boolean(
    clip &&
      asset &&
      asset.id === assetId &&
      clip.assetId === asset.id &&
      clip.enabled === true &&
      clip.timelineIn === 0 &&
      clip.timelineOut === clip.sourceOut - clip.sourceIn &&
      clip.sourceIn >= 0 &&
      clip.sourceOut <= asset.duration &&
      clip.sourceOut > clip.sourceIn &&
      (clip.sourceIn > 0 || clip.sourceOut < asset.duration) &&
      clip.effects.length === 0 &&
      clip.keyframes.length === 0,
  );
}

function isFullLengthPlainClip(clip, asset) {
  return Boolean(
    clip &&
      asset &&
      clip.enabled === true &&
      clip.timelineIn === 0 &&
      clip.sourceIn === 0 &&
      clip.timelineOut === asset.duration &&
      clip.sourceOut === asset.duration &&
      clip.effects.length === 0 &&
      clip.keyframes.length === 0,
  );
}

function isCameraAlignedClip(clip, asset, sourceOffset, timelineIn, timelineOut) {
  return Boolean(
    clip &&
      asset &&
      clip.assetId === asset.id &&
      clip.enabled === true &&
      clip.timelineIn === timelineIn &&
      clip.timelineOut === timelineOut &&
      clip.sourceIn === sourceOffset + timelineIn &&
      clip.sourceOut === sourceOffset + timelineOut &&
      clip.sourceOut <= asset.duration &&
      clip.effects.length === 0 &&
      clip.keyframes.length === 0,
  );
}

async function sourceHasAudioStream(inputPath, signal = null) {
  const result = await run('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'a:0',
    '-show_entries',
    'stream=index',
    '-of',
    'json',
    inputPath,
  ], { signal });
  if (result.cancelled) return false;
  if (result.code !== 0) return false;
  try {
    const parsed = JSON.parse(result.stdout || '{}');
    return Array.isArray(parsed.streams) && parsed.streams.length > 0;
  } catch {
    return false;
  }
}

function run(command, args, { onStdout = () => undefined, signal = null } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let cancelled = false;
    let killTimer = null;

    const cleanupAbortListener = () => {
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener?.('abort', abortExport);
    };

    const abortExport = () => {
      cancelled = true;
      if (proc.killed || proc.exitCode !== null) return;
      proc.kill('SIGTERM');
      killTimer = setTimeout(() => {
        if (!proc.killed && proc.exitCode === null) proc.kill('SIGKILL');
      }, 2000);
      killTimer.unref?.();
    };

    if (signal?.aborted) abortExport();
    else signal?.addEventListener?.('abort', abortExport, { once: true });

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      onStdout(text);
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', (err) => {
      cleanupAbortListener();
      reject(err);
    });
    proc.on('close', (code) => {
      cleanupAbortListener();
      resolve({ code, stdout, stderr, cancelled });
    });
  });
}
