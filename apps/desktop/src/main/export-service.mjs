import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { getPrimaryRecording } from './project-files.mjs';
import { createZoomSendcmdLayer } from './zoom-sendcmd.mjs';

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
  if (!isSingleUneditedRecording(project, recording.assetId)) {
    throw new Error('Only unedited single-recording exports are supported in the MVP.');
  }

  if (exportMode === EXPORT_MODES.STYLED) {
    return exportStyledProjectToMp4({ recording, outputPath, onProgress });
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

export async function exportStyledProjectToMp4({ recording, outputPath, onProgress = () => undefined }) {
  onProgress({ phase: 'rendering-styled', progress: 0 });
  await mkdir(dirname(outputPath), { recursive: true });
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
    const result = await run('ffmpeg', buildStyledExportArgs({
      inputPath: recording.filePath,
      outputPath,
      cursorAssPath: cursorLayer?.path,
      sourceWidth: recording.width,
      sourceHeight: recording.height,
      sourceFps: recording.fps,
      zoomCropFilter: zoomLayer?.filterFragment ?? null,
      zoomSendcmdPath: zoomLayer?.path ?? null,
    }));
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
  zoomCropFilter = null,
  zoomSendcmdPath = null,
}) {
  const maxVideoWidth = Math.round(width * 0.9);
  const maxVideoHeight = Math.round(height * 0.9);
  const cropPercent = 1;
  const cornerRadius = 26;
  const shadowOffsetY = 26;
  const roundedAlpha = buildRoundedAlphaExpression(cornerRadius);
  const fps = Number.isFinite(sourceFps) && sourceFps > 0 ? sourceFps : 30;
  const screenInput = cursorAssPath ? '[with_cursor]' : '[base]';
  const zoomActive = Boolean(zoomCropFilter && zoomSendcmdPath);
  const screenStep = zoomActive
    ? `${zoomCropFilter},sendcmd=f=${escapeFilterPath(zoomSendcmdPath)},scale=${maxVideoWidth}:${maxVideoHeight}:force_original_aspect_ratio=decrease,format=rgba`
    : `crop=iw*${cropPercent}:ih*${cropPercent}:(iw-ow)/2:(ih-oh)/2,scale=${maxVideoWidth}:${maxVideoHeight}:force_original_aspect_ratio=decrease,format=rgba`;
  const filter = [
    `nullsrc=s=${width}x${height}:r=${fps},format=rgb24,geq=r='224+20*X/W+10*Y/H':g='219+12*X/W+8*Y/H':b='232-8*X/W+12*Y/H',format=rgba[bg]`,
    '[0:v]setpts=PTS-STARTPTS[base]',
    ...(cursorAssPath ? [`[base]subtitles=${escapeFilterPath(cursorAssPath)}[with_cursor]`] : []),
    `${screenInput}${screenStep}[screen]`,
    `[screen]geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${roundedAlpha}'[rounded]`,
    `[rounded]split[shadow_src][fg]`,
    `[shadow_src]colorchannelmixer=rr=0:gg=0:bb=0:aa=0.20,boxblur=58:5[shadow]`,
    `[bg][shadow]overlay=(W-w)/2:(H-h)/2+${shadowOffsetY}:shortest=1[with_shadow]`,
    `[with_shadow][fg]overlay=(W-w)/2:(H-h)/2:shortest=1,format=yuv420p[v]`,
  ].join(';');

  return [
    '-y',
    '-i',
    inputPath,
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
  if (events.length === 0) return null;

  const stride = Math.max(1, Math.ceil(events.length / maxEvents));
  const sampled = events.filter((_event, index) => index % stride === 0);
  // Preserve the very last recorded event so the exported cursor reflects
  // its actual final position. Stride filtering can otherwise drop the last
  // event when (events.length - 1) % stride !== 0, leaving the cursor stuck
  // at an earlier sampled position for the tail of the recording.
  const lastEvent = events[events.length - 1];
  if (sampled.length === 0 || sampled[sampled.length - 1] !== lastEvent) {
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

  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${Math.round(width)}
PlayResY: ${Math.round(height)}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cursor,Arial,28,&H00FFFFFF,&H00FFFFFF,&H00333A46,&H55000000,-1,0,0,0,100,100,0,0,1,2.2,1.2,7,0,0,0,1

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

function run(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}
