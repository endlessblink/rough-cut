import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const DEFAULT_COMMAND = 'whisper-cli';
const MIN_SILENCE_MS = 500;

function abortError() {
  return new DOMException('Transcription cancelled', 'AbortError');
}

export function runTranscriptionProcess(
  command,
  args,
  { signal, spawnProcess = spawn, killTimeoutMs = 2_000 } = {},
) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let forceKillTimer = null;
    const abort = () => {
      child.kill('SIGTERM');
      forceKillTimer = setTimeout(() => child.kill('SIGKILL'), killTimeoutMs);
    };
    signal?.addEventListener('abort', abort, { once: true });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-4_000);
    });
    child.once('error', reject);
    child.once('close', (code, terminatedBy) => {
      if (forceKillTimer) clearTimeout(forceKillTimer);
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) {
        reject(abortError());
      } else if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `${basename(command)} exited ${code ?? terminatedBy ?? 'unexpectedly'}${
              stderr.trim() ? `: ${stderr.trim()}` : ''
            }`,
          ),
        );
      }
    });
  });
}

function frameAt(milliseconds, fps) {
  return Math.max(0, Math.round((milliseconds / 1_000) * fps));
}

function offsetRange(offsets, startMs, fps) {
  const from = Number(offsets?.from);
  const to = Number(offsets?.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  return {
    startFrame: frameAt(startMs + from, fps),
    endFrame: frameAt(startMs + to, fps),
  };
}

function transcriptWords(segment, startMs, fps) {
  const words = [];
  for (const token of Array.isArray(segment?.tokens) ? segment.tokens : []) {
    const range = offsetRange(token.offsets, startMs, fps);
    if (!range) continue;
    const tokenText = String(token.text ?? '').trim();
    if (
      !tokenText ||
      /^\[_[A-Z0-9_]+_\]$/u.test(tokenText) ||
      Number(token.offsets?.to) <= Number(token.offsets?.from)
    ) {
      continue;
    }
    if (/^[\p{P}\p{S}]+$/u.test(tokenText) && words.length > 0) {
      const previous = words.at(-1);
      words[words.length - 1] = {
        ...previous,
        word: `${previous.word}${tokenText}`,
        endFrame: Math.max(previous.endFrame, range.endFrame),
        confidence: Math.min(
          previous.confidence,
          Math.max(0, Math.min(1, Number(token.p) || 0)),
        ),
      };
      continue;
    }
    const pieces = tokenText
      .split(/\s+/u)
      .filter(Boolean);
    if (pieces.length === 0) continue;
    const confidence = Math.max(0, Math.min(1, Number(token.p) || 0));
    pieces.forEach((word, index) => {
      const span = range.endFrame - range.startFrame;
      words.push({
        word,
        startFrame: range.startFrame + Math.floor((span * index) / pieces.length),
        endFrame: range.startFrame + Math.floor((span * (index + 1)) / pieces.length),
        confidence,
      });
    });
  }
  return words;
}

export function parseWhisperCppTranscript(payload, { startMs, endMs, fps }) {
  const segments = Array.isArray(payload?.transcription) ? payload.transcription : [];
  const paragraphs = [];
  const words = [];
  for (const segment of segments) {
    const range = offsetRange(segment?.offsets, startMs, fps);
    const text = String(segment?.text ?? '').trim();
    if (!range || !text) continue;
    paragraphs.push({ ...range, text });
    words.push(...transcriptWords(segment, startMs, fps));
  }

  const nonSpeech = [];
  let cursorMs = startMs;
  for (const segment of segments) {
    const from = startMs + Number(segment?.offsets?.from);
    const to = startMs + Number(segment?.offsets?.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    if (from - cursorMs >= MIN_SILENCE_MS) {
      nonSpeech.push({
        kind: 'unrecognized',
        startFrame: frameAt(cursorMs, fps),
        endFrame: frameAt(from, fps),
      });
    }
    cursorMs = Math.max(cursorMs, to);
  }
  if (endMs - cursorMs >= MIN_SILENCE_MS) {
    nonSpeech.push({
      kind: 'unrecognized',
      startFrame: frameAt(cursorMs, fps),
      endFrame: frameAt(endMs, fps),
    });
  }
  if (paragraphs.length > 0 && words.length === 0) {
    throw new Error('whisper.cpp output did not include word timing data');
  }
  return { words, paragraphs, nonSpeech };
}

export async function createWhisperCppProvider({
  command = DEFAULT_COMMAND,
  modelPath,
  ffmpegPath = 'ffmpeg',
  language = 'auto',
  runProcess = runTranscriptionProcess,
}) {
  if (!modelPath) throw new Error('Whisper model path is not configured');
  await access(modelPath, constants.R_OK);
  await runProcess(ffmpegPath, ['-version']);
  await runProcess(command, ['--version']);

  return {
    descriptor: { id: 'whisper.cpp', model: basename(modelPath) },
    async transcribeChunk({ sourcePath, fps, startMs, endMs, signal }) {
      if (signal?.aborted) throw abortError();
      const workDir = await mkdtemp(join(tmpdir(), 'rough-cut-whisper-'));
      const audioPath = join(workDir, 'chunk.wav');
      const outputPrefix = join(workDir, 'transcript');
      try {
        await runProcess(
          ffmpegPath,
          [
            '-hide_banner',
            '-loglevel',
            'error',
            '-ss',
            String(startMs / 1_000),
            '-t',
            String((endMs - startMs) / 1_000),
            '-i',
            sourcePath,
            '-vn',
            '-ac',
            '1',
            '-ar',
            '16000',
            '-c:a',
            'pcm_s16le',
            '-y',
            audioPath,
          ],
          { signal },
        );
        await runProcess(
          command,
          [
            '--model',
            modelPath,
            '--file',
            audioPath,
            '--output-file',
            outputPrefix,
            '--output-json-full',
            '--no-prints',
            '--language',
            language,
          ],
          { signal },
        );
        const payload = JSON.parse(await readFile(`${outputPrefix}.json`, 'utf8'));
        return parseWhisperCppTranscript(payload, { startMs, endMs, fps });
      } finally {
        await rm(workDir, { recursive: true, force: true });
      }
    },
  };
}
