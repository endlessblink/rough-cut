import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { getPrimaryRecording } from './project-files.mjs';
import { createZoomSendcmdLayer } from './zoom-sendcmd.mjs';
import { getStyledCanvasResolution } from '@rough-cut/project-model';

export const EXPORT_MODES = Object.freeze({
  RAW: 'raw',
  STYLED: 'styled',
});

export function normalizeExportMode(mode = EXPORT_MODES.RAW) {
  if (mode === EXPORT_MODES.RAW || mode === EXPORT_MODES.STYLED) return mode;
  throw new Error(`Unsupported export mode: ${mode}`);
}

export async function exportProjectToMp4({ project, outputPath, mode = EXPORT_MODES.RAW, onProgress = () => undefined }) {
  const exportMode = normalizeExportMode(mode);
  const recording = getPrimaryRecording(project);
  if (!recording) throw new Error('Project has no recording to export.');
  assertDistinctExportPath(recording.filePath, outputPath);
  const canExportRaw = isSingleUneditedRecording(project, recording.assetId);
  const canExportTrimmedRaw = isSingleTrimmedRecording(project, recording.assetId);
  const canExportStyled = canExportRaw || canExportTrimmedRaw || isSingleUneditedRecordingWithCamera(project, recording.assetId) || isSingleTrimmedRecordingWithCamera(project, recording.assetId);
  if ((exportMode === EXPORT_MODES.RAW && !canExportRaw) || (exportMode === EXPORT_MODES.STYLED && !canExportStyled)) {
    if (!(exportMode === EXPORT_MODES.RAW && canExportTrimmedRaw)) {
      throw new Error('Only unedited or head/tail-trimmed single-recording exports are supported in the MVP.');
    }
  }

  if (exportMode === EXPORT_MODES.STYLED) {
    return exportStyledProjectToMp4({ project, recording, outputPath, onProgress });
  }

  if (canExportTrimmedRaw && !canExportRaw) {
    return exportRawTrimmedProjectToMp4({ recording, outputPath, onProgress });
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

async function exportRawTrimmedProjectToMp4({ recording, outputPath, onProgress = () => undefined }) {
  onProgress({ phase: 'trimming', progress: 0 });
  await mkdir(dirname(outputPath), { recursive: true });
  const fps = Number.isFinite(recording.fps) && recording.fps > 0 ? recording.fps : 30;
  const result = await run('ffmpeg', buildRawTrimExportArgs({
    inputPath: recording.filePath,
    outputPath,
    startFrame: recording.sourceIn ?? 0,
    endFrame: recording.sourceOut ?? recording.duration,
    fps,
  }));
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

export async function exportStyledProjectToMp4({ project, recording, outputPath, onProgress = () => undefined }) {
  onProgress({ phase: 'rendering-styled', progress: 0.01 });
  await mkdir(dirname(outputPath), { recursive: true });
  const canvas = getStyledCanvasResolution({
    aspectRatio: project?.settings?.aspectRatio ?? 'auto',
    sourceWidth: recording.width,
    sourceHeight: recording.height,
  });
  const presentationStyle = normalizePresentationStyle(recording.presentation?.background);
  const cursorLayer = await createCursorSubtitleLayer({
    cursorEvents: recording.cursorEvents,
    width: recording.width,
    height: recording.height,
    fps: recording.fps,
    durationFrames: recording.duration,
  });
  const zoomLayer = await createZoomSendcmdLayer({
    markers: Array.isArray(recording.zoomMarkers) ? recording.zoomMarkers : [],
    cursorEvents: recording.cursorEvents,
    sourceWidth: recording.width,
    sourceHeight: recording.height,
    fps: recording.fps,
    totalFrames: recording.duration,
  });
  try {
    const fps = Number.isFinite(recording.fps) && recording.fps > 0 ? recording.fps : 30;
    const durationSeconds = (recording.trimmedDuration ?? recording.duration) / fps;
    const result = await run('ffmpeg', buildStyledExportArgs({
      inputPath: recording.filePath,
      outputPath,
      width: canvas.width,
      height: canvas.height,
      screenPadding: presentationStyle.screenPadding,
      screenCornerRadius: presentationStyle.screenCornerRadius,
      screenShadowEnabled: presentationStyle.screenShadowEnabled,
      screenShadowBlur: presentationStyle.screenShadowBlur,
      screenShadowOpacity: presentationStyle.screenShadowOpacity,
      cursorAssPath: cursorLayer?.path,
      sourceWidth: recording.width,
      sourceHeight: recording.height,
      sourceFps: recording.fps,
      sourceTrimStartFrame: recording.sourceIn ?? 0,
      sourceTrimEndFrame: recording.sourceOut ?? recording.duration,
      zoomCropFilter: zoomLayer?.filterFragment ?? null,
      zoomSendcmdPath: zoomLayer?.path ?? null,
      cameraInputPath: recording.camera?.filePath ?? null,
      cameraSourceInFrames: recording.camera?.sourceInFrames ?? 0,
      cameraPresentation: recording.presentation?.camera ?? null,
    }), {
      onStdout: (chunk) => {
        const progress = parseFfmpegProgress(chunk, durationSeconds);
        if (progress !== null) {
          onProgress({ phase: 'rendering-styled', progress: 0.01 + progress * 0.98 });
        }
      },
    });
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
  };
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
  screenPadding = 96,
  screenCornerRadius = 32,
  screenShadowEnabled = true,
  screenShadowBlur = 58,
  screenShadowOpacity = 0.2,
  zoomCropFilter = null,
  zoomSendcmdPath = null,
  cameraInputPath = null,
  cameraSourceInFrames = 0,
  cameraPresentation = null,
}) {
  const safePadding = clampNumber(screenPadding, 0, Math.min(width, height) / 2 - 2);
  const maxVideoWidth = Math.round(width - safePadding * 2);
  const maxVideoHeight = Math.round(height - safePadding * 2);
  const cropPercent = 1;
  const cornerRadius = Math.round(clampNumber(screenCornerRadius, 0, Math.min(maxVideoWidth, maxVideoHeight) / 2));
  const shadowBlur = Math.round(clampNumber(screenShadowBlur, 0, 120));
  const shadowOpacity = screenShadowEnabled ? clampNumber(screenShadowOpacity, 0, 0.8) : 0;
  const shadowOffsetY = Math.round(Math.min(34, Math.max(10, height * 0.024)));
  const roundedAlpha = buildRoundedAlphaExpression(cornerRadius);
  const fps = Number.isFinite(sourceFps) && sourceFps > 0 ? sourceFps : 30;
  const trimStartFrame = Math.max(0, Math.round(sourceTrimStartFrame || 0));
  const trimEndFrame = Number.isFinite(sourceTrimEndFrame) ? Math.max(trimStartFrame + 1, Math.round(sourceTrimEndFrame)) : null;
  const trimDurationFrames = trimEndFrame === null ? null : trimEndFrame - trimStartFrame;
  const screenInput = cursorAssPath ? '[with_cursor]' : '[base]';
  const zoomActive = Boolean(zoomCropFilter && zoomSendcmdPath);
  const screenStep = zoomActive
    ? `${zoomCropFilter},sendcmd=f=${escapeFilterPath(zoomSendcmdPath)},scale=${maxVideoWidth}:${maxVideoHeight}:force_original_aspect_ratio=decrease,format=rgba`
    : `crop=iw*${cropPercent}:ih*${cropPercent}:(iw-ow)/2:(ih-oh)/2,scale=${maxVideoWidth}:${maxVideoHeight}:force_original_aspect_ratio=decrease,format=rgba`;
  const cameraFrame = cameraInputPath ? resolveCameraOverlayFrame(cameraPresentation, width, height) : null;
  const cameraTrim = Math.max(0, Math.round(cameraSourceInFrames));
  const cameraRadius = cameraFrame ? resolveCameraOverlayRadius(cameraPresentation, cameraFrame) : 0;
  const cameraAlpha = buildRoundedAlphaExpression(cameraRadius);
  const filter = [
    `nullsrc=s=${width}x${height}:r=${fps},format=rgb24,geq=r='224+20*X/W+10*Y/H':g='219+12*X/W+8*Y/H':b='232-8*X/W+12*Y/H',format=rgba[bg]`,
    '[0:v]setpts=PTS-STARTPTS[base]',
    ...(cursorAssPath ? [`[base]subtitles=${escapeFilterPath(cursorAssPath)}[with_cursor]`] : []),
    `${screenInput}${screenStep}[screen]`,
    `[screen]geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${roundedAlpha}'[rounded]`,
    `[rounded]split[shadow_src][fg]`,
    `[shadow_src]colorchannelmixer=rr=0:gg=0:bb=0:aa=${formatFilterNumber(shadowOpacity)},boxblur=${shadowBlur}:5[shadow]`,
    `[bg][shadow]overlay=(W-w)/2:(H-h)/2+${shadowOffsetY}:shortest=1[with_shadow]`,
    `[with_shadow][fg]overlay=(W-w)/2:(H-h)/2:shortest=1[with_screen]`,
    ...(cameraFrame
      ? [
          `[1:v]setpts=PTS-STARTPTS${cameraTrim > 0 ? `,trim=start_frame=${cameraTrim},setpts=PTS-STARTPTS` : ''},scale=${cameraFrame.w}:${cameraFrame.h}:force_original_aspect_ratio=increase,crop=${cameraFrame.w}:${cameraFrame.h},format=rgba[camera_scaled]`,
          `[camera_scaled]geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${cameraAlpha}'[camera_rounded]`,
          `[with_screen][camera_rounded]overlay=${cameraFrame.x}:${cameraFrame.y}:shortest=1,format=yuv420p[v]`,
        ]
      : ['[with_screen]format=yuv420p[v]']),
  ].join(';');

  return [
    '-y',
    '-progress',
    'pipe:1',
    '-nostats',
    ...(trimStartFrame > 0 ? ['-ss', formatFilterNumber(trimStartFrame / fps)] : []),
    ...(trimDurationFrames !== null ? ['-t', formatFilterNumber(trimDurationFrames / fps)] : []),
    '-i',
    inputPath,
    ...(cameraInputPath ? ['-i', cameraInputPath] : []),
    '-filter_complex',
    filter,
    '-map',
    '[v]',
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'copy',
    '-movflags',
    '+faststart',
    '-metadata',
    `rough_cut_style=canvas:${width}x${height}:studio-demo`,
    outputPath,
  ];
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

function resolveCameraOverlayFrame(camera = null, canvasWidth, canvasHeight) {
  const sizeScale = clampNumber((camera?.size ?? 100) / 100, 0.5, 2);
  const w = Math.round(Math.min(canvasWidth, canvasHeight) * 0.22 * sizeScale);
  const h = w;
  const margin = Math.round(Math.min(canvasWidth, canvasHeight) * 0.06);
  const position = camera?.position ?? 'corner-br';
  if (position === 'center') return { x: Math.round((canvasWidth - w) / 2), y: Math.round((canvasHeight - h) / 2), w, h };
  const left = position.endsWith('bl') || position.endsWith('tl');
  const top = position.endsWith('tl') || position.endsWith('tr');
  return {
    x: left ? margin : canvasWidth - w - margin,
    y: top ? margin : canvasHeight - h - margin,
    w,
    h,
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

function normalizePresentationStyle(background = null) {
  return {
    screenPadding: Number.isFinite(background?.bgPadding) ? background.bgPadding : 96,
    screenCornerRadius: Number.isFinite(background?.bgCornerRadius) ? background.bgCornerRadius : 32,
    screenShadowEnabled: typeof background?.bgShadowEnabled === 'boolean' ? background.bgShadowEnabled : true,
    screenShadowBlur: Number.isFinite(background?.bgShadowBlur) ? background.bgShadowBlur : 58,
    screenShadowOpacity: Number.isFinite(background?.bgShadowOpacity) ? background.bgShadowOpacity : 0.2,
  };
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function formatFilterNumber(value) {
  return Number(value).toFixed(3).replace(/\.?0+$/, '');
}

export async function createCursorSubtitleLayer({ cursorEvents = [], width, height, fps = 30, durationFrames = null } = {}) {
  const ass = buildCursorAss({ cursorEvents, width, height, fps, durationFrames });
  if (!ass) return null;

  const root = await mkdtemp(join(tmpdir(), 'rough-cut-cursor-layer-'));
  const path = join(root, 'cursor.ass');
  await writeFile(path, ass, 'utf8');
  return {
    path,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

export function buildCursorAss({ cursorEvents = [], width = 1920, height = 1080, fps = 30, durationFrames = null, maxEvents = 600 } = {}) {
  const events = cursorEvents
    .filter((event) => event && event.type === 'move' && Number.isFinite(event.frame) && Number.isFinite(event.x) && Number.isFinite(event.y))
    .sort((a, b) => a.frame - b.frame);
  const clicks = cursorEvents
    .filter((event) => event && event.type === 'down' && Number.isFinite(event.frame) && Number.isFinite(event.x) && Number.isFinite(event.y))
    .sort((a, b) => a.frame - b.frame);
  if (events.length === 0 && clicks.length === 0) return null;

  const stride = Math.max(1, Math.ceil(events.length / maxEvents));
  const sampled = events.filter((_event, index) => index % stride === 0);
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
  return isFullLengthPlainClip(screenClip, recording) && isFullLengthPlainClip(cameraClip, camera) && project.composition.duration === recording.duration;
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

function run(command, args, { onStdout = () => undefined } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      onStdout(text);
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}
