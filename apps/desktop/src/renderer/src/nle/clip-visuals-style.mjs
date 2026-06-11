// Pure helpers for timeline clip media visuals (TASK-237 slice 3).
// One strip image per SOURCE covers the whole asset; each clip shows its
// [sourceIn, sourceOut) slice via CSS background size/offset. No retiming,
// so screen px-per-second equals pixelsPerFrame * fps everywhere.

// Absolute-or-relative file path of the media behind a clip's mediaId.
// Relative recording paths resolve against the project dir in the main
// process. AI-generated sources are skipped for now (no filePath on the
// reference) — they keep the flat block look until a later slice.
export function clipSourceFilePath(project, mediaId) {
  const document = project?.document;
  const source = document?.timeline?.sources?.find((item) => item?.id === mediaId);
  if (!source?.assetId) return null;
  const asset = (document.assets ?? []).find((item) => item?.id === source.assetId);
  return typeof asset?.filePath === 'string' && asset.filePath ? asset.filePath : null;
}

function sliceBackground(url, coveredSeconds, { sourceInFrames, fps, pixelsPerFrame }) {
  const pxPerSec = Number(pixelsPerFrame) * Number(fps);
  if (!Number.isFinite(pxPerSec) || pxPerSec <= 0 || !Number.isFinite(coveredSeconds) || coveredSeconds <= 0) return null;
  const offsetPx = (Math.max(0, Number(sourceInFrames) || 0) / Number(fps)) * pxPerSec;
  return {
    backgroundImage: `url("${url}")`,
    backgroundSize: `${(coveredSeconds * pxPerSec).toFixed(2)}px 100%`,
    backgroundPosition: `${(-offsetPx).toFixed(2)}px 0`,
    backgroundRepeat: 'no-repeat',
  };
}

export function filmstripBackground(meta, view) {
  if (!meta?.url) return null;
  return sliceBackground(meta.url, Number(meta.stripSeconds), view);
}

export function waveformBackground(meta, view) {
  if (!meta?.url) return null;
  return sliceBackground(meta.url, Number(meta.durationSec), view);
}

// Zoom buckets: ~one filmstrip tile per TILE px of screen, quantized to
// powers of two so zooming doesn't regenerate strips on every wheel step.
const TILE_SCREEN_PX = 86;
export function filmstripTileBucket(sourceDurationSec, fps, pixelsPerFrame) {
  const widthPx = Math.max(1, sourceDurationSec * fps * pixelsPerFrame);
  const desired = Math.max(1, widthPx / TILE_SCREEN_PX);
  return Math.min(128, 2 ** Math.ceil(Math.log2(desired)));
}

export function waveformWidthBucket(sourceDurationSec, fps, pixelsPerFrame) {
  const widthPx = Math.max(1, sourceDurationSec * fps * pixelsPerFrame);
  return Math.min(8192, Math.max(512, 2 ** Math.ceil(Math.log2(widthPx))));
}

// Prefer the exact bucket; otherwise the closest generated variant so the
// strip never blanks while a sharper one renders.
export function pickVisual(visuals, kind, sourcePath, bucket) {
  const exact = visuals[`${kind}:${sourcePath}:${bucket}`];
  if (exact) return exact;
  const prefix = `${kind}:${sourcePath}:`;
  let best = null;
  let bestDistance = Infinity;
  for (const [key, meta] of Object.entries(visuals)) {
    if (!key.startsWith(prefix)) continue;
    const variant = Number(key.slice(prefix.length));
    const distance = Math.abs(Math.log2(Math.max(1, variant)) - Math.log2(Math.max(1, bucket)));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = meta;
    }
  }
  return best;
}
