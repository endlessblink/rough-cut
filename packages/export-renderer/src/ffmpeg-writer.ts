import { spawn, type ChildProcess } from 'node:child_process';
import type { ExportSettings } from '@rough-cut/project-model';

export interface FFmpegWriter {
  /** Write a raw RGBA frame buffer */
  writeFrame(buffer: Buffer): Promise<void>;
  /** Finalize and close — waits for FFmpeg to finish */
  finalize(): Promise<void>;
  /** Abort the export */
  abort(): void;
}

/**
 * Map bitrate / quality hint to CRF value.
 * Higher bitrate → lower CRF (better quality).
 * Rough mapping:
 *   >= 10 Mbps → CRF 18 (near-lossless)
 *   >= 5  Mbps → CRF 22
 *   >= 2  Mbps → CRF 26
 *   < 2   Mbps → CRF 30
 */
function bitrateToCrf(bitrate: number): number {
  if (bitrate >= 10_000_000) return 18;
  if (bitrate >= 5_000_000) return 22;
  if (bitrate >= 2_000_000) return 26;
  return 30;
}

/**
 * Spawn an FFmpeg process that accepts raw RGBA frames on stdin
 * and writes an MP4 file.
 */
export function createFFmpegWriter(
  outputPath: string,
  settings: ExportSettings,
): FFmpegWriter {
  const { width, height } = settings.resolution;
  const fps = settings.frameRate;
  const crf = bitrateToCrf(settings.bitrate);

  const args = [
    '-y',
    // Input: raw RGBA from stdin
    '-f', 'rawvideo',
    '-pix_fmt', 'rgba',
    '-s', `${width}x${height}`,
    '-r', String(fps),
    '-i', 'pipe:0',
    // Output: H.264 MP4
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', String(crf),
    outputPath,
  ];

  const process: ChildProcess = spawn('ffmpeg', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let aborted = false;
  let ffmpegError: string = '';

  // Collect stderr for error reporting
  process.stderr?.on('data', (chunk: Buffer) => {
    ffmpegError += chunk.toString();
  });

  const stdin = process.stdin;
  if (stdin === null) {
    throw new Error('FFmpeg process has no stdin');
  }

  // Track whether stdin was already closed
  let stdinClosed = false;

  const writeFrame = (buffer: Buffer): Promise<void> => {
    if (aborted) {
      return Promise.reject(new Error('Export was aborted'));
    }
    return new Promise((resolve, reject) => {
      const ok = stdin.write(buffer, (err) => {
        if (err !== null && err !== undefined) {
          reject(err);
        } else {
          resolve();
        }
      });

      if (!ok) {
        // Back-pressure: wait for drain before resolving
        stdin.once('drain', resolve);
      }
    });
  };

  const finalize = (): Promise<void> => {
    if (aborted) {
      return Promise.reject(new Error('Export was aborted'));
    }
    return new Promise((resolve, reject) => {
      if (!stdinClosed) {
        stdinClosed = true;
        stdin.end();
      }

      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `FFmpeg exited with code ${code}. Stderr:\n${ffmpegError.slice(-2000)}`,
            ),
          );
        }
      });

      process.on('error', (err) => {
        reject(new Error(`FFmpeg process error: ${err.message}`));
      });
    });
  };

  const abort = (): void => {
    aborted = true;
    if (!stdinClosed) {
      stdinClosed = true;
      try {
        stdin.destroy();
      } catch {
        // ignore
      }
    }
    process.kill('SIGKILL');
  };

  return { writeFrame, finalize, abort };
}
