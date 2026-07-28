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

function ppmPixels(path, atSeconds = null) {
  const seek = atSeconds === null ? [] : ['-ss', String(atSeconds)];
  const result = spawnSync('ffmpeg', ['-v', 'error', ...seek, '-i', path, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {
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

// Softness must actually change the exported pixels. Export the same censor crisp and
// fully softened and diff them inside the region.
//
// Deliberately NOT measured as "fewer hard edges" or "flatter patches": the styled
// layout scales the source region up into a padded canvas, and that scaling smooths
// everything, so edge and flatness metrics are almost insensitive in output geometry.
// A direct crisp-vs-soft diff is valid in any geometry. That the blur only reads
// already-destroyed pixels is proven by the unit tests on the clipped taps, which is
// the right place for that claim.
function regionDiffRatio(a, b) {
  let changed = 0;
  let total = 0;
  for (let y = Math.round(height * 0.36); y < Math.round(height * 0.64); y += 2) {
    for (let x = Math.round(width * 0.36); x < Math.round(width * 0.64); x += 2) {
      const i = (y * width + x) * 3;
      total += 1;
      const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      if (d > 12) changed += 1;
    }
  }
  return total > 0 ? changed / total : 0;
}

const withSoftness = (value) => ({
  ...censoredDocument,
  assets: censoredDocument.assets.map((asset) => (
    asset.presentation?.censorRegions
      ? {
          ...asset,
          presentation: {
            ...asset.presentation,
            censorRegions: asset.presentation.censorRegions.map((region) => ({ ...region, soften: value > 0, softness: value })),
          },
        }
      : asset
  )),
});

const crispPath = join(root, 'crisp.mp4');
const softPath = join(root, 'soft.mp4');
await exportProjectToMp4({ project: withSoftness(0), outputPath: crispPath, mode: 'styled' });
await exportProjectToMp4({ project: withSoftness(1), outputPath: softPath, mode: 'styled' });
const crispFrame = ppmPixels(crispPath);
const softFrame = ppmPixels(softPath);
const softVsCrisp = regionDiffRatio(crispFrame, softFrame);
// The crisp export is the one whose mosaic signature is measurable: softening breaks
// the blocks up on purpose, so flatness is compared against crisp, not the default.
const crispFlat = flatPatchRatio(crispFrame);

// --- a censor that FOLLOWS moving content ---
//
// The one thing unit tests cannot show: that the exported censor is in a different
// place at the end of the clip than at the start. FFmpeg evaluates the animated
// geometry per frame, so this is also the only check that the emitted expressions
// are accepted at all — the wrong spelling of the time variable (`t` where geq
// wants `T`) fails the render outright rather than mispositioning anything.
const MOVING_START = { x: 0.08, y: 0.35, w: 0.25, h: 0.3 };
const MOVING_END = { x: 0.67, y: 0.35, w: 0.25, h: 0.3 };
const movingPath = join(root, 'moving.mp4');
const movingDocument = {
  ...project.document,
  assets: project.document.assets.map((asset) => (
    asset.type === 'recording' && asset.presentation
      ? {
          ...asset,
          presentation: {
            ...asset.presentation,
            censorRegions: [{
              id: 'censor-moving',
              startFrame: 0,
              endFrame: Math.max(12, asset.duration),
              rect: MOVING_START,
              mode: 'pixelate',
              blockSize: 48,
              soften: true,
              keyframes: [
                { frame: 0, rect: MOVING_START },
                { frame: Math.max(12, asset.duration), rect: MOVING_END },
              ],
            }],
          },
        }
      : asset
  )),
};
const moving = await exportProjectToMp4({ project: movingDocument, outputPath: movingPath, mode: 'styled' });

/**
 * Where the censored area sits horizontally, as a fraction of the output width, and
 * how much of the strip it covers.
 *
 * Deliberately measured rather than predicted: the styled layout scales and pads the
 * recording into the canvas, so a source-normalized rect does NOT land at the same
 * normalized position in the output. Hardcoding an expected band here would be
 * asserting the layout maths, not the censor, and would break on any padding change.
 * The centre of mass of the changed pixels needs no knowledge of the layout at all.
 */
function changedSpanX(a, b) {
  let changed = 0;
  let total = 0;
  let weighted = 0;
  for (let y = Math.round(height * 0.38); y < Math.round(height * 0.62); y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 3;
      total += 1;
      const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      if (d > 24) {
        changed += 1;
        weighted += x / width;
      }
    }
  }
  return {
    ratio: total > 0 ? changed / total : 0,
    centerX: changed > 0 ? weighted / changed : 0,
  };
}

// Sampled a little inside each end so the comparison is never taken exactly on a
// keyframe boundary, where a one-frame seek difference could flip the answer.
const earlySpan = changedSpanX(ppmPixels(cleanPath, 0.1), ppmPixels(movingPath, 0.1));
const lateSpan = changedSpanX(ppmPixels(cleanPath, 1.8), ppmPixels(movingPath, 1.8));
const movedDistance = lateSpan.centerX - earlySpan.centerX;

// The same motion as a SOLID censor, sampled twice INSIDE one keyframe span.
//
// Solid and pixelate take different filters through the export, and only pixelate
// was ever checked against pixels — which is how a solid censor that silently
// stopped moving got shipped. drawbox evaluates its geometry once, so a time
// expression there freezes the box for the whole span while the target walks out
// from under it. Two samples inside a single span is what distinguishes "moves
// smoothly" from "jumps once per span": under the frozen bug these two frames are
// identical, and the whole-clip travel check above still passes.
const movingSolidPath = join(root, 'moving-solid.mp4');
await exportProjectToMp4({
  project: {
    ...movingDocument,
    assets: movingDocument.assets.map((asset) => (
      asset.presentation?.censorRegions
        ? {
            ...asset,
            presentation: {
              ...asset.presentation,
              censorRegions: asset.presentation.censorRegions.map((region) => ({ ...region, mode: 'solid', soften: false })),
            },
          }
        : asset
    )),
  },
  outputPath: movingSolidPath,
  mode: 'styled',
});
const solidEarly = changedSpanX(ppmPixels(cleanPath, 0.3), ppmPixels(movingSolidPath, 0.3));
const solidLater = changedSpanX(ppmPixels(cleanPath, 0.9), ppmPixels(movingSolidPath, 0.9));
const solidWithinSpanTravel = solidLater.centerX - solidEarly.centerX;

// Same censor again with zoom active. The screen chain is the one place a censor
// filter can deadlock ffmpeg outright, and animation adds many more filter
// instances to it, so the zoomed path is re-proven rather than assumed.
const movingZoomedPath = join(root, 'moving-zoomed.mp4');
const movingZoomed = await exportProjectToMp4({
  project: withZoom(movingDocument),
  outputPath: movingZoomedPath,
  mode: 'styled',
});
const movingZoomedFrame = ppmPixels(movingZoomedPath, 1.8);
let movingZoomChanged = 0;
let movingZoomTotal = 0;
for (let y = 0; y < height; y += 4) {
  for (let x = 0; x < width; x += 4) {
    const i = (y * width + x) * 3;
    const d = Math.abs(zoomedCleanFrame[i] - movingZoomedFrame[i])
      + Math.abs(zoomedCleanFrame[i + 1] - movingZoomedFrame[i + 1])
      + Math.abs(zoomedCleanFrame[i + 2] - movingZoomedFrame[i + 2]);
    movingZoomTotal += 1;
    if (d > 24) movingZoomChanged += 1;
  }
}
const movingZoomRatio = movingZoomChanged / Math.max(1, movingZoomTotal);

const report = {
  ok: insideRatio > 0.2
    && outsideRatio < 0.05
    && zoomRatio > 0.05
    && crispFlat > cleanFlat + 0.2
    && softVsCrisp > 0.02
    // Something is censored at both ends, it is a localized box rather than the
    // whole frame, and it is somewhere else at the end than at the start. The last
    // condition is the feature; the first two stop a smeared or empty export from
    // passing as "it moved".
    && earlySpan.ratio > 0.03
    && lateSpan.ratio > 0.03
    && earlySpan.ratio < 0.35
    && lateSpan.ratio < 0.35
    && movedDistance > 0.15
    // A solid censor must move BETWEEN two frames of the same span, not only
    // between spans.
    && solidWithinSpanTravel > 0.02
    && movingZoomRatio > 0.05,
  movingSolidWithinSpanTravel: Math.round(solidWithinSpanTravel * 1000) / 1000,
  movingCensorEarlyCenterX: Math.round(earlySpan.centerX * 1000) / 1000,
  movingCensorLateCenterX: Math.round(lateSpan.centerX * 1000) / 1000,
  movingCensorTravelled: Math.round(movedDistance * 1000) / 1000,
  movingCensorEarlyRatio: Math.round(earlySpan.ratio * 1000) / 1000,
  movingCensorLateRatio: Math.round(lateSpan.ratio * 1000) / 1000,
  movingCensorZoomedRatio: Math.round(movingZoomRatio * 1000) / 1000,
  movingPath,
  movingBytes: moving.bytes,
  movingZoomedBytes: movingZoomed.bytes,
  flatPatchesClean: Math.round(cleanFlat * 1000) / 1000,
  flatPatchesCrispMosaic: Math.round(crispFlat * 1000) / 1000,
  flatPatchesDefaultSoftened: Math.round(censoredFlat * 1000) / 1000,
  softVsCrispChangedRatio: Math.round(softVsCrisp * 1000) / 1000,
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
    `censor did not reach the export as expected: inside=${report.changedInsideRatio} (want > 0.2), outside=${report.changedOutsideRatio} (want < 0.05), zoomed=${report.changedWithZoomRatio} (want > 0.05), flatPatches ${report.flatPatchesClean} -> ${report.flatPatchesCrispMosaic} (want +0.2), softVsCrisp=${report.softVsCrispChangedRatio} (want > 0.02), moving censor centre ${report.movingCensorEarlyCenterX} -> ${report.movingCensorLateCenterX} (travelled ${report.movingCensorTravelled}, want > 0.15) at ratios ${report.movingCensorEarlyRatio}/${report.movingCensorLateRatio} (want each in 0.03..0.35), moving+zoom=${report.movingCensorZoomedRatio} (want > 0.05), solid movement within one span=${report.movingSolidWithinSpanTravel} (want > 0.02)`,
  );
}
