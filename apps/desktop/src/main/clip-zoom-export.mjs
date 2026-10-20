// Zooms placed on an added clip, for the export.
//
// Each added clip that has zooms is first rendered on its own (its span only, capped
// ffmpeg like every export step): the same crop window the preview draws
// (clipZoomCropAt) is applied per frame, then scaled back to the file's own size. The
// main export then uses that piece in place of the original file, unchanged.
//
// It is a separate pass on purpose: the recording's own zoom drives every `crop`
// filter in the main export graph by type, so a second zoom crop in that graph would
// receive the recording's zoom commands too.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clipZoomCropAt, clipZooms } from '../shared/clip-overlays.mjs';

function even(value) {
  return Math.max(2, Math.round(value / 2) * 2);
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(3).replace(/\.?0+$/, '') : '0';
}

/**
 * The sendcmd lines and starting crop for one added-clip span: frame i of the span is
 * frame `sourceIn + i` of the file. Only changes are written (a held zoom is one line).
 */
export function buildClipZoomCommands({ markers, sourceIn, frames, fps, width, height }) {
  const lines = [];
  let previous = null;
  let first = null;
  for (let index = 0; index < frames; index += 1) {
    const crop = clipZoomCropAt(markers, sourceIn + index, width, height);
    const window = { x: Math.round(crop.x), y: Math.round(crop.y), w: even(crop.w), h: even(crop.h) };
    window.x = Math.min(window.x, width - window.w);
    window.y = Math.min(window.y, height - window.h);
    if (!first) first = window;
    if (previous && previous.x === window.x && previous.y === window.y && previous.w === window.w && previous.h === window.h) continue;
    previous = window;
    // sendcmd sits after the crop, so a command sent with frame i-1 takes effect on frame i.
    if (index === 0) continue;
    lines.push(`${((index - 1) / fps).toFixed(6)} crop w ${window.w}, crop h ${window.h}, crop x ${window.x}, crop y ${window.y};`);
  }
  return { content: `${lines.join('\n')}\n`, first: first ?? { x: 0, y: 0, w: even(width), h: even(height) } };
}

export function buildClipZoomArgs({ inputPath, outputPath, commandsPath, first, sourceIn, frames, fps, width, height }) {
  const w = even(width);
  const h = even(height);
  return [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-ss', formatNumber(sourceIn / fps),
    '-t', formatNumber((frames + 2) / fps),
    '-i', inputPath,
    '-map', '0:v:0',
    '-vf', [
      `fps=${formatNumber(fps)}`,
      'setpts=PTS-STARTPTS',
      // Same order as the recording's zoom: crop, then the commands that drive it.
      // (sendcmd placed before crop scrambles the picture when the crop size changes.)
      `crop=w=${first.w}:h=${first.h}:x=${first.x}:y=${first.y}`,
      `sendcmd=f='${String(commandsPath).replace(/\\/g, '/').replace(/'/g, "\\'")}'`,
      `scale=${w}:${h}:flags=bicubic`,
      'setsar=1',
    ].join(','),
    '-frames:v', String(frames),
    '-an',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p',
    outputPath,
  ];
}

/**
 * Swap every added-clip span that has zooms for a zoomed piece. Returns the new
 * segment list and a cleanup. Spans without zooms (and the recording) are untouched.
 */
export async function prerenderZoomedClipSegments({ segments, document, fps, run, probeSize, signal = null }) {
  const work = (segments ?? []).filter((segment) => segment?.inputPath && segment.assetId && clipZooms(document, segment.assetId).length > 0);
  if (work.length === 0) return { segments, cleanup: async () => undefined };
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-clip-zoom-'));
  const cleanup = () => rm(root, { recursive: true, force: true });
  try {
    const replaced = new Map();
    for (const [index, segment] of work.entries()) {
      const size = await probeSize(segment.inputPath, signal);
      if (!size?.width || !size?.height) continue;
      const frames = Math.max(1, segment.sourceOut - segment.sourceIn);
      const { content, first } = buildClipZoomCommands({ markers: clipZooms(document, segment.assetId), sourceIn: segment.sourceIn, frames, fps, width: size.width, height: size.height });
      const commandsPath = join(root, `zoom-${index}.cmd`);
      const outputPath = join(root, `zoom-${index}.mp4`);
      await writeFile(commandsPath, content, 'utf8');
      const result = await run('ffmpeg', buildClipZoomArgs({ inputPath: segment.inputPath, outputPath, commandsPath, first, sourceIn: segment.sourceIn, frames, fps, width: size.width, height: size.height }), { signal });
      if (result?.cancelled) throw Object.assign(new Error('Export cancelled'), { cancelled: true });
      if (result?.code !== 0) throw new Error(`Zoom on an added clip failed: ${String(result?.stderr ?? '').trim()}`);
      // Picture comes from the zoomed piece; the sound still comes from the original file.
      replaced.set(segment, { ...segment, inputPath: outputPath, sourceIn: 0, sourceOut: frames, originalInputPath: segment.inputPath });
    }
    return { segments: segments.map((segment) => replaced.get(segment) ?? segment), cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
