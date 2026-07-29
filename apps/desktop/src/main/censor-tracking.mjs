/**
 * Automatic censor tracking — make a censor follow the thing it is hiding. (TASK-252)
 *
 * ## Why this is plain JavaScript over greyscale frames
 *
 * The obvious stack for this is OpenCV.js or WebCodecs in the renderer, and both
 * were rejected on measurement rather than taste:
 *
 * - The official opencv.js WASM build does not ship the contrib trackers (CSRT/KCF),
 *   so using them means maintaining a custom WASM build.
 * - WebCodecs needs a demuxer, and recordings here are Matroska, which the common
 *   one (mp4box.js) does not read.
 * - Meanwhile ffmpeg — already a dependency, already used for every export — streams
 *   a whole recording out as small greyscale planes in well under a second
 *   (measured: 600 frames of 20s 1080p in 0.44s). Tracking is a one-off analysis
 *   pass, not a live effect, so that is all the speed it needs.
 *
 * So the frames come from ffmpeg and the matching is written here. No new
 * dependency, no custom build, and it works on any format ffmpeg can open.
 *
 * ## What the matcher is, and what it deliberately is not
 *
 * Zero-mean normalized cross-correlation of the original template against a window
 * around the last known position. Normalized because auto-exposure and window focus
 * change the whole frame's brightness, and a raw difference metric loses the target
 * when they do.
 *
 * It follows POSITION only — never size. Scale search doubles the cost and a censor
 * that shrinks because the match liked a smaller box is a censor that has uncovered
 * its target. Size stays whatever the user drew.
 *
 * On a weak match it HOLDS the last position rather than taking the best available
 * offset. A tracker that wanders when it loses the target moves the censor off the
 * thing it is hiding, which is the one failure that actually matters here.
 */

import { spawn } from 'node:child_process';

/** Below this correlation the match is not trusted and the position is held. */
const MIN_MATCH_SCORE = 0.8;

/**
 * Width the recording is scaled to for analysis.
 *
 * Matching cost is per pixel, so this is the main speed dial. Measured against a
 * clip with known motion: 480 wide costs 10.0ms a frame for 2 source px of error,
 * 320 costs 4.6ms for 4px, 240 costs 3.2ms for 6px. 320 is the pick — a few pixels
 * of error is invisible on a censor box hundreds of pixels across, and a censor
 * covering five minutes is 9000 frames, where the difference is half a minute of
 * the user waiting.
 *
 * The scaler low-passes on the way down, which is also what keeps single-pixel
 * patterns from aliasing into a flat, unmatchable patch.
 */
const ANALYSIS_WIDTH = 320;

/**
 * Every template pixel is compared — no subsampling stride.
 *
 * A stride was tried and removed: sampling every second pixel of a fine alternating
 * pattern (a checkerboard, dithering, small text) reads back a flat patch, and a flat
 * patch is refused as a match, so the tracker simply never moved. Screen recordings
 * are full of patterns at exactly that scale. The saving was not worth a tracker that
 * silently does nothing on some content, and the analysis is fast enough without it.
 */

/** How far the target may move between frames, in analysis pixels. */
const DEFAULT_SEARCH_RADIUS = 12;

/**
 * The frame size the analysis runs at, from the recording's shape.
 *
 * Shared so the caller can build a tracker before the first frame arrives without a
 * second copy of this arithmetic — a tracker sized differently from the frames it is
 * fed would read every row at the wrong offset and match nothing.
 */
export function resolveAnalysisSize({ sourceWidth, sourceHeight, analysisWidth = ANALYSIS_WIDTH } = {}) {
  const aspect = sourceWidth > 0 && sourceHeight > 0 ? sourceHeight / sourceWidth : 9 / 16;
  const width = Math.max(2, Math.round(analysisWidth / 2) * 2);
  const height = Math.max(2, Math.round((width * aspect) / 2) * 2);
  return { width, height };
}

function clampInt(value, low, high) {
  if (!Number.isFinite(value)) return low;
  return Math.max(low, Math.min(high, Math.round(value)));
}

/**
 * Zero-mean normalized cross-correlation between the template patch and the frame
 * at a candidate offset. Returns -1 for a degenerate (flat) patch.
 */
function correlationAt(template, frame, width, height, rect, originX, originY, dx, dy) {
  const left = originX + dx;
  const top = originY + dy;
  if (left < 0 || top < 0 || left + rect.w > width || top + rect.h > height) return -1;

  let sumA = 0;
  let sumB = 0;
  let count = 0;
  for (let y = 0; y < rect.h; y += 1) {
    const templateRow = (rect.y + y) * width + rect.x;
    const frameRow = (top + y) * width + left;
    for (let x = 0; x < rect.w; x += 1) {
      sumA += template[templateRow + x];
      sumB += frame[frameRow + x];
      count += 1;
    }
  }
  if (count === 0) return -1;
  const meanA = sumA / count;
  const meanB = sumB / count;

  let cross = 0;
  let varA = 0;
  let varB = 0;
  for (let y = 0; y < rect.h; y += 1) {
    const templateRow = (rect.y + y) * width + rect.x;
    const frameRow = (top + y) * width + left;
    for (let x = 0; x < rect.w; x += 1) {
      const a = template[templateRow + x] - meanA;
      const b = frame[frameRow + x] - meanB;
      cross += a * b;
      varA += a * a;
      varB += b * b;
    }
  }
  const denominator = Math.sqrt(varA * varB);
  // A flat patch correlates with everything. Refusing to score it is what stops the
  // censor sliding along a blank wall.
  if (!(denominator > 0)) return -1;
  return cross / denominator;
}

/**
 * Best offset of the template patch within a search window of a later frame.
 *
 * `rect` is where the template lives in the template frame. `searchOrigin` is where
 * to search around in the later frame, which during tracking is the last known
 * position rather than the original one. The returned offset is relative to
 * `searchOrigin`.
 *
 * The sweep is exhaustive at single-pixel steps. A coarse-to-fine version was tried
 * and removed for the same reason as the template stride: on high-frequency content
 * the correlation peak is one pixel wide, and sampling the window at every second
 * offset steps straight over it — the matcher then returned near-random offsets with
 * low scores instead of the exact hit sitting between its samples. Doing coarse
 * search safely needs a properly low-passed image pyramid, not a sparser sample; the
 * exhaustive version is fast enough that the pyramid has not been worth building.
 */
export function matchTemplateOffset({
  template,
  frame,
  width,
  height,
  rect,
  searchOrigin = null,
  searchRadius = DEFAULT_SEARCH_RADIUS,
} = {}) {
  const box = {
    x: clampInt(rect?.x, 0, Math.max(0, width - 1)),
    y: clampInt(rect?.y, 0, Math.max(0, height - 1)),
    w: Math.max(1, Math.round(rect?.w ?? 0)),
    h: Math.max(1, Math.round(rect?.h ?? 0)),
  };
  const originX = Number.isFinite(searchOrigin?.x) ? Math.round(searchOrigin.x) : box.x;
  const originY = Number.isFinite(searchOrigin?.y) ? Math.round(searchOrigin.y) : box.y;
  let best = { dx: 0, dy: 0, score: -1 };

  for (let dy = -searchRadius; dy <= searchRadius; dy += 1) {
    for (let dx = -searchRadius; dx <= searchRadius; dx += 1) {
      const score = correlationAt(template, frame, width, height, box, originX, originY, dx, dy);
      if (score > best.score) best = { dx, dy, score };
    }
  }
  return best;
}

/**
 * A tracker you feed one frame at a time.
 *
 * Streaming rather than taking an array is not an optimisation — it is what makes
 * the feature usable on a real recording. Holding the frames costs 130KB each, so a
 * censor covering five minutes retains 1.2GB and peaks the process at 2.4GB
 * (measured), and a censor running to the end of a half-hour recording is several
 * times that. This keeps exactly one frame: the template.
 *
 * The first frame pushed is the reference — the template is cut from it at
 * `startRect`, and the first keyframe is that position at `startFrame`. Every later
 * frame is matched against that same original template, searched around the previous
 * position. Matching against the previous frame instead would let small per-frame
 * errors accumulate into a slow slide off the target.
 */
export function createRectTracker({
  width,
  height,
  startFrame = 0,
  startRect,
  searchRadius = DEFAULT_SEARCH_RADIUS,
  minScore = MIN_MATCH_SCORE,
} = {}) {
  const usable = width > 0 && height > 0 && Boolean(startRect);
  const box = usable
    ? {
        x: clampInt(startRect.x * width, 0, width - 1),
        y: clampInt(startRect.y * height, 0, height - 1),
        w: Math.max(1, Math.round(startRect.w * width)),
        h: Math.max(1, Math.round(startRect.h * height)),
      }
    : null;

  let template = null;
  let current = box ? { x: box.x, y: box.y } : null;
  let index = 0;
  const keyframes = [];

  return {
    push(frame) {
      if (!usable || !frame) return;
      if (template === null) {
        template = frame;
      } else {
        const match = matchTemplateOffset({
          template,
          frame,
          width,
          height,
          // Template stays anchored to where the user drew it; only the search
          // window follows the target.
          rect: box,
          searchOrigin: current,
          searchRadius,
        });
        // Held, not moved, when the match is weak: see the note at the top of the file.
        if (match.score >= minScore) {
          current = {
            x: clampInt(current.x + match.dx, 0, width - box.w),
            y: clampInt(current.y + match.dy, 0, height - box.h),
          };
        }
      }
      keyframes.push({
        frame: startFrame + index,
        rect: { x: current.x / width, y: current.y / height, w: box.w / width, h: box.h / height },
      });
      index += 1;
    },
    keyframes: () => keyframes,
    /** How many frames the tracker is holding on to. Always the template, only. */
    retainedFrames: () => (template === null ? 0 : 1),
  };
}

/**
 * Follow a rect through a sequence of greyscale frames already in memory.
 *
 * Convenience over `createRectTracker` for tests and short sequences. Anything that
 * reads a real recording must use the streaming form: see the note there on what
 * holding the frames costs.
 */
export function trackRectAcrossFrames({ frames = [], ...options } = {}) {
  if (!Array.isArray(frames) || frames.length === 0) return [];
  const tracker = createRectTracker(options);
  for (const frame of frames) tracker.push(frame);
  return tracker.keyframes();
}

/**
 * Drop keyframes that a straight line between their neighbours already describes
 * (Ramer–Douglas–Peucker over the position path).
 *
 * Not an optimisation for its own sake: every keyframe becomes its own filter in the
 * FFmpeg export, so a per-frame track on a one-minute clip is thousands of filters
 * describing a path a handful of points would. `tolerance` is in normalized units —
 * the furthest a simplified path may sit from the tracked one.
 */
export function simplifyCensorKeyframes(keyframes, tolerance = 0.002) {
  const points = Array.isArray(keyframes) ? keyframes.filter((keyframe) => keyframe && keyframe.rect) : [];
  if (points.length <= 2) return points.slice();

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop();
    if (to - from < 2) continue;
    const start = points[from];
    const end = points[to];
    const spanFrames = end.frame - start.frame;
    let worst = -1;
    let worstIndex = -1;
    for (let index = from + 1; index < to; index += 1) {
      const point = points[index];
      const t = spanFrames > 0 ? (point.frame - start.frame) / spanFrames : 0;
      const predictedX = start.rect.x + (end.rect.x - start.rect.x) * t;
      const predictedY = start.rect.y + (end.rect.y - start.rect.y) * t;
      // Deviation measured the way the renderer will interpolate — against the
      // straight line in time, not against the geometric segment — so the tolerance
      // means what it says on screen.
      const deviation = Math.hypot(point.rect.x - predictedX, point.rect.y - predictedY);
      if (deviation > worst) {
        worst = deviation;
        worstIndex = index;
      }
    }
    if (worst > tolerance && worstIndex > 0) {
      keep[worstIndex] = 1;
      stack.push([from, worstIndex], [worstIndex, to]);
    }
  }

  return points.filter((_point, index) => keep[index] === 1);
}

/**
 * Stream a span of a recording out as small greyscale frames.
 *
 * Greyscale because the matcher only reads luma, and one plane is a third of the
 * bytes. Scaled down because the matching cost is per pixel and the analysis does
 * not need detail the scaler would only have to average away again.
 *
 * Pass `onFrame` to consume each frame as it arrives and keep memory flat — that is
 * the only form anything reading a real recording should use. Without it every frame
 * is collected into `frames`, which is fine for a short fixture and ruinous for a
 * long censor: 130KB a frame, so five minutes is 1.2GB.
 *
 * Resolves `{ width, height, frames, frameCount }`; `frames` is empty when `onFrame`
 * was supplied.
 */
export function readAnalysisFrames({
  sourcePath,
  startFrame = 0,
  frameCount,
  fps = 30,
  analysisWidth = ANALYSIS_WIDTH,
  sourceWidth,
  sourceHeight,
  ffmpegPath = 'ffmpeg',
  signal = null,
  onFrame = null,
} = {}) {
  return new Promise((resolve, reject) => {
    if (!sourcePath) {
      reject(new Error('censor tracking needs a source recording'));
      return;
    }
    const effectiveFps = fps > 0 ? fps : 30;
    const { width, height } = resolveAnalysisSize({ sourceWidth, sourceHeight, analysisWidth });
    const frameBytes = width * height;

    const args = [
      '-v', 'error',
      // Seeking before the input is the fast one, and frame-accurate enough here:
      // the tracker's first frame IS the template, so whatever it lands on is what
      // the user's rect is read from.
      '-ss', String(startFrame / effectiveFps),
      '-i', sourcePath,
    ];
    if (Number.isFinite(frameCount) && frameCount > 0) args.push('-frames:v', String(Math.round(frameCount)));
    args.push('-vf', `scale=${width}:${height},format=gray`, '-f', 'rawvideo', '-');

    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const frames = [];
    let produced = 0;
    let pending = Buffer.alloc(0);
    let stderr = '';

    const abort = () => child.kill('SIGKILL');
    if (signal) {
      if (signal.aborted) { abort(); reject(new Error('censor tracking cancelled')); return; }
      signal.addEventListener('abort', abort, { once: true });
    }

    child.stdout.on('data', (chunk) => {
      pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
      // A frame is only whole once frameBytes have arrived; the pipe splits wherever
      // it likes, so partial frames are carried over rather than analysed as-is.
      while (pending.length >= frameBytes) {
        // Copied out of the pipe buffer: `subarray` is a view, and the consumer may
        // keep the frame (the tracker keeps the first one as its template) long
        // after this chunk has been reused.
        const frame = new Uint8Array(pending.subarray(0, frameBytes));
        pending = pending.subarray(frameBytes);
        produced += 1;
        if (onFrame) onFrame(frame);
        else frames.push(frame);
      }
    });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (signal) signal.removeEventListener('abort', abort);
      if (code !== 0 && produced === 0) {
        reject(new Error(`frame read failed (${code}): ${stderr.trim()}`));
        return;
      }
      resolve({ width, height, frames, frameCount: produced });
    });
  });
}

/**
 * Track a censor across its own span and return the keyframes it should carry.
 *
 * The whole pass: read the span as small greyscale frames, correlate the user's rect
 * forward through them, then simplify the path so the export does not carry one
 * filter per frame for a straight line.
 */
export async function trackCensorRegion({
  sourcePath,
  region,
  fps = 30,
  sourceWidth,
  sourceHeight,
  ffmpegPath = 'ffmpeg',
  signal = null,
  tolerance = 0.002,
  onProgress = null,
} = {}) {
  const startFrame = Math.max(0, Math.round(Number(region?.startFrame) || 0));
  const endFrame = Math.max(startFrame + 1, Math.round(Number(region?.endFrame) || 0));
  const rect = region?.rect;
  if (!rect) throw new Error('censor tracking needs a region rect');

  // The analysis frame size is fixed by the source aspect, so the tracker can be
  // built before the first frame arrives and fed straight off the pipe. Nothing here
  // ever holds more than one frame: a censor running to the end of a long recording
  // is tens of thousands of frames, and collecting them first exhausted memory.
  const expectedFrames = endFrame - startFrame;
  let analysed = 0;
  let lastReport = 0;
  const size = resolveAnalysisSize({ sourceWidth, sourceHeight });
  const tracker = createRectTracker({
    width: size.width,
    height: size.height,
    startFrame,
    startRect: rect,
  });
  const { width, height, frameCount } = await readAnalysisFrames({
    sourcePath,
    startFrame,
    frameCount: endFrame - startFrame,
    fps,
    sourceWidth,
    sourceHeight,
    ffmpegPath,
    signal,
    onFrame: (frame) => {
      tracker.push(frame);
      // Throttled to a few a second. A censor covering minutes takes tens of
      // seconds to analyse, and with no sign of life a button that says
      // "Following…" is indistinguishable from one that has hung.
      if (!onProgress) return;
      analysed += 1;
      const now = Date.now();
      if (now - lastReport < 250) return;
      lastReport = now;
      onProgress({ analyzedFrames: analysed, totalFrames: expectedFrames });
    },
  });
  if (frameCount === 0) throw new Error('censor tracking read no frames from the recording');

  const tracked = tracker.keyframes();
  const keyframes = simplifyCensorKeyframes(tracked, tolerance);
  return {
    keyframes,
    analyzedFrames: frameCount,
    analysisWidth: width,
    analysisHeight: height,
    // Reported so the caller can tell "it followed the target" from "it held still
    // the whole way because it never found one".
    trackedFrames: tracked.length,
  };
}
