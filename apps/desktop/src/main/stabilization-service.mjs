import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { probeImportedMedia } from './media-probe.mjs';

export const STABILIZATION_METHOD_VERSION = 1;
export const DEFAULT_STABILIZATION_CACHE_BYTES = 10 * 1024 * 1024 * 1024;

const DETECTION_DIR = 'analysis';
const PROXY_DIR = 'proxies';

export function stabilizationSettings(strength) {
  const normalized = Number.isFinite(Number(strength))
    ? Math.max(0, Math.min(100, Math.round(Number(strength))))
    : 50;
  return {
    strength: normalized,
    smoothing: Math.round(5 + (normalized / 100) * 55),
    optzoom: 2,
  };
}

export function stabilizationCacheKeys(sourcePath, sourceInfo, strength) {
  const sourceIdentity = [
    sourcePath,
    Number(sourceInfo?.size) || 0,
    Math.round(Number(sourceInfo?.mtimeMs) || 0),
    `v${STABILIZATION_METHOD_VERSION}`,
  ].join('\0');
  const analysisKey = createHash('sha256').update(sourceIdentity).digest('hex').slice(0, 24);
  const settings = stabilizationSettings(strength);
  const proxyKey = createHash('sha256')
    .update(`${analysisKey}\0strength=${settings.strength}`)
    .digest('hex')
    .slice(0, 24);
  return { analysisKey, proxyKey };
}

export function buildDetectionArgs(sourcePath, transformPath) {
  return [
    '-hide_banner',
    '-y',
    '-i', sourcePath,
    '-an',
    '-vf', `vidstabdetect=${[
      'shakiness=5',
      'accuracy=9',
      'stepsize=6',
      'mincontrast=0.3',
      `result='${escapeFilterValue(transformPath)}'`,
    ].join(':')}`,
    '-progress', 'pipe:2',
    '-nostats',
    '-f', 'null',
    '-',
  ];
}

export function buildTransformArgs({
  sourcePath,
  transformPath,
  outputPath,
  strength,
  encoder = 'h264_nvenc',
}) {
  const settings = stabilizationSettings(strength);
  const encoding = encoder === 'h264_nvenc'
    ? ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '20']
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20'];
  return [
    '-hide_banner',
    '-y',
    '-i', sourcePath,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-vf', `vidstabtransform=${[
      `input='${escapeFilterValue(transformPath)}'`,
      `smoothing=${settings.smoothing}`,
      `optzoom=${settings.optzoom}`,
      'zoom=0',
      'interpol=bicubic',
    ].join(':')}`,
    ...encoding,
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    '-progress', 'pipe:2',
    '-nostats',
    outputPath,
  ];
}

export function parseFfmpegProgress(text, durationSeconds) {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const matches = [...String(text).matchAll(/(?:^|\r?\n)out_time_(?:us|ms)=(\d+)/g)];
  if (matches.length === 0) return null;
  const microseconds = Number(matches.at(-1)[1]);
  if (!Number.isFinite(microseconds)) return null;
  return Math.max(0, Math.min(1, microseconds / 1_000_000 / duration));
}

export async function probeStabilizationSupport({ runner = runProcess } = {}) {
  let result;
  try {
    result = await runner('ffmpeg', ['-hide_banner', '-filters']);
  } catch (error) {
    return {
      supported: false,
      filters: { vidstabdetect: false, vidstabtransform: false },
      reason: `FFmpeg is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const filters = {
    vidstabdetect: /\bvidstabdetect\b/.test(output),
    vidstabtransform: /\bvidstabtransform\b/.test(output),
  };
  const missing = Object.entries(filters).filter(([, present]) => !present).map(([name]) => name);
  return {
    supported: result.code === 0 && missing.length === 0,
    filters,
    reason: result.code !== 0
      ? `FFmpeg filter probe failed: ${String(result.stderr ?? '').trim() || `exit ${result.code}`}`
      : missing.length > 0
        ? `FFmpeg is missing required stabilization filters: ${missing.join(', ')}`
        : null,
  };
}

export function createStabilizationService({
  cacheRoot = join(tmpdir(), 'rough-cut-stabilization-cache'),
  maxCacheBytes = DEFAULT_STABILIZATION_CACHE_BYTES,
  runner = runProcess,
  sourceStat = stat,
  probeMetadata = (path) => probeImportedMedia(path, { kind: 'video' }),
} = {}) {
  const jobs = new Map();
  const analysisFlights = new Map();
  const proxyFlights = new Map();
  let supportPromise = null;

  function probeSupport() {
    supportPromise ??= probeStabilizationSupport({ runner });
    return supportPromise;
  }

  async function prepare({
    sourceId,
    sourcePath,
    strength = 50,
    signal = null,
    onProgress = () => undefined,
  }) {
    if (!sourceId || typeof sourceId !== 'string') throw new TypeError('sourceId is required');
    if (!sourcePath || typeof sourcePath !== 'string') throw new TypeError('sourcePath is required');
    const sourceInfo = await sourceStat(sourcePath);
    const settings = stabilizationSettings(strength);
    const { analysisKey, proxyKey } = stabilizationCacheKeys(sourcePath, sourceInfo, settings.strength);
    const analysisDir = join(cacheRoot, DETECTION_DIR);
    const proxyDir = join(cacheRoot, PROXY_DIR);
    const transformPath = join(analysisDir, `${analysisKey}.trf`);
    const proxyPath = join(proxyDir, `${proxyKey}.mp4`);
    const sourceMetadata = await probeMetadata(sourcePath);
    validateSourceMetadata(sourceMetadata, sourcePath);

    if (await pathExists(proxyPath)) {
      const metadata = await probeMetadata(proxyPath);
      validateProxyMetadata(sourceMetadata, metadata);
      return buildResult({
        jobId: randomUUID(),
        sourceId,
        proxyKey,
        transformPath,
        proxyPath,
        strength: settings.strength,
        encoder: 'cached',
        metadata,
        reused: true,
      });
    }

    const existing = proxyFlights.get(proxyKey);
    if (existing) return existing.promise;

    const jobId = randomUUID();
    const controller = new AbortController();
    if (signal?.aborted) throw createAbortError();
    const abortFromCaller = () => controller.abort(createAbortError());
    signal?.addEventListener('abort', abortFromCaller, { once: true });
    const job = {
      jobId,
      sourceId,
      sourcePath,
      strength: settings.strength,
      phase: 'queued',
      controller,
    };
    jobs.set(jobId, job);

    const emitProgress = (phase, progress) => {
      job.phase = phase;
      onProgress({
        jobId,
        sourceId,
        phase,
        progress: Math.max(0, Math.min(1, Number(progress) || 0)),
      });
    };

    const promise = (async () => {
      await mkdir(analysisDir, { recursive: true });
      await mkdir(proxyDir, { recursive: true });
      await ensureAnalysis({
        analysisFlights,
        analysisKey,
        sourcePath,
        transformPath,
        durationSeconds: sourceMetadata.durationSeconds,
        runner,
        signal: controller.signal,
        onProgress: (progress) => emitProgress('analyzing', progress),
      });
      throwIfAborted(controller.signal);
      const encoder = await encodeProxy({
        sourcePath,
        transformPath,
        proxyPath,
        proxyKey,
        strength: settings.strength,
        durationSeconds: sourceMetadata.durationSeconds,
        runner,
        signal: controller.signal,
        onProgress: (progress) => emitProgress('encoding', progress),
      });
      throwIfAborted(controller.signal);
      const metadata = await probeMetadata(proxyPath);
      validateProxyMetadata(sourceMetadata, metadata);
      emitProgress('ready', 1);
      await pruneStabilizationCache(cacheRoot, maxCacheBytes, {
        keepPaths: new Set([transformPath, proxyPath]),
      });
      return buildResult({
        jobId,
        sourceId,
        proxyKey,
        transformPath,
        proxyPath,
        strength: settings.strength,
        encoder,
        metadata,
        reused: false,
      });
    })().catch(async (error) => {
      if (controller.signal.aborted) throw createAbortError();
      throw error;
    }).finally(() => {
      signal?.removeEventListener('abort', abortFromCaller);
      jobs.delete(jobId);
      proxyFlights.delete(proxyKey);
    });

    proxyFlights.set(proxyKey, { jobId, promise, controller });
    return promise;
  }

  function cancel(jobId) {
    const job = jobs.get(jobId);
    if (!job) return false;
    job.controller.abort(createAbortError());
    return true;
  }

  function listJobs() {
    return [...jobs.values()].map(({ controller: _controller, ...job }) => ({ ...job }));
  }

  return { prepare, cancel, listJobs, probeSupport };
}

async function ensureAnalysis({
  analysisFlights,
  analysisKey,
  sourcePath,
  transformPath,
  durationSeconds,
  runner,
  signal,
  onProgress,
}) {
  if (await pathExists(transformPath)) return;
  const existing = analysisFlights.get(analysisKey);
  if (existing) return existing;
  const partialPath = partialArtifactPath(transformPath);
  const flight = (async () => {
    await rm(partialPath, { force: true });
    try {
      const result = await runner(
        'ffmpeg',
        buildDetectionArgs(sourcePath, partialPath),
        progressOptions(signal, durationSeconds, onProgress),
      );
      throwIfAborted(signal);
      assertProcessSuccess(result, 'Stabilization analysis');
      await rename(partialPath, transformPath);
    } finally {
      await rm(partialPath, { force: true }).catch(() => undefined);
    }
  })().finally(() => analysisFlights.delete(analysisKey));
  analysisFlights.set(analysisKey, flight);
  return flight;
}

async function encodeProxy({
  sourcePath,
  transformPath,
  proxyPath,
  proxyKey,
  strength,
  durationSeconds,
  runner,
  signal,
  onProgress,
}) {
  const partialPath = partialArtifactPath(proxyPath, proxyKey);
  try {
    for (const encoder of ['h264_nvenc', 'libx264']) {
      await rm(partialPath, { force: true });
      let result;
      try {
        result = await runner(
          'ffmpeg',
          buildTransformArgs({ sourcePath, transformPath, outputPath: partialPath, strength, encoder }),
          progressOptions(signal, durationSeconds, onProgress),
        );
      } catch (error) {
        if (signal.aborted || encoder === 'libx264') throw error;
        continue;
      }
      throwIfAborted(signal);
      if (result.code === 0) {
        await rename(partialPath, proxyPath);
        return encoder;
      }
      if (encoder === 'libx264') assertProcessSuccess(result, 'Stabilization proxy encoding');
    }
    throw new Error('Stabilization proxy encoding failed without an encoder result');
  } finally {
    await rm(partialPath, { force: true }).catch(() => undefined);
  }
}

function progressOptions(signal, durationSeconds, onProgress) {
  let buffered = '';
  return {
    signal,
    onStderr(chunk) {
      buffered = `${buffered}${String(chunk)}`.slice(-2048);
      const progress = parseFfmpegProgress(buffered, durationSeconds);
      if (progress !== null) onProgress(progress);
    },
  };
}

function buildResult({
  jobId,
  sourceId,
  proxyKey,
  transformPath,
  proxyPath,
  strength,
  encoder,
  metadata,
  reused,
}) {
  return {
    jobId,
    sourceId,
    cacheKey: proxyKey,
    transformPath,
    proxyPath,
    strength,
    methodVersion: STABILIZATION_METHOD_VERSION,
    encoder,
    metadata,
    reused,
  };
}

function validateSourceMetadata(metadata, sourcePath) {
  if (
    !metadata
    || !positive(metadata.durationSeconds)
    || !positive(metadata.width)
    || !positive(metadata.height)
    || !positive(metadata.fps)
  ) {
    throw new Error(`Cannot stabilize ${sourcePath}: incomplete video metadata`);
  }
}

function validateProxyMetadata(source, proxy) {
  validateSourceMetadata(proxy, 'generated proxy');
  if (Number(proxy.width) !== Number(source.width) || Number(proxy.height) !== Number(source.height)) {
    throw new Error(
      `Stabilized proxy dimensions changed from ${source.width}x${source.height} to ${proxy.width}x${proxy.height}`,
    );
  }
  const frameDuration = 1 / Number(source.fps);
  if (Math.abs(Number(proxy.durationSeconds) - Number(source.durationSeconds)) > frameDuration) {
    throw new Error('Stabilized proxy duration differs from the source by more than one frame');
  }
  if (Math.abs(Number(proxy.fps) - Number(source.fps)) > 0.01) {
    throw new Error('Stabilized proxy frame rate differs from the source');
  }
  if (source.hasAudio === true && proxy.hasAudio !== true) {
    throw new Error('Stabilized proxy is missing source audio');
  }
}

export async function pruneStabilizationCache(
  cacheRoot,
  maxBytes = DEFAULT_STABILIZATION_CACHE_BYTES,
  { keepPaths = new Set() } = {},
) {
  if (!Number.isFinite(maxBytes) || maxBytes < 0) return;
  const entries = [];
  for (const directory of [join(cacheRoot, DETECTION_DIR), join(cacheRoot, PROXY_DIR)]) {
    let names;
    try {
      names = await readdir(directory);
    } catch {
      continue;
    }
    for (const name of names) {
      const path = join(directory, name);
      if (keepPaths.has(path) || name.includes('.part-')) continue;
      try {
        const info = await stat(path);
        if (info.isFile()) entries.push({ path, size: info.size, usedAt: info.atimeMs || info.mtimeMs });
      } catch {
        // A concurrent cleanup may already have removed it.
      }
    }
  }
  let total = entries.reduce((sum, entry) => sum + entry.size, 0);
  entries.sort((a, b) => a.usedAt - b.usedAt);
  for (const entry of entries) {
    if (total <= maxBytes) break;
    await rm(entry.path, { force: true });
    total -= entry.size;
  }
}

function partialArtifactPath(finalPath, token = randomUUID()) {
  const extensionIndex = finalPath.lastIndexOf('.');
  if (extensionIndex < 0) return `${finalPath}.part-${token}`;
  return `${finalPath.slice(0, extensionIndex)}.part-${token}${finalPath.slice(extensionIndex)}`;
}

function escapeFilterValue(value) {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'");
}

function positive(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

async function pathExists(path) {
  try {
    const info = await stat(path);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

function assertProcessSuccess(result, label) {
  if (result?.code === 0) return;
  const stderr = String(result?.stderr ?? '').trim();
  throw new Error(`${label} failed: ${stderr || `ffmpeg exited ${result?.code ?? 'without a code'}`}`);
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw createAbortError();
}

function createAbortError() {
  const error = new Error('Stabilization job was cancelled');
  error.name = 'AbortError';
  return error;
}

function runProcess(command, args, { signal, onStdout, onStderr } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const abort = () => {
      child.kill('SIGTERM');
    };
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk) => {
      const text = String(chunk);
      stdout += text;
      onStdout?.(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = String(chunk);
      stderr += text;
      onStderr?.(text);
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      reject(signal?.aborted ? createAbortError() : error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) reject(createAbortError());
      else resolve({ code, stdout, stderr });
    });
  });
}
