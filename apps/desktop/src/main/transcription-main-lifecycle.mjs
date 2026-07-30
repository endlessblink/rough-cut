export function createRecordingTranscriptionLifecycle({ getBridge }) {
  if (typeof getBridge !== 'function') {
    throw new Error('Transcription lifecycle requires a bridge resolver');
  }
  return {
    async recordingStarted(status) {
      await (await getBridge())?.recordingStarted(status);
    },
    async recordingProgress(status) {
      await (await getBridge())?.recordingProgress(status);
    },
    async recordingStopping(status) {
      (await getBridge())?.recordingStopping(status);
    },
    async recordingStopped(result) {
      await (await getBridge())?.recordingStopped(result);
    },
  };
}

export function createRecordingTranscriptPersistence({
  validateProjectPath,
  getAllowedRoots,
  enqueueProjectOp,
  persistTranscript,
}) {
  if (
    typeof validateProjectPath !== 'function' ||
    typeof getAllowedRoots !== 'function' ||
    typeof enqueueProjectOp !== 'function' ||
    typeof persistTranscript !== 'function'
  ) {
    throw new Error('Recording transcript persistence dependencies are required');
  }
  return (input) => {
    const safePath = validateProjectPath(input.projectPath, {
      allowedRoots: getAllowedRoots(),
    });
    return enqueueProjectOp(safePath, () =>
      persistTranscript({ ...input, projectPath: safePath }),
    );
  };
}
