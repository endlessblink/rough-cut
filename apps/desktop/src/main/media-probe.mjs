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
