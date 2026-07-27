/**
 * End-to-end proof that a censor region reaches the exported video. (TASK-252)
 *
 * Unit tests prove the geometry and the draw order; only an actual export proves
 * the pixels. This renders the same project twice — once clean, once with a
 * pixelated censor over a known area — extracts a frame from each, and asserts
 * that the censored area changed while the rest of the frame did not.
 *
 * Run: node scripts/smoke-censor-export.mjs
 *
 * It also exports with a zoom marker over the censored area, because a censor that
 * only survives an unzoomed export is not the feature.
 *
 * This script is the gate for censor export. It caught the original gap: the
 * user-facing `styled` export renders through an FFmpeg `-filter_complex` chain,
 * not the canvas renderer where the censor pass first landed, so censors reached
 * the preview and not the file. Keep it passing.
 */
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { exportProjectToMp4 } from '../apps/desktop/src/main/export-service.mjs';
import { saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status}): ${result.stderr ?? ''}`);
  }
  return result;
}

function ppmPixels(path) {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-i', path, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {
    maxBuffer: 1024 * 1024 * 256,
  });
  if (result.status !== 0) throw new Error(`frame extract failed: ${result.stderr}`);
  return result.stdout;
}

const root = await mkdtemp(join(tmpdir(), 'rough-cut-censor-export-'));
await mkdir(root, { recursive: true });
const mediaPath = join(root, 'source.mp4');
const cleanPath = join(root, 'clean.mp4');
const censoredPath = join(root, 'censored.mp4');

// A finely detailed source, deliberately NOT flat colour bars: a mosaic over large
// flat areas barely changes any pixels, which would let a broken mosaic pass. Real
// screen recordings are full of text-scale detail, so the fixture should be too.
run('ffmpeg', [
  '-y', '-f', 'lavfi', '-i', 'mandelbrot=size=1280x720:rate=30',
  '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', mediaPath,
]);

const startedAt = new Date('2026-01-01T00:00:00.000Z');
const project = await saveProjectForRecording({
  startedAt: startedAt.toISOString(),
  stoppedAt: new Date(startedAt.getTime() + 2000).toISOString(),
  rawPath: mediaPath,
  outputPath: mediaPath,
  width: 1280,
  height: 720,
  fps: 30,
  cursorEvents: [{ frame: 0, timeMs: 0, x: 640, y: 360, type: 'move', button: 0 }],
});

const clean = await exportProjectToMp4({ project: project.document, outputPath: cleanPath, mode: 'styled' });

// Censor the middle of the frame for the whole take.
const CENSOR = { x: 0.3, y: 0.3, w: 0.4, h: 0.4 };
const censoredDocument = {
  ...project.document,
  assets: project.document.assets.map((asset) => (
    asset.type === 'recording' && asset.presentation
      ? {
          ...asset,
          presentation: {
            ...asset.presentation,
            censorRegions: [{
              id: 'censor-smoke',
              startFrame: 0,
              endFrame: Math.max(12, asset.duration),
              rect: CENSOR,
              mode: 'pixelate',
              blockSize: 48,
              soften: true,
            }],
          },
        }
      : asset
  )),
};

const censored = await exportProjectToMp4({ project: censoredDocument, outputPath: censoredPath, mode: 'styled' });

const cleanFrame = ppmPixels(cleanPath);
const censoredFrame = ppmPixels(censoredPath);
if (cleanFrame.length !== censoredFrame.length || cleanFrame.length === 0) {
  throw new Error(`frame sizes differ or are empty: ${cleanFrame.length} vs ${censoredFrame.length}`);
}

// Output is 1920x1080 styled; the screen sits inside padding, so rather than
// computing exact geometry, measure how much of the frame changed and where.
const width = 1920;
const height = 1080;
if (cleanFrame.length !== width * height * 3) {
  throw new Error(`unexpected frame size ${cleanFrame.length} for ${width}x${height}`);
}

let changedInside = 0;
let changedOutside = 0;
let insideTotal = 0;
let outsideTotal = 0;
for (let y = 0; y < height; y += 4) {
  for (let x = 0; x < width; x += 4) {
    const i = (y * width + x) * 3;
    const diff = Math.abs(cleanFrame[i] - censoredFrame[i])
      + Math.abs(cleanFrame[i + 1] - censoredFrame[i + 1])
      + Math.abs(cleanFrame[i + 2] - censoredFrame[i + 2]);
    // Generous band around the censored area to allow for letterboxing/padding.
    const nx = x / width;
    const ny = y / height;
    const inside = nx > 0.3 && nx < 0.7 && ny > 0.3 && ny < 0.7;
    if (inside) { insideTotal += 1; if (diff > 24) changedInside += 1; }
    else { outsideTotal += 1; if (diff > 24) changedOutside += 1; }
  }
}

const insideRatio = changedInside / Math.max(1, insideTotal);
const outsideRatio = changedOutside / Math.max(1, outsideTotal);

// A censor that only works without zoom is not the feature. Export the same
// censored project again with a zoom marker over the censored area and confirm the
// censor is still applied — the whole promise is that it tracks the content.
const zoomedCleanPath = join(root, 'zoomed-clean.mp4');
const zoomedCensoredPath = join(root, 'zoomed-censored.mp4');
const withZoom = (document) => ({
  ...document,
  assets: document.assets.map((asset) => (
    asset.type === 'recording' && asset.presentation
      ? {
          ...asset,
          presentation: {
            ...asset.presentation,
            zoom: {
              ...asset.presentation.zoom,
              followCursor: false,
              markers: [{
                id: 'zoom-smoke',
                startFrame: 0,
                endFrame: Math.max(12, asset.duration),
                kind: 'manual',
                strength: 0.8,
                focalPoint: { x: 0.5, y: 0.5 },
                zoomInDuration: 1,
                zoomOutDuration: 1,
                followCursor: false,
              }],
            },
          },
        }
      : asset
  )),
});

const zoomedClean = await exportProjectToMp4({ project: withZoom(project.document), outputPath: zoomedCleanPath, mode: 'styled' });
const zoomedCensored = await exportProjectToMp4({ project: withZoom(censoredDocument), outputPath: zoomedCensoredPath, mode: 'styled' });

const zoomedCleanFrame = ppmPixels(zoomedCleanPath);
const zoomedCensoredFrame = ppmPixels(zoomedCensoredPath);
let zoomChanged = 0;
let zoomTotal = 0;
for (let y = 0; y < height; y += 4) {
  for (let x = 0; x < width; x += 4) {
    const i = (y * width + x) * 3;
    const diff = Math.abs(zoomedCleanFrame[i] - zoomedCensoredFrame[i])
      + Math.abs(zoomedCleanFrame[i + 1] - zoomedCensoredFrame[i + 1])
      + Math.abs(zoomedCleanFrame[i + 2] - zoomedCensoredFrame[i + 2]);
    zoomTotal += 1;
    if (diff > 24) zoomChanged += 1;
  }
}
const zoomRatio = zoomChanged / Math.max(1, zoomTotal);

// Prove it is a MOSAIC and not just "some pixels changed": mosaicing collapses each
// block to a flat colour, so the censored frame must contain far more locally-flat
// patches inside the region than the clean one does. Measured in output geometry on
// both frames, so it needs no knowledge of how the styled layout scales and pads —
// only that the two frames are measured identically.
function flatPatchRatio(buf) {
  const px = (x, y) => { const i = (y * width + x) * 3; return [buf[i], buf[i + 1], buf[i + 2]]; };
  const near = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) <= 24;
  let patches = 0;
  let flat = 0;
  const S = 8;
  for (let y = Math.round(height * 0.35); y + S < Math.round(height * 0.65); y += S) {
    for (let x = Math.round(width * 0.35); x + S < Math.round(width * 0.65); x += S) {
      patches += 1;
      const c = [px(x, y), px(x + S - 1, y), px(x, y + S - 1), px(x + S - 1, y + S - 1)];
      if (c.every((p) => near(p, c[0]))) flat += 1;
    }
  }
  return patches > 0 ? flat / patches : 0;
}
const cleanFlat = flatPatchRatio(cleanFrame);
const censoredFlat = flatPatchRatio(censoredFrame);

const report = {
  ok: insideRatio > 0.2 && outsideRatio < 0.05 && zoomRatio > 0.05 && censoredFlat > cleanFlat + 0.2,
  flatPatchesClean: Math.round(cleanFlat * 1000) / 1000,
  flatPatchesCensored: Math.round(censoredFlat * 1000) / 1000,
  cleanPath,
  censoredPath,
  zoomedCensoredPath,
  cleanBytes: clean.bytes,
  censoredBytes: censored.bytes,
  zoomedCleanBytes: zoomedClean.bytes,
  zoomedCensoredBytes: zoomedCensored.bytes,
  censorRect: CENSOR,
  changedInsideRatio: Math.round(insideRatio * 1000) / 1000,
  changedOutsideRatio: Math.round(outsideRatio * 1000) / 1000,
  changedWithZoomRatio: Math.round(zoomRatio * 1000) / 1000,
};
console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  throw new Error(
    `censor did not reach the export as expected: inside=${report.changedInsideRatio} (want > 0.2), outside=${report.changedOutsideRatio} (want < 0.05), zoomed=${report.changedWithZoomRatio} (want > 0.05), flatPatches ${report.flatPatchesClean} -> ${report.flatPatchesCensored} (want +0.2)`,
  );
}
