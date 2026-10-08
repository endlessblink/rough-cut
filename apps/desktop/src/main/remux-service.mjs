import { spawn } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { probeMp4Integrity } from './media-probe.mjs';

const COHERENCE_TOLERANCE_FRAMES = 5;

export async function validateRemuxedMp4(filePath, options = {}) {
  const { probe = probeMp4Integrity, toleranceFrames = COHERENCE_TOLERANCE_FRAMES } = options;
  const integrity = await probe(filePath);
  const { advertisedFrames, decodedFrames } = integrity;

  // No frames decoded at all means the container advertised a stream that
  // doesn't actually exist on disk — refuse to call this a successful remux.
  if (decodedFrames !== null && decodedFrames < 1) {
    throw new RemuxIncompleteError(
      `Recording incomplete: ${filePath} has no decodable frames (header advertised ${advertisedFrames ?? 'unknown'}).`,
      { filePath, integrity },
    );
  }

  // Some frames decoded but the header overpromised — partial recovery.
  if (
    advertisedFrames !== null &&
    decodedFrames !== null &&
    advertisedFrames - decodedFrames > toleranceFrames
  ) {
    return {
      coherent: false,
      integrity,
      warning: `Partial recording: ${decodedFrames}/${advertisedFrames} frames decoded (${advertisedFrames - decodedFrames} missing).`,
    };
  }

  return { coherent: true, integrity, warning: null };
}

export class RemuxIncompleteError extends Error {
  constructor(message, { filePath, integrity } = {}) {
    super(message);
    this.name = 'RemuxIncompleteError';
    this.code = 'REMUX_INCOMPLETE';
    this.filePath = filePath ?? null;
    this.integrity = integrity ?? null;
  }
}

/**
 * Where to end a raw capture so the audio tail grace (seconds captured after the user pressed
 * Stop/Pause, see recording-session.mjs) is cut off. Null = keep the whole file.
 */
export async function resolveTailTrimEnd(rawPath, tailTrimSec, { probeEnd = probeMediaEnd, onLog = () => undefined } = {}) {
  const trim = Number(tailTrimSec);
  if (!Number.isFinite(trim) || trim <= 0) return null;
  const ends = await probeEnd(rawPath).catch((error) => {
    onLog(`[remux] WARN audio-tail trim skipped (probe failed): ${error?.message ?? error}`);
    return null;
  });
  const fileEnd = Number(ends?.endSec);
  if (!Number.isFinite(fileEnd) || fileEnd <= trim + 0.1) {
    onLog(`[remux] WARN audio-tail trim skipped: file end ${ends?.endSec ?? 'unknown'} s, trim ${trim.toFixed(3)} s`);
    return null;
  }
  const keepSec = fileEnd - trim;
  const audioEnd = Number(ends?.audioEndSec);
  const audioMarginSec = Number.isFinite(audioEnd) && ends?.audioEndSec !== null ? audioEnd - keepSec : null;
  // audioMarginSec < 0 means sound still ends before the kept picture: the grace was too short.
  onLog(`[remux] audio-tail trim: file=${rawPath} fileEnd=${fileEnd.toFixed(3)} audioEnd=${audioMarginSec === null ? 'none' : audioEnd.toFixed(3)} trim=${trim.toFixed(3)} keep=${keepSec.toFixed(3)} audioMarginSec=${audioMarginSec === null ? 'n/a' : audioMarginSec.toFixed(3)}`);
  if (audioMarginSec !== null && audioMarginSec < 0) {
    onLog(`[remux] WARN audio-tail still short by ${(-audioMarginSec).toFixed(3)} s after the grace`);
  }
  return keepSec;
}

export async function remuxMkvToMp4({
  rawPath,
  outputPath,
  maps = ['0'],
  tailTrimSec = 0,
  onLog = () => undefined,
  validate = validateRemuxedMp4,
  runner = run,
  probeEnd = probeMediaEnd,
}) {
  const mapArgs = normalizeMaps(maps).flatMap((map) => ['-map', map]);
  const keepSec = await resolveTailTrimEnd(rawPath, tailTrimSec, { probeEnd, onLog });
  const trimArgs = keepSec === null ? [] : ['-t', keepSec.toFixed(3)];
  const args = ['-y', '-i', rawPath, ...mapArgs, '-c', 'copy', ...trimArgs, '-movflags', '+faststart', outputPath];
  onLog('[remux] Starting: ffmpeg ' + args.join(' '));
  const result = await runner('ffmpeg', args, onLog);
  if (result.code !== 0) {
    throw new Error(`Failed to remux MKV to MP4: ${result.stderr.trim()}`);
  }
  const validation = await validate(outputPath);
  if (validation.warning) onLog(`[remux] WARN ${validation.warning}`);
  return { outputPath, integrity: validation.integrity, warning: validation.warning };
}

export async function remuxMkvSegmentsToMp4({
  rawPaths,
  outputPath,
  maps = ['0'],
  tailTrimSec = [],
  onLog = () => undefined,
  validate = validateRemuxedMp4,
  runner = run,
  probeEnd = probeMediaEnd,
}) {
  const paths = Array.isArray(rawPaths) ? rawPaths.filter(Boolean) : [];
  if (paths.length === 0) throw new Error('Cannot remux recording segments: no raw paths were provided.');
  const trims = Array.isArray(tailTrimSec) ? tailTrimSec : paths.map(() => tailTrimSec);
  if (paths.length === 1) {
    return remuxMkvToMp4({ rawPath: paths[0], outputPath, maps, tailTrimSec: trims[0] ?? 0, onLog, validate, runner, probeEnd });
  }
  const listPath = join(dirname(outputPath), `${outputPath.split('/').pop().replace(/\.mp4$/i, '')}.concat.txt`);
  // Each segment is cut at its own press moment (outpoint), so a pause never leaves a sound gap
  // that would shift the later segments' sound against their picture.
  const lines = [];
  for (let index = 0; index < paths.length; index += 1) {
    lines.push(`file '${escapeConcatPath(paths[index])}'`);
    const keepSec = await resolveTailTrimEnd(paths[index], trims[index] ?? 0, { probeEnd, onLog });
    if (keepSec !== null) lines.push(`outpoint ${keepSec.toFixed(3)}`);
  }
  const listBody = lines.join('\n') + '\n';
  await writeFile(listPath, listBody, 'utf8');
  try {
    const mapArgs = normalizeMaps(maps).flatMap((map) => ['-map', map]);
    const args = ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, ...mapArgs, '-c', 'copy', '-movflags', '+faststart', outputPath];
    onLog('[remux] Starting: ffmpeg ' + args.join(' '));
    const result = await runner('ffmpeg', args, onLog);
    if (result.code !== 0) {
      throw new Error(`Failed to remux MKV segments to MP4: ${result.stderr.trim()}`);
    }
    const validation = await validate(outputPath);
    if (validation.warning) onLog(`[remux] WARN ${validation.warning}`);
    return { outputPath, integrity: validation.integrity, warning: validation.warning };
  } finally {
    await rm(listPath, { force: true }).catch(() => undefined);
  }
}

/** End of a raw capture (container end) and of its sound, in seconds. */
export async function probeMediaEnd(filePath, { runner = run } = {}) {
  const result = await runner('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath], () => undefined);
  if (result.code !== 0) throw new Error(`ffprobe failed: ${result.stderr.trim().slice(0, 200)}`);
  const endSec = Number.parseFloat(result.stdout.trim());
  const audio = await runner(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'packet=pts_time,duration_time', '-of', 'csv=p=0', filePath],
    () => undefined,
  );
  let audioEndSec = null;
  if (audio.code === 0) {
    const last = audio.stdout.trim().split('\n').filter(Boolean).pop();
    if (last) {
      const [pts, duration] = last.split(',').map(Number.parseFloat);
      if (Number.isFinite(pts)) audioEndSec = pts + (Number.isFinite(duration) ? duration : 0);
    }
  }
  return { endSec: Number.isFinite(endSec) ? endSec : null, audioEndSec };
}

function normalizeMaps(maps) {
  const list = Array.isArray(maps) ? maps : [maps];
  const normalized = list
    .map((map) => (typeof map === 'string' ? map.trim() : ''))
    .filter(Boolean);
  return normalized.length > 0 ? normalized : ['0'];
}

function escapeConcatPath(path) {
  return String(path).replace(/'/g, "'\\''");
}

function run(command, args, onLog) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      logLines(onLog, '[remux:stdout]', text);
    });
    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      logLines(onLog, '[remux:stderr]', text);
    });
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function logLines(onLog, prefix, text) {
  for (const line of text.split(/[\r\n]+/)) {
    const trimmed = line.trim();
    if (trimmed) onLog(`${prefix} ${trimmed}`);
  }
}
