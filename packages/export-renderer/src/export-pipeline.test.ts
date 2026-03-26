import { describe, it, expect, afterEach } from 'vitest';
import { runExport } from './export-pipeline.js';
import { createProject, createClip, createAsset } from '@rough-cut/project-model';
import type { ExportSettings } from '@rough-cut/project-model';
import { mkdtemp, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs) {
    await rm(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

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

const SMALL_SETTINGS: ExportSettings = {
  format: 'mp4',
  codec: 'h264',
  bitrate: 2_000_000,
  resolution: { width: 64, height: 64 },
  frameRate: 10,
};

function makeTestProject(durationFrames: number) {
  const asset = createAsset('video', '/fake/clip.mp4', { duration: durationFrames });
  const base = createProject();
  const videoTrackId = base.composition.tracks[0]!.id;

  const clip = createClip(asset.id, videoTrackId, {
    timelineIn: 0,
    timelineOut: durationFrames,
    sourceIn: 0,
    sourceOut: durationFrames,
  });

  return {
    ...base,
    assets: [asset],
    composition: {
      ...base.composition,
      duration: durationFrames,
      tracks: base.composition.tracks.map((t) =>
        t.id === videoTrackId ? { ...t, clips: [clip] } : t,
      ),
    },
  };
}

describe('runExport', () => {
  it('returns failed for empty composition', async () => {
    const project = createProject(); // duration = 0
    const result = await runExport(project, SMALL_SETTINGS, '/tmp/should-not-exist.mp4');
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Empty composition');
    expect(result.totalFrames).toBe(0);
  });

  it.skipIf(!ffmpegAvailable())(
    'exports 30-frame composition and produces a file',
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'rough-cut-pipeline-'));
      tmpDirs.push(dir);
      const outputPath = join(dir, 'output.mp4');
      const project = makeTestProject(30);

      const progressFrames: number[] = [];

      const result = await runExport(project, SMALL_SETTINGS, outputPath, {
        onProgress: (p) => progressFrames.push(p.currentFrame),
      });

      expect(result.status).toBe('complete');
      expect(result.outputPath).toBe(outputPath);
      expect(result.totalFrames).toBe(30);
      expect(result.durationMs).toBeGreaterThan(0);

      const info = await stat(outputPath);
      expect(info.size).toBeGreaterThan(0);

      // Progress should have been called for each frame in order
      expect(progressFrames).toHaveLength(30);
      expect(progressFrames[0]).toBe(1);
      expect(progressFrames[29]).toBe(30);
    },
  );

  it.skipIf(!ffmpegAvailable())('onComplete callback is called with result', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rough-cut-pipeline-'));
    tmpDirs.push(dir);
    const outputPath = join(dir, 'output.mp4');
    const project = makeTestProject(10);

    let completedResult: unknown;
    await runExport(project, SMALL_SETTINGS, outputPath, {
      onComplete: (r) => { completedResult = r; },
    });

    expect(completedResult).toBeDefined();
    expect((completedResult as { status: string }).status).toBe('complete');
  });

  it.skipIf(!ffmpegAvailable() || !ffprobeAvailable())(
    'ffprobe confirms correct resolution on output',
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'rough-cut-pipeline-'));
      tmpDirs.push(dir);
      const outputPath = join(dir, 'output.mp4');
      const project = makeTestProject(10);

      const settings: ExportSettings = {
        ...SMALL_SETTINGS,
        resolution: { width: 128, height: 72 },
      };

      const result = await runExport(project, settings, outputPath);
      expect(result.status).toBe('complete');

      const probeOutput = execSync(
        `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${outputPath}"`,
        { encoding: 'utf8' },
      ).trim();

      expect(probeOutput).toContain('128');
      expect(probeOutput).toContain('72');
    },
  );
});
