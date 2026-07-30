import {
  clearCleanupSessionSnapshot,
  computeTimelineDuration,
} from '@rough-cut/project-model';
import { rippleDeleteRecordingRange } from '../recording-timeline.mjs';

export function finalizeCleanupDraftProject(project, projection) {
  if (projection.compressions.length > 0) {
    throw new Error(
      'Wait compression cannot be finalized until preview and export support it',
    );
  }
  if (projection.removals.length === 0) return project;
  const document = project.document;
  const recordingAssetId =
    document.assets.find((asset) => asset.type === 'recording')?.id ?? null;
  if (!recordingAssetId) {
    throw new Error('Cleanup finalization needs a recording asset');
  }
  const editedDocument = [...projection.removals]
    .sort((left, right) => right.startFrame - left.startFrame)
    .reduce(
      (current, range) =>
        rippleDeleteRecordingRange(current, {
          assetId: recordingAssetId,
          startFrame: range.startFrame,
          endFrame: range.endFrame,
        }),
      document,
    );
  const finalizedDuration = Math.max(
    1,
    computeTimelineDuration(editedDocument.timeline),
  );
  const durationAlignedDocument = {
    ...editedDocument,
    composition: {
      ...editedDocument.composition,
      duration: finalizedDuration,
    },
  };
  return {
    ...project,
    document: clearCleanupSessionSnapshot(
      durationAlignedDocument,
      recordingAssetId,
    ),
  };
}
