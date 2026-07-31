import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { basename, join } from 'node:path';
import { constants as osConstants, setPriority, tmpdir } from 'node:os';
import { runTranscriptionProcess } from './whisper-cpp-provider.mjs';

const MIN_SILENCE_MS = 500;
const INTERPOLATED_WORD_CONFIDENCE = 0.6;
const DETECTED_PAUSE_MIN_SECONDS = 0.18;

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
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === 'data') return chunkSize > 0 && offset + 8 < buffer.length;
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

function detectAudioPauses(ffmpegPath, audioPath, { signal } = {}) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, [
      '-hide_banner',
      '-nostats',
      '-i',
      audioPath,
      '-af',
      `silencedetect=noise=-42dB:d=${DETECTED_PAUSE_MIN_SECONDS}`,
      '-f',
      'null',
      '-',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const abort = () => child.kill('SIGTERM');
    signal?.addEventListener('abort', abort, { once: true });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      if (code !== 0) {
        reject(new Error(`ffmpeg silence detection exited ${code}`));
        return;
      }
      const starts = [
        ...stderr.matchAll(/silence_start:\s*([0-9.]+)/gu),
      ].map((match) => Number(match[1]));
      const ends = [
        ...stderr.matchAll(/silence_end:\s*([0-9.]+)/gu),
      ].map((match) => Number(match[1]));
      resolve(
        starts.flatMap((start, index) => {
          const end = ends[index];
          return Number.isFinite(start) && Number.isFinite(end) && end > start
            ? [{ startSeconds: start, endSeconds: end }]
            : [];
        }),
      );
    });
  });
}

export function applyDetectedPauses(
  transcript,
  pauses,
  { startMs, fps },
) {
  const pauseRanges = pauses.map((pause) => ({
    startFrame: frameAt(startMs + pause.startSeconds * 1_000, fps),
    endFrame: frameAt(startMs + pause.endSeconds * 1_000, fps),
  }));
  const splitSegments = transcript.nonSpeech.flatMap((segment) => {
    if (segment.kind !== 'unrecognized') return [segment];
    const boundaries = [
      segment.startFrame,
      segment.endFrame,
      ...pauseRanges.flatMap((pause) =>
        pause.startFrame < segment.endFrame &&
        pause.endFrame > segment.startFrame
          ? [
              Math.max(segment.startFrame, pause.startFrame),
              Math.min(segment.endFrame, pause.endFrame),
            ]
          : [],
      ),
    ]
      .sort((left, right) => left - right)
      .filter((frame, index, values) => index === 0 || frame !== values[index - 1]);
    return boundaries.slice(0, -1).map((startFrame, index) => {
      const endFrame = boundaries[index + 1];
      const midpoint = startFrame + (endFrame - startFrame) / 2;
      const isPause = pauseRanges.some(
        (pause) => midpoint >= pause.startFrame && midpoint < pause.endFrame,
      );
      return {
        kind: isPause ? 'silence' : 'unrecognized',
        startFrame,
        endFrame,
      };
    });
  });
  const nonSpeech = [...splitSegments];
  for (const pause of pauseRanges) {
    if (pause.endFrame <= pause.startFrame) continue;
    const alreadyCovered = nonSpeech.some(
      (segment) =>
        segment.kind === 'silence' &&
        segment.startFrame <= pause.startFrame &&
        segment.endFrame >= pause.endFrame,
    );
    if (!alreadyCovered) nonSpeech.push({ kind: 'silence', ...pause });
  }
  nonSpeech.sort(
    (left, right) =>
      left.startFrame - right.startFrame || left.endFrame - right.endFrame,
  );
  return { ...transcript, nonSpeech };
}

function wordsFromSegment(segment, startMs, fps) {
  const text = String(segment?.text ?? '').trim();
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*[\p{P}\p{S}]*/gu) ?? [];
  const segmentStartMs = startMs + Number(segment?.start) * 1_000;
  const segmentEndMs = startMs + Number(segment?.end) * 1_000;
  if (
    words.length === 0 ||
    !Number.isFinite(segmentStartMs) ||
    !Number.isFinite(segmentEndMs) ||
    segmentEndMs < segmentStartMs
  ) {
    return [];
  }
  const weights = words.map((word) => Math.max(1, [...word].length));
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  let consumedWeight = 0;
  return words.map((word, index) => {
    const wordStartMs =
      segmentStartMs + ((segmentEndMs - segmentStartMs) * consumedWeight) / totalWeight;
    consumedWeight += weights[index];
    const wordEndMs =
      segmentStartMs + ((segmentEndMs - segmentStartMs) * consumedWeight) / totalWeight;
    return {
      word,
      startFrame: frameAt(wordStartMs, fps),
      endFrame: frameAt(wordEndMs, fps),
      confidence: INTERPOLATED_WORD_CONFIDENCE,
    };
  });
}

function exactWords(payload, startMs, fps) {
  const topLevelWords = Array.isArray(payload?.words) ? payload.words : [];
  const candidates =
    topLevelWords.length > 0
      ? topLevelWords
      : Array.isArray(payload?.segments)
        ? payload.segments.flatMap((segment) =>
            Array.isArray(segment?.words) ? segment.words : [],
          )
        : [];
  return candidates.flatMap((item) => {
    const word = String(item?.word ?? item?.text ?? '').trim();
    const wordStartMs = startMs + Number(item?.start) * 1_000;
    const wordEndMs = startMs + Number(item?.end) * 1_000;
    if (
      !word ||
      !Number.isFinite(wordStartMs) ||
      !Number.isFinite(wordEndMs) ||
      wordEndMs < wordStartMs
    ) {
      return [];
    }
    const suppliedConfidence = Number(item?.confidence ?? item?.probability);
    return [
      {
        word,
        startFrame: frameAt(wordStartMs, fps),
        endFrame: frameAt(wordEndMs, fps),
        confidence: Number.isFinite(suppliedConfidence)
          ? Math.max(0, Math.min(1, suppliedConfidence))
          : 0.85,
      },
    ];
  });
}

function comparableWord(value) {
  return String(value)
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '');
}

function mergeTimedWords(interpolatedWords, preciseWords) {
  if (preciseWords.length === 0) return interpolatedWords;
  if (interpolatedWords.length === 0) return preciseWords;
  const merged = [...interpolatedWords];
  const replacedIndexes = new Set();
  for (const precise of preciseWords) {
    const comparable = comparableWord(precise.word);
    const preciseCenter = (precise.startFrame + precise.endFrame) / 2;
    let matchIndex = -1;
    let matchDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < merged.length; index += 1) {
      if (
        replacedIndexes.has(index)
        || comparableWord(merged[index].word) !== comparable
      ) {
        continue;
      }
      const candidateCenter =
        (merged[index].startFrame + merged[index].endFrame) / 2;
      const distance = Math.abs(candidateCenter - preciseCenter);
      if (distance < matchDistance) {
        matchIndex = index;
        matchDistance = distance;
      }
    }
    if (matchIndex >= 0) {
      merged[matchIndex] = precise;
      replacedIndexes.add(matchIndex);
    } else {
      merged.push(precise);
    }
  }
  return merged.sort(
    (left, right) =>
      left.startFrame - right.startFrame || left.endFrame - right.endFrame,
  );
}

export function parseSonaTranscript(payload, { startMs, endMs, fps }) {
  const segments = Array.isArray(payload?.segments) ? payload.segments : [];
  const paragraphs = [];
  const preciseWords = exactWords(payload, startMs, fps);
  const words = [];
  const nonSpeech = [];
  let cursorMs = startMs;
  for (const segment of segments) {
    const text = String(segment?.text ?? '').trim();
    const segmentStartMs = startMs + Number(segment?.start) * 1_000;
    const segmentEndMs = startMs + Number(segment?.end) * 1_000;
    if (
      !text ||
      !Number.isFinite(segmentStartMs) ||
      !Number.isFinite(segmentEndMs) ||
      segmentEndMs < segmentStartMs
    ) {
      continue;
    }
    if (segmentStartMs - cursorMs >= MIN_SILENCE_MS) {
      nonSpeech.push({
        kind: 'unrecognized',
        startFrame: frameAt(cursorMs, fps),
        endFrame: frameAt(segmentStartMs, fps),
      });
    }
    paragraphs.push({
      text,
      startFrame: frameAt(segmentStartMs, fps),
      endFrame: frameAt(segmentEndMs, fps),
    });
    words.push(...wordsFromSegment(segment, startMs, fps));
    cursorMs = Math.max(cursorMs, segmentEndMs);
  }
  if (endMs - cursorMs >= MIN_SILENCE_MS) {
    nonSpeech.push({
      kind: 'unrecognized',
      startFrame: frameAt(cursorMs, fps),
      endFrame: frameAt(endMs, fps),
    });
  }
  const mergedWords = mergeTimedWords(words, preciseWords);
  if (paragraphs.length > 0 && mergedWords.length === 0) {
    throw new Error('Sona output did not include usable timed speech segments');
  }
  return {
    words: mergedWords,
    paragraphs,
    nonSpeech,
  };
}

async function availablePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (port) resolve(port);
        else reject(new Error('Could not allocate a local Sona port'));
      });
    });
  });
}

async function waitUntilReady(baseUrl, child, fetchImpl, signal) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (signal?.aborted) throw abortError();
    if (child.exitCode !== null) throw new Error('Sona exited before its model was ready');
    try {
      const response = await fetchImpl(`${baseUrl}/ready`, { signal });
      if (response.ok) return;
    } catch (error) {
      if (signal?.aborted) throw abortError();
      // The local server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Sona model did not become ready within 30 seconds');
}

function createSonaServer({ command, modelPath, spawnProcess, fetchImpl }) {
  let child = null;
  let baseUrlPromise = null;
  return {
    async baseUrl(signal) {
      if (!baseUrlPromise) {
        baseUrlPromise = (async () => {
          const port = await availablePort();
          const baseUrl = `http://127.0.0.1:${port}`;
          child = spawnProcess(
            command,
            ['serve', modelPath, '--host', '127.0.0.1', '--port', String(port)],
            { stdio: ['ignore', 'ignore', 'pipe'] },
          );
          if (Number.isInteger(child.pid)) {
            try {
              setPriority(child.pid, osConstants.priority.PRIORITY_BELOW_NORMAL);
            } catch {
              // Capture-health suspension remains the hard safety boundary on
              // platforms that do not permit process-priority changes.
            }
          }
          let stderr = '';
          child.stderr.setEncoding('utf8');
          child.stderr.on('data', (chunk) => {
            stderr = `${stderr}${chunk}`.slice(-4_000);
          });
          child.once('error', (error) => {
            stderr = `${stderr}\n${error.message}`;
          });
          child.once('close', () => {
            child = null;
            baseUrlPromise = null;
          });
          try {
            await waitUntilReady(baseUrl, child, fetchImpl, signal);
          } catch (error) {
            child?.kill('SIGKILL');
            baseUrlPromise = null;
            if (error?.name === 'AbortError') throw error;
            throw new Error(`${error.message}${stderr.trim() ? `: ${stderr.trim()}` : ''}`);
          }
          return baseUrl;
        })();
      }
      return await baseUrlPromise;
    },
    dispose() {
      child?.kill('SIGTERM');
      child = null;
      baseUrlPromise = null;
    },
  };
}

export async function createSonaProvider({
  command = 'sona',
  modelPath,
  ffmpegPath = 'ffmpeg',
  language = 'auto',
  runProcess = runTranscriptionProcess,
  spawnProcess = spawn,
  fetchImpl = fetch,
}) {
  if (!modelPath) throw new Error('Sona model path is not configured');
  await access(modelPath, constants.R_OK);
  await runProcess(ffmpegPath, ['-version']);
  await runProcess(command, ['--version']);
  const server = createSonaServer({ command, modelPath, spawnProcess, fetchImpl });

  return {
    descriptor: { id: 'sona-local', model: basename(modelPath) },
    timingPrecision: 'segment-interpolated',
    // The recording bridge only dispatches chunks while capture health is safe
    // and aborts active work as soon as the capture guard trips.
    incrementalDuringCapture: true,
    async transcribeChunk({ sourcePath, fps, startMs, endMs, signal }) {
      if (signal?.aborted) throw abortError();
      const workDir = await mkdtemp(join(tmpdir(), 'rough-cut-sona-'));
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
        const audio = await readFile(audioPath);
        if (!wavContainsSamples(audio)) return silentChunk(startMs, endMs, fps);
        const form = new FormData();
        form.append('file', new Blob([audio]), 'chunk.wav');
        form.append('response_format', 'verbose_json');
        form.append('word_timestamps', 'true');
        if (language === 'auto') form.append('detect_language', 'true');
        else form.append('language', language);
        const response = await fetchImpl(
          `${await server.baseUrl(signal)}/v1/audio/transcriptions`,
          { method: 'POST', body: form, signal },
        );
        if (!response.ok) {
          const details = String(await response.text()).trim();
          throw new Error(
            `Sona transcription failed with HTTP ${response.status}${details ? `: ${details}` : ''}`,
          );
        }
        const transcript = parseSonaTranscript(await response.json(), {
          startMs,
          endMs,
          fps,
        });
        try {
          const pauses = await detectAudioPauses(ffmpegPath, audioPath, { signal });
          return applyDetectedPauses(transcript, pauses, { startMs, fps });
        } catch (error) {
          if (signal?.aborted) throw error;
          return transcript;
        }
      } finally {
        await rm(workDir, { recursive: true, force: true });
      }
    },
    dispose: () => server.dispose(),
  };
}
