#!/usr/bin/env node
/**
 * Generate test videos with frame numbers burned into each frame.
 * Requires FFmpeg installed on the system.
 *
 * Output:
 *   test-media/test-1080p-h264-30fps-gop2s.mp4
 *   test-media/test-4k-h264-60fps-gop2s.mp4
 *   test-media/test-1080p-vp9-30fps.webm
 */
import { execSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'test-media');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const DURATION = 10; // seconds

const videos = [
  {
    name: 'test-1080p-h264-30fps-gop2s.mp4',
    width: 1920, height: 1080, fps: 30, gopSeconds: 2,
    codec: 'libx264',
    extra: '-pix_fmt yuv420p',
  },
  {
    name: 'test-4k-h264-60fps-gop2s.mp4',
    width: 3840, height: 2160, fps: 60, gopSeconds: 2,
    codec: 'libx264',
    extra: '-pix_fmt yuv420p',
  },
  {
    name: 'test-1080p-vp9-30fps.webm',
    width: 1920, height: 1080, fps: 30, gopSeconds: 2,
    codec: 'libvpx-vp9',
    extra: '-b:v 2M',
  },
];

for (const v of videos) {
  const outPath = join(outDir, v.name);
  if (existsSync(outPath)) {
    console.log(`[skip] ${v.name} already exists`);
    continue;
  }

  const gopFrames = v.fps * v.gopSeconds;
  // drawtext filter burns the frame number (n) into each frame at large size
  const filter = [
    `color=c=black:s=${v.width}x${v.height}:r=${v.fps}:d=${DURATION}`,
    `drawtext=text='%{frame_num}':fontsize=200:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:start_number=0`,
  ].join(',');

  const cmd = [
    'ffmpeg', '-y',
    '-f', 'lavfi', '-i', `"${filter}"`,
    '-c:v', v.codec,
    '-g', gopFrames.toString(),
    '-keyint_min', gopFrames.toString(),
    v.extra,
    '-t', DURATION.toString(),
    `"${outPath}"`,
  ].join(' ');

  console.log(`[gen] ${v.name} ...`);
  console.log(`  ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
  console.log(`[done] ${v.name}`);
}

console.log('\nAll test media generated in:', outDir);
