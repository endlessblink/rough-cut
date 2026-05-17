import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const DEFAULT_WIDTH = 480;
const DEFAULT_JPEG_QUALITY = 5;

export async function extractThumbnail({
  videoPath,
  outputPath,
  atSeconds = 0,
  width = DEFAULT_WIDTH,
  jpegQuality = DEFAULT_JPEG_QUALITY,
  runner = runFfmpeg,
}) {
  // -ss before -i seeks at the demuxer level (fast). -frames:v 1 grabs a
  // single frame. -vf scale=W:-2 keeps aspect ratio and an even height (h.264
  // friendly even though we're writing JPEG). -q:v scales JPEG quality
  // (lower = better, 2-31).
  const args = [
    '-y',
    '-ss', String(Math.max(0, atSeconds)),
    '-i', videoPath,
    '-frames:v', '1',
    '-vf', `scale=${width}:-2`,
    '-q:v', String(jpegQuality),
    outputPath,
  ];
  const result = await runner('ffmpeg', args);
  if (result.code !== 0) {
    throw new Error(`Failed to extract thumbnail: ${result.stderr.trim() || `ffmpeg exited ${result.code}`}`);
  }
  return outputPath;
}

export function buildThumbnailPath(projectPath) {
  const dir = dirname(projectPath);
  const stem = basename(projectPath).replace(/\.roughcut$/i, '');
  return join(dir, `${stem}.thumb.jpg`);
}

export async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch (err) {
    if (err?.code === 'ENOENT') return false;
    throw err;
  }
}

function runFfmpeg(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}
