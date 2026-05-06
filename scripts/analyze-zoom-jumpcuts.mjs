import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { exportProjectToMp4 } from '../apps/desktop/src/main/export-service.mjs';
import { getPrimaryRecording, openProjectFile } from '../apps/desktop/src/main/project-files.mjs';
import { getZoomTransformAtFrame } from '../packages/timeline-engine/dist/index.js';

const projectPath = process.argv[2];
if (!projectPath) {
  throw new Error('Usage: node scripts/analyze-zoom-jumpcuts.mjs /path/to/project.roughcut [output-dir]');
}

const root = resolve(process.argv[3] ?? join('artifacts', 'zoom-jumpcuts', basename(projectPath, '.roughcut')));
const styledExportPath = join(root, `${basename(projectPath, '.roughcut')}-styled.mp4`);
const reportPath = join(root, 'zoom-jumpcut-report.json');

await mkdir(root, { recursive: true });

const { document } = await openProjectFile(resolve(projectPath));
const recording = getPrimaryRecording(document);
if (!recording) throw new Error('Project has no primary recording.');

const markers = Array.isArray(recording.zoomMarkers) ? recording.zoomMarkers : [];
if (markers.length === 0) throw new Error('Project has no zoom markers to analyze.');

await exportProjectToMp4({ project: document, outputPath: styledExportPath, mode: 'styled' });

const fps = Number.isFinite(recording.fps) && recording.fps > 0 ? recording.fps : 30;
const cursorLookup = buildCursorPositionLookup(recording.cursorEvents, recording.width, recording.height);
const zoomOptions = recording.presentation?.zoom?.followCursor !== false
  ? {
      followCursor: true,
      followAnimation: recording.presentation?.zoom?.followAnimation ?? 'smooth',
      followPadding: Number.isFinite(recording.presentation?.zoom?.followPadding)
        ? recording.presentation.zoom.followPadding
        : 0.22,
      fps,
      getCursorPosition: cursorLookup,
    }
  : undefined;

const sections = [];
for (const [index, marker] of markers.entries()) {
  const startFrame = Math.max(0, Math.round(marker.startFrame) - 8);
  const endFrame = Math.min(recording.duration - 1, Math.round(marker.endFrame) + 8);
  const sectionDir = join(root, `zoom-${String(index + 1).padStart(2, '0')}-frames-${startFrame}-${endFrame}`);
  await mkdir(sectionDir, { recursive: true });

  run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    styledExportPath,
    '-vf',
    `select='between(n,${startFrame},${endFrame})'`,
    '-vsync',
    '0',
    '-start_number',
    String(startFrame),
    join(sectionDir, 'frame-%06d.png'),
  ]);

  const frameDiffs = compareAdjacentFrames(sectionDir, startFrame, endFrame);
  const transformSamples = sampleTransforms(startFrame, endFrame, markers, zoomOptions, recording.width, recording.height);
  const transformJumps = findTransformJumps(transformSamples);
  const visualJumps = findVisualJumps(frameDiffs);

  sections.push({
    marker,
    startFrame,
    endFrame,
    startSeconds: startFrame / fps,
    endSeconds: endFrame / fps,
    framesDir: sectionDir,
    extractedFrames: endFrame - startFrame + 1,
    visualJumpThreshold: visualJumps.threshold,
    visualJumps: visualJumps.items,
    transformJumps,
    maxFrameDiff: maxBy(frameDiffs, 'normalizedRmse'),
    maxTransformDelta: maxBy(transformSamples.slice(1), 'cropDeltaPixels'),
  });
}

const report = {
  ok: true,
  projectPath: resolve(projectPath),
  styledExportPath,
  reportPath,
  fps,
  source: {
    width: recording.width,
    height: recording.height,
    durationFrames: recording.duration,
  },
  sections,
};

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.info(JSON.stringify(report, null, 2));

function sampleTransforms(startFrame, endFrame, markers, options, sourceWidth, sourceHeight) {
  const samples = [];
  let previous = null;
  for (let frame = startFrame; frame <= endFrame; frame += 1) {
    const transform = getZoomTransformAtFrame(frame, markers, options);
    const crop = transformToCropWindow(transform, sourceWidth, sourceHeight);
    const cropDeltaPixels = previous
      ? Math.hypot(crop.x - previous.crop.x, crop.y - previous.crop.y, crop.w - previous.crop.w, crop.h - previous.crop.h)
      : 0;
    samples.push({ frame, scale: transform.scale, crop, cropDeltaPixels });
    previous = samples[samples.length - 1];
  }
  return samples;
}

function findTransformJumps(samples) {
  const deltas = samples.slice(1).map((sample) => sample.cropDeltaPixels).filter((value) => value > 0);
  const median = percentile(deltas, 0.5);
  const threshold = Math.max(150, median * 5);
  return samples
    .filter((sample) => sample.cropDeltaPixels > threshold)
    .map((sample) => ({ frame: sample.frame, cropDeltaPixels: sample.cropDeltaPixels, threshold }));
}

function compareAdjacentFrames(sectionDir, startFrame, endFrame) {
  const diffs = [];
  for (let frame = startFrame + 1; frame <= endFrame; frame += 1) {
    const previousPath = join(sectionDir, `frame-${String(frame - 1).padStart(6, '0')}.png`);
    const currentPath = join(sectionDir, `frame-${String(frame).padStart(6, '0')}.png`);
    const result = spawnSync('magick', ['compare', '-metric', 'RMSE', previousPath, currentPath, 'null:'], {
      encoding: 'utf8',
    });
    const metric = parseRmse(result.stderr || result.stdout || '');
    if (metric) diffs.push({ frame, ...metric });
  }
  return diffs;
}

function findVisualJumps(diffs) {
  const values = diffs.map((item) => item.normalizedRmse);
  const median = percentile(values, 0.5);
  const p95 = percentile(values, 0.95);
  const threshold = Math.max(0.08, median * 6, p95 * 1.25);
  return {
    threshold,
    items: diffs.filter((item) => item.normalizedRmse > threshold),
  };
}

function buildCursorPositionLookup(cursorEvents, sourceWidth, sourceHeight) {
  if (!Array.isArray(cursorEvents) || cursorEvents.length === 0) return () => null;
  const sorted = cursorEvents
    .filter((event) => event && (event.type === undefined || event.type === 'move') && Number.isFinite(event.frame))
    .slice()
    .sort((a, b) => a.frame - b.frame);
  if (sorted.length === 0) return () => null;
  return (frame) => {
    if (frame <= sorted[0].frame) return normalizeCursor(sorted[0], sourceWidth, sourceHeight);
    const last = sorted[sorted.length - 1];
    if (frame >= last.frame) return normalizeCursor(last, sourceWidth, sourceHeight);
    let lo = 0;
    let hi = sorted.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid].frame <= frame) lo = mid;
      else hi = mid;
    }
    const a = sorted[lo];
    const b = sorted[hi];
    const span = b.frame - a.frame;
    if (span <= 0) return normalizeCursor(a, sourceWidth, sourceHeight);
    const t = (frame - a.frame) / span;
    return {
      x: (a.x + (b.x - a.x) * t) / sourceWidth,
      y: (a.y + (b.y - a.y) * t) / sourceHeight,
    };
  };
}

function normalizeCursor(event, sourceWidth, sourceHeight) {
  return { x: event.x / sourceWidth, y: event.y / sourceHeight };
}

function transformToCropWindow(transform, sourceWidth, sourceHeight) {
  const scale = Number.isFinite(transform.scale) && transform.scale > 0 ? transform.scale : 1;
  const offsetX = transform.translateX * sourceWidth;
  const offsetY = transform.translateY * sourceHeight;
  const w = sourceWidth / scale;
  const h = sourceHeight / scale;
  const rawX = sourceWidth / 2 - sourceWidth / (2 * scale) - offsetX / scale;
  const rawY = sourceHeight / 2 - sourceHeight / (2 * scale) - offsetY / scale;
  return {
    x: clamp(rawX, 0, sourceWidth - w),
    y: clamp(rawY, 0, sourceHeight - h),
    w,
    h,
  };
}

function parseRmse(output) {
  const match = output.match(/([0-9.]+)\s*\(([0-9.]+)\)/);
  if (!match) return null;
  return { rmse: Number(match[1]), normalizedRmse: Number(match[2]) };
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index];
}

function maxBy(items, key) {
  return items.reduce((max, item) => (!max || item[key] > max[key] ? item : max), null);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}
