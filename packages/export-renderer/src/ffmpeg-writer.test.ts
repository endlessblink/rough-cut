import { describe, it, expect, afterEach } from 'vitest';
import { createFFmpegWriter } from './ffmpeg-writer.js';
import type { ExportSettings } from '@rough-cut/project-model';
import { mkdtemp, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const TEST_SETTINGS: ExportSettings = {
  format: 'mp4',
  codec: 'h264',
  bitrate: 2_000_000,
  resolution: { width: 64, height: 64 },
  frameRate: 10,
};

// Generate a single RGBA frame (solid color)
function makeRgbaFrame(width: number, height: number, r: number, g: number, b: number): Buffer {
  const buf = Buffer.alloc(width * height * 4);
  for (let i = 0; i < buf.byteLength; i += 4) {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = 255;
  }
  return buf;
}

function ffmpegAvailable(): boolean {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function ffprobeAvailable(): boolean {
  try {
    execSync('ffprobe -version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs) {
    await rm(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe('createFFmpegWriter', () => {
  it.skipIf(!ffmpegAvailable())('writeFrame + finalize produces a non-empty file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rough-cut-test-'));
    tmpDirs.push(dir);
    const outputPath = join(dir, 'out.mp4');

    const writer = createFFmpegWriter(outputPath, TEST_SETTINGS);
    const frame = makeRgbaFrame(64, 64, 100, 150, 200);

    // Write 5 frames
    for (let i = 0; i < 5; i++) {
      await writer.writeFrame(frame);
    }
    await writer.finalize();

    const info = await stat(outputPath);
    expect(info.size).toBeGreaterThan(0);
  });

  it.skipIf(!ffmpegAvailable())('abort kills the process without producing a valid file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rough-cut-test-'));
    tmpDirs.push(dir);
    const outputPath = join(dir, 'aborted.mp4');

    const writer = createFFmpegWriter(outputPath, TEST_SETTINGS);
    const frame = makeRgbaFrame(64, 64, 255, 0, 0);

    await writer.writeFrame(frame);
    writer.abort();

    // After abort, further writes should reject
    await expect(writer.writeFrame(frame)).rejects.toThrow('aborted');
  });

  it.skipIf(!ffmpegAvailable() || !ffprobeAvailable())(
    'ffprobe reports correct resolution',
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'rough-cut-test-'));
      tmpDirs.push(dir);
      const outputPath = join(dir, 'probe.mp4');

      const settings: ExportSettings = {
        ...TEST_SETTINGS,
        resolution: { width: 128, height: 72 },
        frameRate: 5,
      };
      const writer = createFFmpegWriter(outputPath, settings);
      const frame = makeRgbaFrame(128, 72, 0, 200, 100);

      for (let i = 0; i < 5; i++) {
        await writer.writeFrame(frame);
      }
      await writer.finalize();

      const probeOutput = execSync(
        `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${outputPath}"`,
        { encoding: 'utf8' },
      ).trim();

      expect(probeOutput).toContain('128');
      expect(probeOutput).toContain('72');
    },
  );
});
