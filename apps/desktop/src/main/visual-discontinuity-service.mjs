import { readAnalysisFrames } from './censor-tracking.mjs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export function resolveReferencedVisualSource({
  projectPath,
  sourcePath,
  assets,
}) {
  const resolvedSource = resolve(
    isAbsolute(sourcePath)
      ? sourcePath
      : join(dirname(projectPath), sourcePath),
  );
  const referenced = assets.some((asset) => {
    if (typeof asset?.filePath !== 'string' || !asset.filePath) return false;
    const assetPath = isAbsolute(asset.filePath)
      ? asset.filePath
      : join(dirname(projectPath), asset.filePath);
    return resolve(assetPath) === resolvedSource;
  });
  if (!referenced) {
    throw new Error(
      'visual-discontinuity: sourcePath is not referenced by the project',
    );
  }
  return resolvedSource;
}

export async function inspectVisualDiscontinuity({
  sourcePath,
  beforeFrame,
  afterFrame,
  fps = 30,
  warningThreshold = 0.22,
  readFrames = readAnalysisFrames,
}) {
  if (typeof sourcePath !== 'string' || !sourcePath) {
    throw new Error('Visual discontinuity inspection needs a source recording');
  }
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 30;
  const safeBeforeFrame = normalizeFrame(beforeFrame);
  const safeAfterFrame = normalizeFrame(afterFrame);
  const [before, after] = await Promise.all([
    readFrames({
      sourcePath,
      startFrame: safeBeforeFrame,
      frameCount: 1,
      fps: safeFps,
      analysisWidth: 160,
    }),
    readFrames({
      sourcePath,
      startFrame: safeAfterFrame,
      frameCount: 1,
      fps: safeFps,
      analysisWidth: 160,
    }),
  ]);
  const beforeSample = before.frames[0];
  const afterSample = after.frames[0];
  if (
    !beforeSample ||
    !afterSample ||
    beforeSample.length !== afterSample.length ||
    beforeSample.length === 0
  ) {
    throw new Error('Visual discontinuity inspection could not read both frames');
  }
  let difference = 0;
  for (let index = 0; index < beforeSample.length; index += 1) {
    difference += Math.abs(beforeSample[index] - afterSample[index]);
  }
  const score = difference / (beforeSample.length * 255);
  return {
    score,
    warning: score >= warningThreshold,
    beforeFrame: safeBeforeFrame,
    afterFrame: safeAfterFrame,
  };
}

function normalizeFrame(value) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}
