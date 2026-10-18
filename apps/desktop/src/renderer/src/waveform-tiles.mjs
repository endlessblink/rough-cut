// Source-anchored tiles: one extrema column per displayed pixel, irrespective
// of recording length. Clip edits only change placement, never decoded content.
export const WAVEFORM_TILE_WIDTH = 512;
export function planWaveformTiles({ clips, pixelsPerFrame, fps, sourceFrames, scrollLeft, viewWidth, labelWidth = 88 }) {
  if (!(pixelsPerFrame > 0) || !(fps > 0) || !(viewWidth > 0)) return [];
  const result = [];
  for (const clip of clips) {
    const clipStart = clip.timelineIn * pixelsPerFrame;
    const clipWidth = (clip.timelineOut - clip.timelineIn) * pixelsPerFrame;
    const left = Math.max(0, scrollLeft - labelWidth - WAVEFORM_TILE_WIDTH - clipStart);
    const right = Math.min(clipWidth, scrollLeft + viewWidth + WAVEFORM_TILE_WIDTH - clipStart);
    if (right <= left) continue;
    const sourceStart = clip.sourceIn * pixelsPerFrame;
    const first = Math.floor((sourceStart + left) / WAVEFORM_TILE_WIDTH);
    const last = Math.ceil((sourceStart + right) / WAVEFORM_TILE_WIDTH);
    for (let index = first; index < last; index++) {
      const startPixel = index * WAVEFORM_TILE_WIDTH;
      const width = Math.min(WAVEFORM_TILE_WIDTH, sourceFrames * pixelsPerFrame - startPixel);
      if (width <= 0) continue;
      result.push({ clipId: clip.id, key: `${pixelsPerFrame}:${index}`, left: startPixel - sourceStart,
        width, startSec: startPixel / (pixelsPerFrame * fps), spanSec: width / (pixelsPerFrame * fps) });
    }
  }
  return result;
}
