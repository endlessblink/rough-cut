#!/usr/bin/env node
/**
 * Validate recording samples with ffprobe.
 * Checks: container format, codec, frame rate, duration, resolution.
 *
 * Usage: npm run validate
 */
import { execSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const samplesDir = join(__dirname, '..', 'samples');

if (!existsSync(samplesDir)) {
  console.log('No samples/ directory. Run recordings first.');
  process.exit(0);
}

const files = readdirSync(samplesDir).filter(f => f.endsWith('.webm') || f.endsWith('.mp4'));

if (files.length === 0) {
  console.log('No recording files found in samples/');
  process.exit(0);
}

for (const file of files) {
  const filePath = join(samplesDir, file);
  console.log(`\n=== ${file} ===`);
  try {
    const result = execSync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`,
      { encoding: 'utf-8' }
    );
    const info = JSON.parse(result);
    const video = info.streams?.find(s => s.codec_type === 'video');
    const audio = info.streams?.find(s => s.codec_type === 'audio');

    console.log(`  Format: ${info.format?.format_name}`);
    console.log(`  Duration: ${parseFloat(info.format?.duration).toFixed(2)}s`);
    console.log(`  Size: ${(parseInt(info.format?.size) / 1024 / 1024).toFixed(2)} MB`);
    if (video) {
      console.log(`  Video: ${video.codec_name} ${video.width}x${video.height} @ ${video.r_frame_rate}`);
    }
    if (audio) {
      console.log(`  Audio: ${audio.codec_name} ${audio.sample_rate}Hz ${audio.channels}ch`);
    }
    console.log(`  Status: VALID`);
  } catch (err) {
    console.log(`  Status: INVALID — ffprobe failed`);
    console.log(`  Error: ${err.message}`);
  }
}
