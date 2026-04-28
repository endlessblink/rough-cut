import { spawn } from 'node:child_process';

export async function remuxMkvToMp4({ rawPath, outputPath, onLog = () => undefined }) {
  const args = ['-y', '-i', rawPath, '-map', '0', '-c', 'copy', '-movflags', '+faststart', outputPath];
  onLog('[remux] Starting: ffmpeg ' + args.join(' '));
  const result = await run('ffmpeg', args, onLog);
  if (result.code !== 0) {
    throw new Error(`Failed to remux MKV to MP4: ${result.stderr.trim()}`);
  }
  return outputPath;
}

function run(command, args, onLog) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      logLines(onLog, '[remux:stdout]', text);
    });
    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      logLines(onLog, '[remux:stderr]', text);
    });
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function logLines(onLog, prefix, text) {
  for (const line of text.split(/[\r\n]+/)) {
    const trimmed = line.trim();
    if (trimmed) onLog(`${prefix} ${trimmed}`);
  }
}
