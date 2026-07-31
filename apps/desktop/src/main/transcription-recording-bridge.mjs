export function createRecordingTranscriptionBridge({
  service,
  fixtureDurationMs = null,
  incrementalChunkDurationMs = 15_000,
  incrementalDuringCapture = true,
  dispose = () => undefined,
  onLog = () => undefined,
}) {
  let activeJobId = null;
  let lastAvailableMs = 0;
  let lastIncrementalRequestMs = 0;

  async function failOpen(label, operation) {
    try {
      return await operation();
    } catch (error) {
      onLog(`[transcription] ${label} failed: ${error?.message ?? error}`);
      return null;
    }
  }

  async function initialize() {
    if (!service) return [];
    return (await failOpen('startup recovery', () => service.initialize())) ?? [];
  }

  async function recordingStarted(status) {
    if (!service || status?.state !== 'recording') return null;
    if (!status.micSource && !status.systemAudioSource) {
      activeJobId = null;
      return { state: 'unavailable', job: null };
    }
    lastAvailableMs = Math.max(0, status.recordedDurationMs ?? 0);
    lastIncrementalRequestMs = 0;
    const result = await failOpen('recording start', () =>
      service.beginRecording({
        sourcePath: status.rawPath,
        fps: status.fps,
      }),
    );
    activeJobId = result?.job?.id ?? null;
    return result;
  }

  async function recordingProgress(status) {
    if (!service || !activeJobId || status?.state !== 'recording') return null;
    const suspended = await failOpen('capture health update', () =>
      service.updateCaptureHealth(status),
    );
    if (suspended) return null;
    const recordedDurationMs = Math.max(0, status.recordedDurationMs ?? 0);
    const availableMs =
      fixtureDurationMs == null
        ? recordedDurationMs
        : Math.min(recordedDurationMs, fixtureDurationMs);
    lastAvailableMs = Math.max(lastAvailableMs, availableMs);
    if (availableMs <= 0) return null;
    if (!incrementalDuringCapture) return null;
    const processThroughMs =
      fixtureDurationMs == null
        ? Math.floor(availableMs / incrementalChunkDurationMs) * incrementalChunkDurationMs
        : availableMs;
    if (processThroughMs <= lastIncrementalRequestMs) return null;
    lastIncrementalRequestMs = processThroughMs;
    return await failOpen('incremental progress', () =>
      service.processAvailable(activeJobId, processThroughMs),
    );
  }

  function recordingStopping(status) {
    if (status?.state !== 'recording') return;
    const recordedDurationMs = Math.max(0, status.recordedDurationMs ?? 0);
    const availableMs =
      fixtureDurationMs == null
        ? recordedDurationMs
        : Math.min(recordedDurationMs, fixtureDurationMs);
    lastAvailableMs = Math.max(lastAvailableMs, availableMs);
  }

  async function recordingStopped(result) {
    if (!service) return null;
    const jobId = activeJobId;
    activeJobId = null;
    const totalMs = lastAvailableMs;
    lastAvailableMs = 0;
    lastIncrementalRequestMs = 0;
    if (result?.state !== 'saved' || !result.project?.path || totalMs <= 0) {
      await failOpen('recording stop cleanup', () => service.cancelRecording(jobId));
      return null;
    }
    await failOpen('recording finalization checkpoint', () =>
      service.prepareRecordingFinalization({
        jobId,
        projectPath: result.project.path,
        totalMs,
      }),
    );
    if (result.finalizationPromise) {
      await failOpen('recording finalization wait', () => result.finalizationPromise);
    }
    return await failOpen('recording finalization', () =>
      service.finishRecording({
        jobId,
        projectPath: result.project.path,
        totalMs,
      }),
    );
  }

  async function recordingCancelled() {
    if (!service) return null;
    const jobId = activeJobId;
    activeJobId = null;
    lastAvailableMs = 0;
    lastIncrementalRequestMs = 0;
    return await failOpen('recording cancellation', () => service.cancelRecording(jobId));
  }

  async function recordingRestarted(status) {
    await recordingCancelled();
    return await recordingStarted(status);
  }

  async function transcribeExisting(input) {
    if (!service?.transcribeExisting) {
      return { state: 'unavailable', job: null };
    }
    return await service.transcribeExisting(input);
  }

  return {
    initialize,
    recordingStarted,
    recordingProgress,
    recordingStopping,
    recordingStopped,
    recordingCancelled,
    recordingRestarted,
    transcribeExisting,
    dispose,
    getActiveJobId() {
      return activeJobId;
    },
  };
}
