import { spawn } from 'node:child_process';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getPrimaryRecording } from './project-files.mjs';

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
  const result = await run('ffmpeg', buildStyledExportArgs({ inputPath: recording.filePath, outputPath }));
  if (result.code !== 0) {
    throw new Error(`Styled export failed: ${result.stderr.trim()}`);
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

export function buildStyledExportArgs({ inputPath, outputPath, width = 1920, height = 1080 }) {
  const maxVideoWidth = Math.round(width * 0.9);
  const maxVideoHeight = Math.round(height * 0.9);
  const cropPercent = 0.76;
  const cornerRadius = 26;
  const shadowOffsetY = 26;
  const roundedAlpha = buildRoundedAlphaExpression(cornerRadius);
  const filter = [
    `nullsrc=s=${width}x${height},format=rgb24,geq=r='224+20*X/W+10*Y/H':g='219+12*X/W+8*Y/H':b='232-8*X/W+12*Y/H',format=rgba[bg]`,
    `[0:v]crop=iw*${cropPercent}:ih*${cropPercent}:(iw-ow)/2:(ih-oh)/2,scale=${maxVideoWidth}:${maxVideoHeight}:force_original_aspect_ratio=decrease,format=rgba[screen]`,
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
