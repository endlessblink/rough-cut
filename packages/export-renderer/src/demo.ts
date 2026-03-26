/**
 * Demo: create a test project and export to MP4.
 * Run with: pnpm -F @rough-cut/export-renderer demo
 *
 * Produces: test-output.mp4 in the package directory
 */
import { createProject, createClip, createAsset } from '@rough-cut/project-model';
import type { ExportSettings } from '@rough-cut/project-model';
import { runExport } from './export-pipeline.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  // Create a test project with 2 clips
  const asset1 = createAsset('video', '/fake/video1.mp4', { duration: 90 });
  const asset2 = createAsset('video', '/fake/video2.mp4', { duration: 60 });

  const project = createProject();
  const videoTrackId = project.composition.tracks[0]!.id;

  const clip1 = createClip(asset1.id, videoTrackId, {
    timelineIn: 0,
    timelineOut: 90,
    sourceIn: 0,
    sourceOut: 90,
  });

  const clip2 = createClip(asset2.id, videoTrackId, {
    timelineIn: 90,
    timelineOut: 150,
    sourceIn: 0,
    sourceOut: 60,
  });

  // Build the full project document with clips and assets
  const fullProject = {
    ...project,
    assets: [asset1, asset2],
    composition: {
      ...project.composition,
      duration: 150, // 5 seconds at 30fps
      tracks: project.composition.tracks.map((t) =>
        t.id === videoTrackId ? { ...t, clips: [clip1, clip2] } : t,
      ),
    },
  };

  const settings: ExportSettings = {
    format: 'mp4',
    codec: 'h264',
    bitrate: 5_000_000,
    resolution: { width: 640, height: 360 },
    frameRate: 30,
  };

  const outputPath = join(__dirname, '..', 'test-output.mp4');

  console.log(`Exporting ${fullProject.composition.duration} frames to ${outputPath}...`);

  const result = await runExport(fullProject, settings, outputPath, {
    onProgress: (p) => {
      if (p.currentFrame % 30 === 0 || p.currentFrame === p.totalFrames) {
        console.log(`  Frame ${p.currentFrame}/${p.totalFrames} (${p.percentage.toFixed(1)}%)`);
      }
    },
  });

  console.log(`\nResult: ${result.status}`);
  if (result.status === 'complete') {
    console.log(`  Output: ${result.outputPath}`);
    console.log(`  Duration: ${(result.durationMs / 1000).toFixed(2)}s`);
    console.log(`  Speed: ${(result.totalFrames / (result.durationMs / 1000)).toFixed(1)} fps`);
  } else {
    console.log(`  Error: ${result.error}`);
  }
}

main().catch(console.error);
