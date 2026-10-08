import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';

export async function writeRecordingDiagnosticsReport({
  recording,
  projectPath = null,
  remuxLogs = [],
  probeMedia = probeMediaFile,
  now = () => new Date(),
}) {
  const outputPath = recording?.outputPath;
  if (typeof outputPath !== 'string' || outputPath.length === 0) {
    throw new Error('Recording outputPath is required for diagnostics.');
  }

  const probe = await probeMedia(outputPath);
  const report = buildRecordingDiagnosticsReport({
    recording,
    projectPath,
    remuxLogs,
    probe,
    generatedAt: now().toISOString(),
  });
  const reportPath = diagnosticsPathForRecording(outputPath);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.info(`[recording-diagnostics] wrote ${reportPath}`);
  return { path: reportPath, report };
}

export function buildRecordingDiagnosticsReport({
  recording,
  projectPath = null,
  remuxLogs = [],
  probe = null,
  generatedAt = new Date().toISOString(),
}) {
  const cursorEvents = Array.isArray(recording?.cursorEvents) ? recording.cursorEvents : [];
  const moveEvents = cursorEvents.filter((event) => event?.type === 'move');
  const buttonEvents = cursorEvents.filter((event) => event?.type === 'down' || event?.type === 'up');
  const expectedDurationMs = Math.max(0, Date.parse(recording?.stoppedAt ?? '') - Date.parse(recording?.startedAt ?? '')) || null;
  const mediaDurationMs = Number.isFinite(probe?.format?.durationSeconds)
    ? Math.round(probe.format.durationSeconds * 1000)
    : null;
  const video = probe?.video ?? null;
  const audio = probe?.audio ?? null;
  const warnings = summarizeWarnings(remuxLogs);
  const audioTail = summarizeAudioTail({ recording, video, audio, remuxLogs });

  return {
    version: 1,
    generatedAt,
    status: warnings.hasDropOrQueueWarnings || audioTail.short ? 'warning' : 'ok',
    recording: {
      startedAt: recording?.startedAt ?? null,
      stoppedAt: recording?.stoppedAt ?? null,
      rawPath: recording?.rawPath ?? null,
      outputPath: recording?.outputPath ?? null,
      projectPath,
      width: recording?.width ?? null,
      height: recording?.height ?? null,
      fps: recording?.fps ?? null,
      expectedDurationMs,
      mediaDurationMs,
      durationDeltaMs: expectedDurationMs !== null && mediaDurationMs !== null ? mediaDurationMs - expectedDurationMs : null,
    },
    media: {
      hasVideo: Boolean(video),
      video,
      hasAudio: Boolean(audio),
      audio,
      expectedAudio: Boolean(recording?.audio),
      audioTail,
    },
    cursor: {
      totalEvents: cursorEvents.length,
      moveEvents: moveEvents.length,
      buttonEvents: buttonEvents.length,
      firstFrame: firstFinite(cursorEvents.map((event) => event?.frame)),
      lastFrame: lastFinite(cursorEvents.map((event) => event?.frame)),
      telemetryPath: recording?.cursorTelemetryPath ?? null,
    },
    remux: warnings,
  };
}

export function diagnosticsPathForRecording(outputPath) {
  const name = basename(outputPath).replace(/\.mp4$/i, '');
  return join(dirname(outputPath), `${name}.diagnostics.json`);
}

export async function probeMediaFile(filePath) {
  const result = await run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration:stream=index,codec_type,codec_name,width,height,avg_frame_rate,duration,nb_frames',
    '-of',
    'json',
    filePath,
  ]);
  if (result.code !== 0) {
    throw new Error(`ffprobe failed for diagnostics: ${result.stderr.trim()}`);
  }
  const parsed = JSON.parse(result.stdout);
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const videoStream = streams.find((stream) => stream.codec_type === 'video') ?? null;
  const audioStream = streams.find((stream) => stream.codec_type === 'audio') ?? null;
  return {
    format: {
      durationSeconds: parseFiniteNumber(parsed.format?.duration),
    },
    video: videoStream ? normalizeStream(videoStream) : null,
    audio: audioStream ? normalizeStream(audioStream) : null,
  };
}

// Sound that ends this much before the picture is reported (one AAC frame is ~21 ms).
const AUDIO_TAIL_SHORT_MS = 150;

/**
 * Does the sound reach the end of the picture? Records the tail grace the recorder used and the
 * remux's own trim lines, so a short ending can be traced to its origin from this report alone.
 */
export function summarizeAudioTail({ recording, video, audio, remuxLogs = [] }) {
  const videoSec = Number(video?.durationSeconds);
  const audioSec = Number(audio?.durationSeconds);
  const missingMs = audio && Number.isFinite(videoSec) && Number.isFinite(audioSec)
    ? Math.round((videoSec - audioSec) * 1000)
    : null;
  const trimLines = remuxLogs.map(String).filter((line) => line.includes('audio-tail'));
  return {
    missingMs,
    short: missingMs !== null && missingMs > AUDIO_TAIL_SHORT_MS,
    thresholdMs: AUDIO_TAIL_SHORT_MS,
    tailTrimSec: Array.isArray(recording?.rawTailTrimSec) ? recording.rawTailTrimSec : [],
    remuxTrimLines: trimLines,
  };
}

function summarizeWarnings(lines) {
  const warningLines = [];
  let frameDrops = 0;
  let queueWarnings = 0;
  for (const line of lines) {
    const text = String(line);
    if (/warning|drop=|Thread message queue blocking/i.test(text)) warningLines.push(text);
    const dropMatch = /drop=(\d+)/.exec(text);
    if (dropMatch) frameDrops = Math.max(frameDrops, Number(dropMatch[1]));
    if (text.includes('Thread message queue blocking')) queueWarnings += 1;
  }
  return {
    logLines: lines.length,
    warningLines,
    frameDrops,
    queueWarnings,
    hasDropOrQueueWarnings: frameDrops > 0 || queueWarnings > 0,
  };
}

function normalizeStream(stream) {
  return {
    codec: stream.codec_name ?? null,
    width: parseFiniteNumber(stream.width),
    height: parseFiniteNumber(stream.height),
    avgFrameRate: stream.avg_frame_rate ?? null,
    durationSeconds: parseFiniteNumber(stream.duration),
    frames: parseFiniteNumber(stream.nb_frames),
  };
}

function firstFinite(values) {
  return values.find((value) => Number.isFinite(value)) ?? null;
}

function lastFinite(values) {
  return values.findLast((value) => Number.isFinite(value)) ?? null;
}

function parseFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
