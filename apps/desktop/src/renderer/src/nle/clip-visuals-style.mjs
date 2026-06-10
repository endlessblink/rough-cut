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
