import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runTranscriptionProcess } from './whisper-cpp-provider.mjs';

const MIN_GAP_MS = 120;
const VERBATIM_HOTWORDS = 'אממ אה אהה מממ כאילו בעצם אז ו ו-';

function abortError() {
  return new DOMException('Transcription cancelled', 'AbortError');
}

function frameAt(milliseconds, fps) {
  return Math.max(0, Math.round((milliseconds / 1_000) * fps));
}

function wavContainsSamples(buffer) {
  if (
    buffer.length < 12
    || buffer.toString('ascii', 0, 4) !== 'RIFF'
    || buffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    return false;
  }
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (buffer.toString('ascii', offset, offset + 4) === 'data') {
      return chunkSize > 0 && offset + 8 < buffer.length;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return false;
}

function silentChunk(startMs, endMs, fps) {
  return {
    words: [],
    paragraphs: [],
    nonSpeech: [{
      kind: 'silence',
      startFrame: frameAt(startMs, fps),
      endFrame: frameAt(endMs, fps),
    }],
  };
}

export function parseFasterWhisperTranscript(
  payload,
  { startMs, endMs, fps },
) {
  const segments = Array.isArray(payload?.segments) ? payload.segments : [];
  const words = [];
  const paragraphs = [];
  for (const segment of segments) {
    const segmentStart = Number(segment?.start);
    const segmentEnd = Number(segment?.end);
    const text = String(segment?.text ?? '').trim();
    if (
      text
      && Number.isFinite(segmentStart)
      && Number.isFinite(segmentEnd)
      && segmentEnd >= segmentStart
    ) {
      paragraphs.push({
        text,
        startFrame: frameAt(startMs + segmentStart * 1_000, fps),
        endFrame: frameAt(startMs + segmentEnd * 1_000, fps),
      });
    }
    for (const item of Array.isArray(segment?.words) ? segment.words : []) {
      const word = String(item?.word ?? '').trim();
      const wordStart = Number(item?.start);
      const wordEnd = Number(item?.end);
      if (
        !word
        || !Number.isFinite(wordStart)
        || !Number.isFinite(wordEnd)
        || wordEnd < wordStart
      ) {
        continue;
      }
      const probability = Number(item?.probability);
      words.push({
        word,
        startFrame: frameAt(startMs + wordStart * 1_000, fps),
        endFrame: frameAt(startMs + wordEnd * 1_000, fps),
        confidence: Number.isFinite(probability)
          ? Math.max(0, Math.min(1, probability))
          : 0.85,
      });
    }
  }

  words.sort(
    (left, right) =>
      left.startFrame - right.startFrame || left.endFrame - right.endFrame,
  );
  const nonSpeech = [];
  let cursorMs = startMs;
  for (const word of words) {
    const wordStartMs = (word.startFrame / fps) * 1_000;
    if (wordStartMs - cursorMs >= MIN_GAP_MS) {
      nonSpeech.push({
        kind: 'unrecognized',
        startFrame: frameAt(cursorMs, fps),
        endFrame: word.startFrame,
      });
    }
    cursorMs = Math.max(cursorMs, (word.endFrame / fps) * 1_000);
  }
  if (endMs - cursorMs >= MIN_GAP_MS) {
    nonSpeech.push({
      kind: 'unrecognized',
      startFrame: frameAt(cursorMs, fps),
      endFrame: frameAt(endMs, fps),
    });
  }
  if (paragraphs.length > 0 && words.length === 0) {
    throw new Error('faster-whisper output did not include word timestamps');
  }
  return { words, paragraphs, nonSpeech };
}

export function createFasterWhisperWorker({
  pythonPath,
  helperPath,
  modelPath,
  device = 'cuda',
  computeType = 'int8_float16',
  libraryPath = '',
  spawnProcess = spawn,
}) {
  let child = null;
  let lines = null;
  let stderr = '';
  let nextId = 1;
  const pending = new Map();

  const rejectPending = (error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };

  const stop = () => {
    lines?.close();
    lines = null;
    if (child && child.exitCode === null) child.kill('SIGTERM');
    child = null;
  };

  const ensureChild = () => {
    if (child && child.exitCode === null) return child;
    stderr = '';
    child = spawnProcess(
      pythonPath,
      [
        helperPath,
        '--model',
        modelPath,
        '--device',
        device,
        '--compute-type',
        computeType,
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          LD_LIBRARY_PATH: [libraryPath, process.env.LD_LIBRARY_PATH]
            .filter(Boolean)
            .join(':'),
        },
      },
    );
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-4_000);
    });
    lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      const request = pending.get(message?.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error));
      else request.resolve(message.result);
    });
    child.once('error', (error) => {
      rejectPending(error);
      stop();
    });
    child.once('close', (code, signal) => {
      const details = stderr.trim() ? `: ${stderr.trim()}` : '';
      rejectPending(
        new Error(
          `faster-whisper worker exited ${code ?? signal ?? 'unexpectedly'}${details}`,
        ),
      );
      child = null;
      lines = null;
    });
    return child;
  };

  return {
    transcribe(audioPath, { language = 'he', signal } = {}) {
      if (signal?.aborted) return Promise.reject(abortError());
      const activeChild = ensureChild();
      const id = nextId;
      nextId += 1;
      return new Promise((resolve, reject) => {
        const abort = () => {
          pending.delete(id);
          reject(abortError());
          stop();
        };
        signal?.addEventListener('abort', abort, { once: true });
        pending.set(id, {
          resolve: (value) => {
            signal?.removeEventListener('abort', abort);
            resolve(value);
          },
          reject: (error) => {
            signal?.removeEventListener('abort', abort);
            reject(error);
          },
        });
        activeChild.stdin.write(
          `${JSON.stringify({
            id,
            audioPath,
            language,
            hotwords: VERBATIM_HOTWORDS,
          })}\n`,
        );
      });
    },
    dispose: stop,
  };
}

export async function createFasterWhisperProvider({
  pythonPath,
  helperPath,
  modelPath,
  ffmpegPath = 'ffmpeg',
  language = 'he',
  device = 'cuda',
  computeType = 'int8_float16',
  libraryPath = '',
  runProcess = runTranscriptionProcess,
  spawnProcess = spawn,
}) {
  if (!pythonPath) throw new Error('faster-whisper Python is not configured');
  if (!helperPath) throw new Error('faster-whisper helper is not configured');
  if (!modelPath) throw new Error('faster-whisper model is not configured');
  await access(pythonPath, constants.X_OK);
  await access(helperPath, constants.R_OK);
  await access(modelPath, constants.R_OK);
  await runProcess(ffmpegPath, ['-version']);
  await runProcess(pythonPath, ['-c', 'import faster_whisper']);
  const worker = createFasterWhisperWorker({
    pythonPath,
    helperPath,
    modelPath,
    device,
    computeType,
    libraryPath,
    spawnProcess,
  });

  return {
    descriptor: {
      id: 'faster-whisper-hebrew',
      model: basename(modelPath),
    },
    timingPrecision: 'word',
    incrementalDuringCapture: false,
    async transcribeChunk({ sourcePath, fps, startMs, endMs, signal }) {
      if (signal?.aborted) throw abortError();
      const workDir = await mkdtemp(join(tmpdir(), 'rough-cut-faster-whisper-'));
      const audioPath = join(workDir, 'chunk.wav');
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
        if (!wavContainsSamples(await readFile(audioPath))) {
          return silentChunk(startMs, endMs, fps);
        }
        const payload = await worker.transcribe(audioPath, { language, signal });
        return parseFasterWhisperTranscript(payload, {
          startMs,
          endMs,
          fps,
        });
      } finally {
        await rm(workDir, { recursive: true, force: true });
      }
    },
    dispose: () => worker.dispose(),
  };
}
