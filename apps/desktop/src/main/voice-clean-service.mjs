// "Clean voice": removes background noise from a recording's voice with NVIDIA
// RE-USE (https://huggingface.co/nvidia/NVIDIA-NemotronLabs-RE-USE, OpenMDW-1.1).
//
// The result is a cached sibling audio file, `<recording>.voice-clean.wav`:
// 48 kHz 16-bit PCM, channel 0 = the original voice (mono), channel 1 = the
// cleaned voice, sample-aligned. WAV because <audio> seeks PCM exactly (no AAC
// priming offset). The preview mixes the two channels at playback time, so
// moving the Amount slider never re-renders anything. The original recording
// is only ever read.
//
// Dev/local only for now: the Python env is about 5 GB, needs an NVIDIA GPU, and
// is not packaged with the app. scripts/setup-voice-clean.sh creates it at
// ~/.local/share/rough-cut/voice-clean (override: ROUGH_CUT_VOICE_CLEAN_HOME).
// Without it the feature reports "needs setup" and nothing else changes.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdtemp, open, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, setPriority, tmpdir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export const VOICE_CLEAN_SUFFIX = '.voice-clean.wav';
export const VOICE_CLEAN_RECIPE =
  'recipes/USEMamba_30x1_lr_00002_norm_05_vq_065_nfft_320_hop_40_NRIR_012_pha_0005_com_04_early_001.yaml';
export const VOICE_CLEAN_SAMPLE_RATE = 48_000;
// Background priority (nice 10) for both ffmpeg and the GPU worker.
export const VOICE_CLEAN_NICE = 10;
const DEFAULT_WORKER_PATH = fileURLToPath(new URL('./voice-clean-worker.py', import.meta.url));
const SOURCE_EXTENSIONS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.m4a', '.wav', '.mp3']);
const EXTRACT_SHARE = 0.04;

export function resolveVoiceCleanHome(env = process.env) {
  const override = typeof env.ROUGH_CUT_VOICE_CLEAN_HOME === 'string' ? env.ROUGH_CUT_VOICE_CLEAN_HOME.trim() : '';
  return override || join(homedir(), '.local', 'share', 'rough-cut', 'voice-clean');
}

export function voiceCleanEnvPaths(home) {
  const modelDir = join(home, 'model');
  return {
    pythonPath: join(home, 'venv', 'bin', 'python'),
    modelDir,
    configPath: join(modelDir, VOICE_CLEAN_RECIPE),
    weightsPath: join(modelDir, 'model.safetensors'),
  };
}

/** The cached clean-voice file for a recording: a sibling, never the recording itself. */
export function cleanedVoicePathFor(sourcePath, outputDir = null) {
  const name = basename(sourcePath, extname(sourcePath));
  return join(outputDir ?? dirname(sourcePath), `${name}${VOICE_CLEAN_SUFFIX}`);
}

export function isVoiceCleanSourcePath(sourcePath) {
  return typeof sourcePath === 'string'
    && isAbsolute(sourcePath)
    && SOURCE_EXTENSIONS.has(extname(sourcePath).toLowerCase())
    && !sourcePath.endsWith(VOICE_CLEAN_SUFFIX);
}

/**
 * First audio stream -> mono 48 kHz 16-bit WAV, every decoded sample kept in
 * order (no timestamp correction here: the model should hear natural audio).
 * Placing it on the video's clock is the time map's job (see below).
 */
export function buildVoiceCleanExtractArgs(sourcePath, wavPath) {
  return [
    '-hide_banner',
    '-nostdin',
    '-loglevel', 'error',
    '-y',
    '-i', sourcePath,
    '-map', '0:a:0',
    '-vn',
    '-ac', '1',
    '-ar', String(VOICE_CLEAN_SAMPLE_RATE),
    '-c:a', 'pcm_s16le',
    wavPath,
  ];
}

/** ffprobe: every decoded audio frame's timestamp and sample count. */
export function buildVoiceCleanFrameProbeArgs(sourcePath) {
  return [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=sample_rate,time_base:frame=pts,nb_samples',
    '-of', 'json',
    sourcePath,
  ];
}

const TIME_MAP_MEDIAN_FRAMES = 49;
// How far the cleaned file may sit from the timestamps before it steps.
export const VOICE_CLEAN_STEP_SECONDS = 0.012;

function runningMedian(values, window) {
  const half = Math.floor(window / 2);
  const out = new Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    const slice = values.slice(Math.max(0, i - half), Math.min(values.length, i + half + 1)).sort((a, b) => a - b);
    out[i] = slice[Math.floor(slice.length / 2)];
  }
  return out;
}

/**
 * Where the decoded sound belongs on the <video>'s clock.
 *
 * Measured in Chromium 2026-10-31 on an 18-min recording: after a seek the
 * <video> starts its sound at the TIMESTAMP of the seek point, then plays the
 * decoded samples continuously (speed exactly 1). This recorder's timestamps
 * drift from the sample count (~100 ppm plus small steps; 112 ms by the end)
 * and jitter (packets of 992..1056 ticks for 1024 samples). So the cleaned file
 * keeps decoded samples continuous and only steps its offset when the
 * median-smoothed timestamps move more than VOICE_CLEAN_STEP_SECONDS away (the
 * worker crossfades each step over 5 ms). Returns, in output-rate samples,
 * `segments` = [[startOnClock, offset]] meaning clock[k] = decoded[k - offset].
 */
export function buildVoiceCleanTimeMap(probe, outputRate = VOICE_CLEAN_SAMPLE_RATE) {
  const stream = probe?.streams?.[0] ?? {};
  const [num, den] = String(stream.time_base ?? '').split('/').map(Number);
  const sourceRate = Number(stream.sample_rate);
  const frames = Array.isArray(probe?.frames) ? probe.frames : [];
  if (!(num > 0) || !(den > 0) || !(sourceRate > 0) || frames.length === 0) return null;
  const scale = outputRate / sourceRate;
  const src = [];
  const offsets = [];
  let decoded = 0;
  for (const frame of frames) {
    const pts = Number(frame?.pts);
    const samples = Number(frame?.nb_samples);
    if (!Number.isFinite(pts) || !(samples > 0)) continue;
    src.push(decoded);
    offsets.push((pts * num / den) * sourceRate - decoded);
    decoded += samples;
  }
  if (src.length === 0) return null;
  const median = runningMedian(offsets, TIME_MAP_MEDIAN_FRAMES);
  const step = VOICE_CLEAN_STEP_SECONDS * sourceRate;
  let current = median[0];
  const segments = [[0, Math.round(current * scale)]];
  for (let i = 1; i < median.length; i += 1) {
    if (Math.abs(median[i] - current) <= step) continue;
    current = median[i];
    const at = Math.max(segments.at(-1)[0] + 1, Math.round((src[i] + current) * scale));
    segments.push([at, Math.round(current * scale)]);
  }
  return {
    sampleRate: outputRate,
    segments,
    end: Math.max(1, Math.round((decoded + current) * scale)),
  };
}

export function buildVoiceCleanWorkerArgs({ workerPath, modelDir, configPath, inputPath, outputPath, timeMapPath = null }) {
  return [
    workerPath,
    '--model-dir', modelDir,
    '--config', configPath,
    '--input', inputPath,
    '--output', outputPath,
    // Both chunk flags matter: one 20 s pass already fills a 12 GB card.
    '--chunk-seconds', '5',
    '--hop-portion', '0.5',
    ...(timeMapPath ? ['--time-map', timeMapPath] : []),
  ];
}

export function parseVoiceCleanWorkerLine(line) {
  let message;
  try {
    message = JSON.parse(String(line));
  } catch {
    return null;
  }
  if (!message || typeof message !== 'object') return null;
  if (message.event === 'progress') {
    const progress = Number(message.progress);
    return Number.isFinite(progress) ? { event: 'progress', progress: Math.max(0, Math.min(1, progress)) } : null;
  }
  if (message.event === 'done') return { event: 'done' };
  if (message.event === 'error') {
    return { event: 'error', code: String(message.code ?? 'failed'), message: String(message.message ?? 'Clean voice failed') };
  }
  return null;
}

export async function probeVoiceCleanAvailability({
  home = resolveVoiceCleanHome(),
  workerPath = DEFAULT_WORKER_PATH,
  canAccess = defaultCanAccess,
  hasNvidiaGpu = defaultHasNvidiaGpu,
} = {}) {
  const paths = voiceCleanEnvPaths(home);
  const required = [
    [paths.pythonPath, constants.X_OK],
    [paths.weightsPath, constants.R_OK],
    [paths.configPath, constants.R_OK],
    [join(paths.modelDir, 'models', 'generator_SEMamba_time_d4.py'), constants.R_OK],
    [workerPath, constants.R_OK],
  ];
  for (const [path, mode] of required) {
    if (!(await canAccess(path, mode))) return { available: false, reason: 'needs-setup' };
  }
  if (!(await hasNvidiaGpu())) return { available: false, reason: 'needs-nvidia-gpu' };
  return { available: true, reason: null };
}

/** Channel count of a RIFF/WAVE header, or null when it is not a usable WAV. */
export function wavChannelCount(header) {
  if (!Buffer.isBuffer(header) || header.length < 12) return null;
  if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') return null;
  let offset = 12;
  while (offset + 8 <= header.length) {
    const id = header.toString('ascii', offset, offset + 4);
    const size = header.readUInt32LE(offset + 4);
    if (id === 'fmt ' && offset + 12 <= header.length) return header.readUInt16LE(offset + 10);
    offset += 8 + size + (size % 2);
  }
  return null;
}

async function readHeader(path, bytes = 512) {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * Cache is usable when it is a 2-channel WAV (original + cleaned voice) that is
 * not older than the recording.
 */
export async function isVoiceCleanCacheFresh(sourcePath, cleanedPath, statFile = stat, readWavHeader = readHeader) {
  try {
    const [source, cleaned] = await Promise.all([statFile(sourcePath), statFile(cleanedPath)]);
    if (!cleaned.isFile() || cleaned.size <= 44 || cleaned.mtimeMs < source.mtimeMs) return false;
    return wavChannelCount(await readWavHeader(cleanedPath)) === 2;
  } catch {
    return false;
  }
}

export function createVoiceCleanService({
  home = resolveVoiceCleanHome(),
  ffmpegPath = 'ffmpeg',
  ffprobePath = 'ffprobe',
  workerPath = DEFAULT_WORKER_PATH,
  spawnProcess = spawn,
  statFile = stat,
  readWavHeader = readHeader,
  probeAvailability = (options) => probeVoiceCleanAvailability(options),
  lowerPriority = defaultLowerPriority,
  tempRoot = tmpdir(),
  // Test hook, e.g. ['--passthrough'] to check timing without the GPU model.
  extraWorkerArgs = [],
} = {}) {
  const paths = voiceCleanEnvPaths(home);
  /** cleanedPath -> { promise, controller, phase, progress, sourcePath } */
  const jobs = new Map();
  let queue = Promise.resolve();
  let availableResult = null;

  async function availability() {
    // Only a positive answer is cached, so finishing setup needs no app restart.
    if (availableResult) return availableResult;
    const result = await probeAvailability({ home, workerPath });
    if (result.available) availableResult = result;
    return result;
  }

  async function status({ sourcePath, outputDir = null }) {
    const { available, reason } = await availability();
    const cleanedPath = cleanedVoicePathFor(sourcePath, outputDir);
    const job = jobs.get(cleanedPath);
    if (job) {
      return { available, reason, state: 'running', phase: job.phase, progress: job.progress, cleanedPath: null };
    }
    const ready = await isVoiceCleanCacheFresh(sourcePath, cleanedPath, statFile, readWavHeader);
    return {
      available,
      reason,
      state: ready ? 'ready' : 'none',
      phase: ready ? 'ready' : null,
      progress: ready ? 1 : 0,
      cleanedPath: ready ? cleanedPath : null,
    };
  }

  function clean({ sourcePath, outputDir = null, onProgress = () => undefined }) {
    if (!isVoiceCleanSourcePath(sourcePath)) {
      return Promise.reject(codedError('invalid-source', 'Clean voice needs a recording file'));
    }
    const cleanedPath = cleanedVoicePathFor(sourcePath, outputDir);
    const existing = jobs.get(cleanedPath);
    if (existing) return existing.promise;

    const controller = new AbortController();
    const job = { controller, phase: 'queued', progress: 0, sourcePath, promise: null };
    const report = (phase, progress) => {
      job.phase = phase;
      job.progress = Math.max(0, Math.min(1, progress));
      onProgress({ sourcePath, phase, progress: job.progress });
    };
    report('queued', 0);

    // One job at a time: the GPU and memory are shared with the rest of the app.
    const run = async () => {
      throwIfAborted(controller.signal);
      const { available, reason } = await availability();
      if (!available) {
        throw codedError(reason, reason === 'needs-nvidia-gpu'
          ? 'Clean voice needs an NVIDIA graphics card'
          : 'Clean voice is not set up on this computer');
      }
      if (await isVoiceCleanCacheFresh(sourcePath, cleanedPath, statFile, readWavHeader)) {
        report('ready', 1);
        return { cleanedPath, reused: true };
      }
      const workDir = await mkdtemp(join(tempRoot, 'rough-cut-voice-clean-'));
      const wavPath = join(workDir, 'voice.wav');
      const partialPath = `${cleanedPath.slice(0, -'.wav'.length)}.part-${randomUUID()}.wav`;
      try {
        report('extracting', 0.01);
        await runChild({
          spawnProcess,
          lowerPriority,
          command: ffmpegPath,
          args: buildVoiceCleanExtractArgs(sourcePath, wavPath),
          signal: controller.signal,
          label: 'Reading the recording sound',
        });
        const probeOutput = await runChild({
          spawnProcess,
          lowerPriority,
          command: ffprobePath,
          args: buildVoiceCleanFrameProbeArgs(sourcePath),
          signal: controller.signal,
          label: 'Reading the sound timing',
          collectStdout: true,
        });
        let timeMap = null;
        try {
          timeMap = buildVoiceCleanTimeMap(JSON.parse(probeOutput));
        } catch {
          timeMap = null;
        }
        if (!timeMap) throw codedError('failed', 'Could not read the timing of the recording sound');
        const timeMapPath = join(workDir, 'time-map.json');
        await writeFile(timeMapPath, JSON.stringify(timeMap));
        report('cleaning', EXTRACT_SHARE);
        let workerError = null;
        let workerDone = false;
        await runChild({
          spawnProcess,
          lowerPriority,
          command: paths.pythonPath,
          args: buildVoiceCleanWorkerArgs({
            workerPath,
            modelDir: paths.modelDir,
            configPath: paths.configPath,
            inputPath: wavPath,
            outputPath: partialPath,
            timeMapPath,
          }).concat(extraWorkerArgs),
          env: { ...process.env, HF_HUB_OFFLINE: '1', PYTHONUNBUFFERED: '1' },
          signal: controller.signal,
          label: 'Cleaning the voice',
          onLine: (line) => {
            const message = parseVoiceCleanWorkerLine(line);
            if (!message) return;
            if (message.event === 'progress') report('cleaning', EXTRACT_SHARE + message.progress * (0.99 - EXTRACT_SHARE));
            else if (message.event === 'done') workerDone = true;
            else if (message.event === 'error') workerError = message;
          },
        }).catch((error) => {
          if (workerError) throw codedError(workerError.code === 'no-gpu' ? 'needs-nvidia-gpu' : 'failed', workerError.message);
          throw error;
        });
        throwIfAborted(controller.signal);
        if (workerError) throw codedError('failed', workerError.message);
        if (!workerDone) throw codedError('failed', 'Clean voice stopped before it finished');
        const written = await statFile(partialPath);
        if (!written.isFile() || written.size <= 44 || wavChannelCount(await readWavHeader(partialPath)) !== 2) {
          throw codedError('failed', 'Clean voice wrote no usable sound');
        }
        await rename(partialPath, cleanedPath);
        report('ready', 1);
        return { cleanedPath, reused: false };
      } finally {
        await rm(partialPath, { force: true }).catch(() => undefined);
        await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
      }
    };

    const promise = queue.then(run, run).finally(() => {
      if (jobs.get(cleanedPath) === job) jobs.delete(cleanedPath);
    });
    job.promise = promise;
    queue = promise.catch(() => undefined);
    jobs.set(cleanedPath, job);
    return promise;
  }

  function cancel({ sourcePath, outputDir = null }) {
    const job = jobs.get(cleanedVoicePathFor(sourcePath, outputDir));
    if (!job) return false;
    job.controller.abort();
    return true;
  }

  function cancelAll() {
    for (const job of jobs.values()) job.controller.abort();
  }

  return { availability, status, clean, cancel, cancelAll, paths };
}

function runChild({ spawnProcess, lowerPriority, command, args, env, signal, label, onLine, collectStdout = false }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const child = spawnProcess(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: env ?? process.env });
    lowerPriority(child.pid);
    let stderr = '';
    let settled = false;
    let killTimer = null;
    const abort = () => {
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 3_000);
      killTimer.unref?.();
    };
    signal?.addEventListener('abort', abort, { once: true });
    const lines = onLine ? createInterface({ input: child.stdout }) : null;
    lines?.on('line', onLine);
    const stdoutChunks = [];
    if (collectStdout) child.stdout?.on('data', (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    else if (!lines) child.stdout?.resume();
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-4_000);
    });
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener('abort', abort);
      lines?.close();
      if (error) reject(error);
      else resolve(collectStdout ? Buffer.concat(stdoutChunks).toString('utf8') : undefined);
    };
    child.once('error', (error) => finish(signal?.aborted ? abortError() : error));
    child.once('close', (code, sig) => {
      if (signal?.aborted) finish(abortError());
      else if (code === 0) finish(null);
      else finish(codedError('failed', `${label} failed (${code ?? sig})${stderr.trim() ? `: ${stderr.trim().split('\n').slice(-3).join(' ')}` : ''}`));
    });
  });
}

function defaultLowerPriority(pid) {
  if (!pid) return;
  try {
    setPriority(pid, VOICE_CLEAN_NICE);
  } catch {
    // Priority is a courtesy; the job still runs at normal priority.
  }
}

async function defaultCanAccess(path, mode) {
  try {
    await access(path, mode);
    return true;
  } catch {
    return false;
  }
}

function defaultHasNvidiaGpu() {
  return new Promise((resolve) => {
    let output = '';
    let child;
    try {
      child = spawn('nvidia-smi', ['-L'], { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => child.kill('SIGKILL'), 5_000);
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    child.once('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 && /\bGPU \d+:/.test(output));
    });
  });
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function abortError() {
  return codedError('cancelled', 'Clean voice was cancelled');
}

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  if (code === 'cancelled') error.name = 'AbortError';
  return error;
}
