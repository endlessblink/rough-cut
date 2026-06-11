export type ClipVisualMeta = {
  url: string;
  kind: 'filmstrip' | 'waveform';
  durationSec: number;
  tiles?: number;
  intervalSec?: number;
  stripSeconds?: number;
  widthPx?: number;
};
export type ClipVisualView = { sourceInFrames: number; fps: number; pixelsPerFrame: number };
export function clipSourceFilePath(project: unknown, mediaId: string | null | undefined): string | null;
export function filmstripBackground(meta: ClipVisualMeta | null, view: ClipVisualView): Record<string, string> | null;
export function waveformBackground(meta: ClipVisualMeta | null, view: ClipVisualView): Record<string, string> | null;
export function filmstripTileBucket(sourceDurationSec: number, fps: number, pixelsPerFrame: number): number;
export function waveformWidthBucket(sourceDurationSec: number, fps: number, pixelsPerFrame: number): number;
export function pickVisual(visuals: Record<string, ClipVisualMeta>, kind: 'filmstrip' | 'waveform', sourcePath: string, bucket: number): ClipVisualMeta | null;
