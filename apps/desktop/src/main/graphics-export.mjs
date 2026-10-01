// Export side of Claude-made graphics.
//
// The styled export is left exactly as it was. When a project has graphics, a
// second pass lays them over the finished file: each graphic is rendered to a
// transparent PNG sequence by the same page the preview shows (seeked frame by
// frame), then ONE ffmpeg overlay per graphic places it at its timeline time.

import { graphicHoldSec, listGraphics } from '../shared/motion-graphics.mjs';

/** Which frames each graphic needs, clipped to the exported length. */
export function planGraphicsOverlay({ document, fps, durationFrames }) {
  const total = Number.isFinite(durationFrames) && durationFrames > 0 ? Math.round(durationFrames) : Infinity;
  return listGraphics(document)
    .filter((graphic) => graphic.enabled && graphic.html && graphic.startFrame < total)
    .map((graphic) => {
      const endFrame = Math.min(graphic.endFrame, total);
      return {
        id: graphic.id,
        html: graphic.html,
        fields: graphic.fields,
        animate: graphic.animate,
        layout: graphic.layout,
        timing: graphic.timing,
        designedSec: graphic.designedSec,
        holdSec: graphicHoldSec((graphic.endFrame - graphic.startFrame) / fps),
        durationSec: (graphic.endFrame - graphic.startFrame) / fps,
        startFrame: graphic.startFrame,
        frameCount: Math.max(0, endFrame - graphic.startFrame),
        fps,
      };
    })
    .filter((item) => item.frameCount > 0);
}

function safeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function graphicFramePattern(framesRoot, id) {
  return `${framesRoot}/${safeId(id)}/%06d.png`;
}

/**
 * ffmpeg args: base video + one PNG sequence per graphic, each shifted to its
 * start time and overlaid once, in layer order (later = on top). Audio is
 * copied untouched.
 */
export function buildGraphicsOverlayArgs({ inputPath, outputPath, items, framesRoot, fps }) {
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats', '-i', inputPath];
  for (const item of items) {
    args.push('-framerate', String(fps), '-start_number', '0', '-i', graphicFramePattern(framesRoot, item.id));
  }
  const filters = [];
  let current = '[0:v]';
  items.forEach((item, index) => {
    const input = index + 1;
    const offset = (item.startFrame / fps).toFixed(6);
    filters.push(`[${input}:v]format=rgba,setpts=PTS-STARTPTS+${offset}/TB[g${input}]`);
    const out = index === items.length - 1 ? '[vout]' : `[v${input}]`;
    filters.push(`${current}[g${input}]overlay=0:0:eof_action=pass:format=auto${out}`);
    current = out;
  });
  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '[vout]',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '16',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    outputPath,
  );
  return args;
}
