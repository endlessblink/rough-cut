export function findStabilizationTarget(project, block) {
  const sourceId = typeof block?.mediaId === 'string' ? block.mediaId : null;
  const source = project?.document?.timeline?.sources?.find((entry) => entry?.id === sourceId);
  const assetId = source?.assetId ?? block?.assetId;
  const asset = project?.document?.assets?.find((entry) => entry?.id === assetId);
  if (!sourceId || !assetId || asset?.type !== 'video') return null;
  const cameraAssetId = project?.recording?.camera?.assetId;
  return {
    sourceId,
    assetId,
    isCamera: assetId === cameraAssetId || asset?.metadata?.isCamera === true,
  };
}

export function stabilizationStatusLabel(status) {
  if (!status || status.phase === 'idle') return 'Ready when enabled';
  if (status.phase === 'ready') return 'Exact preview ready';
  if (status.phase === 'analyzing') return `Analyzing movement ${percent(status.progress)}`;
  if (status.phase === 'encoding') return `Building exact preview ${percent(status.progress)}`;
  if (status.phase === 'cancelled') return 'Preview cancelled';
  if (status.phase === 'unsupported') return status.error || 'Stabilization is unavailable';
  if (status.phase === 'failed') return `Could not stabilize: ${status.error || 'Try again'}`;
  return 'Preparing exact preview';
}

function percent(value) {
  return `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`;
}
