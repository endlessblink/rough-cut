import { spawn } from 'node:child_process';

export async function assertReadableMp4(filePath) {
  const result = await run('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=codec_name,width,height,duration,nb_frames',
    '-of',
    'json',
    filePath,
  ]);

  if (result.code !== 0) {
    throw new Error(`Recording did not finalize as a readable MP4: ${result.stderr.trim()}`);
  }

  const parsed = JSON.parse(result.stdout);
  if (!Array.isArray(parsed.streams) || parsed.streams.length === 0) {
    throw new Error('Recording did not contain a video stream.');
  }
}

// Deep integrity probe: -count_frames forces ffprobe to walk every packet so
// nb_read_frames reflects what actually decodes. The container-advertised
// nb_frames can lie when the source MKV was killed mid-write — that's the
// exact failure mode TASK-067 catches.
export async function probeMp4Integrity(filePath, { runner = run } = {}) {
  const result = await runner('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-count_frames',
    '-count_packets',
    '-show_entries', 'stream=codec_name,width,height,duration,nb_frames,nb_read_frames,nb_read_packets',
    '-of', 'json',
    filePath,
  ]);
  if (result.code !== 0) {
    throw new Error(`ffprobe failed for ${filePath}: ${result.stderr.trim()}`);
  }
  const parsed = JSON.parse(result.stdout);
  const stream = Array.isArray(parsed.streams) ? parsed.streams[0] : null;
  if (!stream) throw new Error(`No video stream in ${filePath}`);
  const toFiniteNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  return {
    codec: typeof stream.codec_name === 'string' ? stream.codec_name : null,
    width: toFiniteNumber(stream.width),
    height: toFiniteNumber(stream.height),
    durationSeconds: toFiniteNumber(stream.duration),
    advertisedFrames: toFiniteNumber(stream.nb_frames),
    decodedFrames: toFiniteNumber(stream.nb_read_frames),
    decodedPackets: toFiniteNumber(stream.nb_read_packets),
  };
}

export async function probeVideoTiming(filePath, { fps = 30, runner = run } = {}) {
  const result = await runner('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-count_frames',
    '-show_entries', 'stream=start_time,duration,nb_frames,nb_read_frames,avg_frame_rate,r_frame_rate',
    '-show_entries', 'format=start_time,duration',
    '-of', 'json',
    filePath,
  ]);
  if (result.code !== 0) {
    throw new Error(`ffprobe failed for ${filePath}: ${result.stderr.trim()}`);
  }
  const parsed = JSON.parse(result.stdout);
  const stream = Array.isArray(parsed.streams) ? parsed.streams[0] : null;
  if (!stream) throw new Error(`No video stream in ${filePath}`);
  const startTimeSeconds = firstFiniteNumber(stream.start_time, parsed.format?.start_time);
  const durationSeconds = firstFiniteNumber(stream.duration, parsed.format?.duration);
  const decodedFrames = firstFiniteNumber(stream.nb_read_frames, stream.nb_frames);
  const frameRate = firstFiniteNumber(parseRate(stream.avg_frame_rate), parseRate(stream.r_frame_rate), fps);
  const durationFrames = Number.isFinite(decodedFrames)
    ? Math.max(1, Math.round(decodedFrames))
    : Math.max(1, Math.round((durationSeconds ?? 0) * (Number.isFinite(fps) && fps > 0 ? fps : frameRate)));
  return {
    startTimeSeconds,
    durationSeconds,
    durationFrames,
    frameRate,
  };
}

export async function probeVideoStreamsTiming(filePath, { fps = 30, runner = run } = {}) {
  const result = await runner('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v',
    '-count_frames',
    '-show_entries', 'stream=index,start_time,duration,nb_frames,nb_read_frames,avg_frame_rate,r_frame_rate,time_base',
    '-show_entries', 'format=start_time,duration',
    '-of', 'json',
    filePath,
  ]);
  if (result.code !== 0) {
    throw new Error(`ffprobe failed for ${filePath}: ${result.stderr.trim()}`);
  }
  const parsed = JSON.parse(result.stdout);
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  if (streams.length === 0) throw new Error(`No video streams in ${filePath}`);
  return streams.map((stream, ordinal) => {
    const startTimeSeconds = firstFiniteNumber(stream.start_time, parsed.format?.start_time, 0);
    const durationSeconds = firstFiniteNumber(stream.duration, parsed.format?.duration);
    const decodedFrames = firstFiniteNumber(stream.nb_read_frames, stream.nb_frames);
    const frameRate = firstFiniteNumber(parseRate(stream.avg_frame_rate), parseRate(stream.r_frame_rate), fps);
    const safeFps = Number.isFinite(fps) && fps > 0 ? fps : frameRate;
    const durationFrames = Number.isFinite(durationSeconds) && durationSeconds > 0
      ? Math.max(1, Math.round(durationSeconds * safeFps))
      : Math.max(1, Math.round(decodedFrames ?? 1));
    return {
      index: Number.isFinite(Number(stream.index)) ? Number(stream.index) : ordinal,
      startTimeSeconds,
      durationSeconds,
      durationFrames,
      decodedFrames,
      frameRate,
      timeBase: typeof stream.time_base === 'string' ? stream.time_base : null,
    };
  });
}

// Lightweight per-video-stream start offsets (no -count_frames, so it does
// not decode the file). Used by the recording session to translate the
// banner wall-clock anchor onto the muxed file's own timeline.
export async function probeVideoStreamStartOffsets(filePath, { runner = run } = {}) {
  const result = await runner('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v',
    '-show_entries', 'stream=index,start_time',
    '-of', 'json',
    filePath,
  ]);
  if (result.code !== 0) {
    throw new Error(`ffprobe failed for ${filePath}: ${result.stderr.trim()}`);
  }
  const parsed = JSON.parse(result.stdout);
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  return streams.map((stream, ordinal) => {
    const startTime = Number(stream.start_time);
    return {
      index: Number.isFinite(Number(stream.index)) ? Number(stream.index) : ordinal,
      startTimeSeconds: Number.isFinite(startTime) ? startTime : null,
    };
  });
}

export function computeSyncedRecordingTiming({ screen, camera = null, cameraSourceInFrames = 0, fps = 30 }) {
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 30;
  const screenFrames = Math.max(1, Math.round(screen?.durationFrames ?? 1));
  if (!camera) {
    return {
      screenFrames,
      cameraFrames: null,
      cameraSourceInFrames: 0,
      syncedDurationFrames: screenFrames,
      syncWarning: null,
    };
  }
  const cameraFrames = Math.max(1, Math.round(camera.durationFrames ?? 1));
  const cameraOffset = Math.max(0, Math.round(cameraSourceInFrames || 0));
  const screenSeconds = finitePositiveNumber(screen.durationSeconds);
  const cameraSeconds = finitePositiveNumber(camera.durationSeconds);
  const cameraOffsetSeconds = cameraOffset / safeFps;
  const durationFromSeconds = screenSeconds !== null && cameraSeconds !== null
    ? Math.max(1, Math.round(Math.min(screenSeconds, Math.max(0, cameraSeconds - cameraOffsetSeconds)) * safeFps))
    : Math.max(1, Math.min(screenFrames, Math.max(0, cameraFrames - cameraOffset)));
  const syncedDurationFrames = Math.max(
    1,
    Math.min(screenFrames, durationFromSeconds),
  );
  const lostFrames = screenFrames - syncedDurationFrames;
  const warningThresholdFrames = Math.max(15, Math.round(safeFps * 0.5));
  return {
    screenFrames,
    cameraFrames,
    cameraSourceInFrames: cameraOffset,
    screenDurationSeconds: screenSeconds,
    cameraDurationSeconds: cameraSeconds,
    syncedDurationFrames,
    syncWarning: lostFrames >= warningThresholdFrames
      ? `Camera overlap is ${lostFrames} frames shorter than screen capture; timeline was trimmed to the synced overlap.`
      : null,
  };
}

function finitePositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseRate(value) {
  if (typeof value !== 'string') return null;
  const [num, den] = value.split('/').map(Number);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return num / den;
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// P-AI-C/TASK-168 — universal probe for the Library "Import file" flow.
// Returns the metadata the import factory needs: durationSeconds (always when
// available), width/height/fps (video only). Throws if ffprobe fails.
// `runner` is injectable for tests.
export async function probeImportedMedia(filePath, { kind = 'video', runner = run } = {}) {
  if (kind === 'image') {
    const result = await runner('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'json',
      filePath,
    ]);
    if (result.code !== 0) throw new Error(`ffprobe failed for ${filePath}: ${result.stderr.trim()}`);
    const parsed = JSON.parse(result.stdout);
    const stream = Array.isArray(parsed.streams) ? parsed.streams[0] : null;
    return {
      kind: 'image',
      durationSeconds: null,
      width: stream ? toFiniteOrNull(stream.width) : null,
      height: stream ? toFiniteOrNull(stream.height) : null,
      fps: null,
    };
  }

  if (kind === 'audio') {
    const result = await runner('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=duration',
      '-show_entries', 'format=duration',
      '-of', 'json',
      filePath,
    ]);
    if (result.code !== 0) throw new Error(`ffprobe failed for ${filePath}: ${result.stderr.trim()}`);
    const parsed = JSON.parse(result.stdout);
    const stream = Array.isArray(parsed.streams) ? parsed.streams[0] : null;
    const durationSeconds = firstFiniteNumber(stream?.duration, parsed.format?.duration);
    return {
      kind: 'audio',
      durationSeconds,
      width: null,
      height: null,
      fps: null,
    };
  }

  // video — reuse the same query shape probeVideoTiming uses, but include
  // width/height so the import factory can preserve aspect ratio.
  const result = await runner('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,duration,nb_frames,avg_frame_rate,r_frame_rate',
    '-show_entries', 'format=duration',
    '-of', 'json',
    filePath,
  ]);
  if (result.code !== 0) throw new Error(`ffprobe failed for ${filePath}: ${result.stderr.trim()}`);
  const parsed = JSON.parse(result.stdout);
  const stream = Array.isArray(parsed.streams) ? parsed.streams[0] : null;
  if (!stream) throw new Error(`No video stream in ${filePath}`);
  const fps = firstFiniteNumber(parseRate(stream.avg_frame_rate), parseRate(stream.r_frame_rate));
  const durationSeconds = firstFiniteNumber(stream.duration, parsed.format?.duration);

  // P-AI-C/TASK-177 — second probe call for a:0 so the import factory knows
  // whether to emit a sibling audio asset. ffprobe exits 0 with an empty
  // `streams` array when no audio stream exists; that's the only signal
  // we need. A failed audio probe is not fatal — the import still proceeds
  // as a silent video, matching the pre-TASK-177 behavior.
  let hasAudio = false;
  let audioDurationSeconds = null;
  let audioSampleRate = null;
  try {
    const audioResult = await runner('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_name,duration,sample_rate',
      '-show_entries', 'format=duration',
      '-of', 'json',
      filePath,
    ]);
    if (audioResult.code === 0) {
      const audioParsed = JSON.parse(audioResult.stdout);
      const audioStream = Array.isArray(audioParsed.streams) ? audioParsed.streams[0] : null;
      if (audioStream && typeof audioStream.codec_name === 'string' && audioStream.codec_name) {
        hasAudio = true;
        audioDurationSeconds = firstFiniteNumber(audioStream.duration, audioParsed.format?.duration);
        audioSampleRate = toFiniteOrNull(audioStream.sample_rate);
      }
    }
  } catch {
    // Treat probe errors as "no audio detected" — import still proceeds.
  }

  return {
    kind: 'video',
    width: toFiniteOrNull(stream.width),
    height: toFiniteOrNull(stream.height),
    fps,
    durationSeconds,
    durationFrames: Number.isFinite(durationSeconds) && Number.isFinite(fps) && fps > 0
      ? Math.max(1, Math.round(durationSeconds * fps))
      : null,
    hasAudio,
    audioDurationSeconds,
    audioSampleRate,
  };
}

function toFiniteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
