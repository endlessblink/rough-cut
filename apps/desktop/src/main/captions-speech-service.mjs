// Speech -> caption words, in the language that is actually spoken.
//
// The recording's built-in transcript is made with a Hebrew-only model, which turns English
// speech into nonsense. This reads the audio again with a model that fits the spoken language:
// the Hebrew model for Hebrew, a multilingual model (English and others) for everything else.
// Everything runs on this computer (GPU if it works, CPU otherwise); nothing is sent anywhere.

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HELPER_PATH = join(dirname(fileURLToPath(import.meta.url)), 'captions-speech.py');
const MULTILINGUAL_REPO = 'models--mobiuslabsgmbh--faster-whisper-large-v3-turbo';

/** The multilingual model folder: set explicitly, or the one already in the Hugging Face cache. */
export function resolveMultilingualModel(env = process.env) {
  const explicit = env.ROUGH_CUT_MULTILINGUAL_MODEL_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  const hub = env.HF_HOME ? join(env.HF_HOME, 'hub') : join(homedir(), '.cache', 'huggingface', 'hub');
  const snapshots = join(hub, MULTILINGUAL_REPO, 'snapshots');
  try {
    const [first] = readdirSync(snapshots).sort();
    return first ? join(snapshots, first) : null;
  } catch {
    return null;
  }
}

/** Neighbouring clips that continue the same stretch of the recording are read as one piece. */
export function groupContiguousSections(sections) {
  const sorted = [...sections].filter((s) => s.sourceOut > s.sourceIn).sort((a, b) => a.sourceIn - b.sourceIn);
  const groups = [];
  for (const section of sorted) {
    const last = groups[groups.length - 1];
    if (last && section.sourceIn <= last.sourceOut) last.sourceOut = Math.max(last.sourceOut, section.sourceOut);
    else groups.push({ sourceIn: section.sourceIn, sourceOut: section.sourceOut });
  }
  return groups;
}

/** Words from a helper answer, placed back on the recording's own frames. */
export function wordsToSourceFrames(words, { sourceIn, fps }) {
  return (Array.isArray(words) ? words : [])
    .filter((item) => item && typeof item.word === 'string' && item.word.trim() && Number.isFinite(item.start) && Number.isFinite(item.end))
    .map((item) => ({
      word: item.word.trim(),
      startFrame: sourceIn + Math.round(item.start * fps),
      endFrame: Math.max(sourceIn + Math.round(item.start * fps) + 1, sourceIn + Math.round(item.end * fps)),
    }));
}

function runProcess(command, args, { env, signal }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const abort = () => child.kill('SIGTERM');
    if (signal?.aborted) abort();
    else signal?.addEventListener?.('abort', abort, { once: true });
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      signal?.removeEventListener?.('abort', abort);
      if (signal?.aborted) {
        const error = new Error('Cancelled.');
        error.code = 'CAPTIONS_CANCELLED';
        reject(error);
      } else resolve({ code, stdout, stderr });
    });
  });
}

async function extractAudio({ ffmpeg, sourcePath, startSec, durationSec, outPath, env, signal }) {
  const result = await runProcess(ffmpeg, ['-y', '-loglevel', 'error', '-ss', String(startSec), '-t', String(durationSec), '-i', sourcePath, '-vn', '-ac', '1', '-ar', '16000', outPath], { env, signal });
  if (result.code !== 0) throw new Error(`Could not read the recording's sound: ${result.stderr.trim().slice(0, 200)}`);
}

async function runHelper({ python, args, env, signal }) {
  const result = await runProcess(python, [HELPER_PATH, ...args], { env, signal });
  const line = result.stdout.trim().split('\n').filter(Boolean).pop();
  if (result.code !== 0 || !line) {
    throw new Error(`Speech recognition failed: ${result.stderr.trim().split('\n').pop()?.slice(0, 240) || `exit code ${result.code}`}`);
  }
  return JSON.parse(line);
}

/**
 * @param {{ sourcePath: string, sections: {sourceIn:number, sourceOut:number}[], fps: number, language?: string }} input
 *   language: 'auto' | 'en' | 'he' | any whisper language code
 * @returns {Promise<{ language: string, words: {word:string,startFrame:number,endFrame:number}[] }>}
 */
export async function transcribeSpeechForCaptions({ sourcePath, sections, fps, language = 'auto', env = process.env, signal = null, onProgress = () => {} }) {
  const python = env.ROUGH_CUT_FASTER_WHISPER_PYTHON;
  if (!python || !existsSync(python)) {
    const error = new Error('Speech recognition is not set up on this computer.');
    error.code = 'CAPTIONS_NO_SPEECH';
    throw error;
  }
  const multilingual = resolveMultilingualModel(env);
  const hebrewModel = env.ROUGH_CUT_FASTER_WHISPER_MODEL_PATH && existsSync(env.ROUGH_CUT_FASTER_WHISPER_MODEL_PATH) ? env.ROUGH_CUT_FASTER_WHISPER_MODEL_PATH : null;
  if (!multilingual && !hebrewModel) {
    const error = new Error('No speech model was found on this computer.');
    error.code = 'CAPTIONS_NO_SPEECH';
    throw error;
  }
  const groups = groupContiguousSections(sections);
  if (groups.length === 0) return { language: language === 'auto' ? 'en' : language, words: [] };
  const ffmpeg = env.ROUGH_CUT_FFMPEG_COMMAND || 'ffmpeg';
  const libraryPath = env.ROUGH_CUT_FASTER_WHISPER_LIBRARY_PATH;
  const helperEnv = libraryPath ? { ...env, LD_LIBRARY_PATH: [libraryPath, env.LD_LIBRARY_PATH].filter(Boolean).join(':') } : env;
  const device = env.ROUGH_CUT_FASTER_WHISPER_DEVICE || 'cuda';
  const computeType = env.ROUGH_CUT_FASTER_WHISPER_COMPUTE_TYPE || 'int8_float16';
  const workDir = await mkdtemp(join(tmpdir(), 'rough-cut-speech-'));
  try {
    let spoken = language;
    if (spoken === 'auto') {
      // A short listen to the first stretch decides which model reads the rest.
      const probe = join(workDir, 'probe.wav');
      const first = groups[0];
      await extractAudio({ ffmpeg, sourcePath, startSec: first.sourceIn / fps, durationSec: Math.min(40, (first.sourceOut - first.sourceIn) / fps), outPath: probe, env: helperEnv, signal });
      const detected = await runHelper({ python, args: ['--model', multilingual ?? hebrewModel, '--audio', probe, '--device', device, '--compute-type', computeType, '--detect-only'], env: helperEnv, signal });
      spoken = detected.language || 'en';
    }
    const model = spoken === 'he' && hebrewModel ? hebrewModel : (multilingual ?? hebrewModel);
    const words = [];
    let doneSec = 0;
    const totalSec = groups.reduce((sum, g) => sum + (g.sourceOut - g.sourceIn) / fps, 0);
    for (const [index, group] of groups.entries()) {
      const audio = join(workDir, `part-${index}.wav`);
      const durationSec = (group.sourceOut - group.sourceIn) / fps;
      await extractAudio({ ffmpeg, sourcePath, startSec: group.sourceIn / fps, durationSec, outPath: audio, env: helperEnv, signal });
      const heard = await runHelper({ python, args: ['--model', model, '--audio', audio, '--language', spoken, '--device', device, '--compute-type', computeType], env: helperEnv, signal });
      words.push(...wordsToSourceFrames(heard.words, { sourceIn: group.sourceIn, fps }));
      doneSec += durationSec;
      onProgress({ done: Math.round(doneSec), total: Math.round(totalSec) });
    }
    return { language: spoken, words };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
