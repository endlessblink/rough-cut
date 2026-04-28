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
