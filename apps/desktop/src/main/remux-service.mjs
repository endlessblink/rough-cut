import { spawn } from 'node:child_process';
import { probeMp4Integrity } from './media-probe.mjs';

const COHERENCE_TOLERANCE_FRAMES = 5;

export async function validateRemuxedMp4(filePath, options = {}) {
  const { probe = probeMp4Integrity, toleranceFrames = COHERENCE_TOLERANCE_FRAMES } = options;
  const integrity = await probe(filePath);
  const { advertisedFrames, decodedFrames } = integrity;

  // No frames decoded at all means the container advertised a stream that
  // doesn't actually exist on disk — refuse to call this a successful remux.
  if (decodedFrames !== null && decodedFrames < 1) {
    throw new RemuxIncompleteError(
      `Recording incomplete: ${filePath} has no decodable frames (header advertised ${advertisedFrames ?? 'unknown'}).`,
      { filePath, integrity },
    );
  }

  // Some frames decoded but the header overpromised — partial recovery.
  if (
    advertisedFrames !== null &&
    decodedFrames !== null &&
    advertisedFrames - decodedFrames > toleranceFrames
  ) {
    return {
      coherent: false,
      integrity,
      warning: `Partial recording: ${decodedFrames}/${advertisedFrames} frames decoded (${advertisedFrames - decodedFrames} missing).`,
    };
  }

  return { coherent: true, integrity, warning: null };
}

export class RemuxIncompleteError extends Error {
  constructor(message, { filePath, integrity } = {}) {
    super(message);
    this.name = 'RemuxIncompleteError';
    this.code = 'REMUX_INCOMPLETE';
    this.filePath = filePath ?? null;
    this.integrity = integrity ?? null;
  }
}

export async function remuxMkvToMp4({
  rawPath,
  outputPath,
  onLog = () => undefined,
  validate = validateRemuxedMp4,
  runner = run,
}) {
  const args = ['-y', '-i', rawPath, '-map', '0', '-c', 'copy', '-movflags', '+faststart', outputPath];
  onLog('[remux] Starting: ffmpeg ' + args.join(' '));
  const result = await runner('ffmpeg', args, onLog);
  if (result.code !== 0) {
    throw new Error(`Failed to remux MKV to MP4: ${result.stderr.trim()}`);
  }
  const validation = await validate(outputPath);
  if (validation.warning) onLog(`[remux] WARN ${validation.warning}`);
  return { outputPath, integrity: validation.integrity, warning: validation.warning };
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
