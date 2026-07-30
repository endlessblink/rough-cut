import {
  resolveTranscriptionProvider,
  shouldSuspendTranscription,
} from './transcription-policy.mjs';

export function createTranscriptionService({
  enabled,
  store,
  runner,
  localProvider,
  cloudEnabled = false,
  cloudProvider = null,
  persistTranscript = null,
}) {
  if (!store || typeof store.create !== 'function') {
    throw new Error('Transcription service requires a job store');
  }
  if (!runner || typeof runner.run !== 'function') {
    throw new Error('Transcription service requires a job runner');
  }

  let captureSuspended = false;
  const activeRuns = new Map();
  const preparedFinalizations = new Set();

  async function persistCompletedJob(job) {
    if (
      typeof persistTranscript !== 'function' ||
      job?.status !== 'completed' ||
      !job.projectPath ||
      job.projectPersistedAt !== undefined
    ) {
      return job;
    }
    await persistTranscript({
      jobId: job.id,
      projectPath: job.projectPath,
      transcript: job.transcript,
      provider: job.provider,
      fps: job.fps,
    });
    return await store.markProjectPersisted(job.id);
  }

  function runOnce(jobId, options) {
    const active = activeRuns.get(jobId);
    if (active) return active;
    const operation = runner.run(jobId, options);
    activeRuns.set(jobId, operation);
    const clear = () => {
      if (activeRuns.get(jobId) === operation) activeRuns.delete(jobId);
    };
    operation.then(clear, clear);
    return operation;
  }

  async function initialize() {
    if (!enabled) return [];
    const recovered = await store.recoverInterrupted();
    await runner.setCaptureSafe(true);
    const jobs = await store.list();
    for (const job of jobs) {
      if (
        job.status === 'queued' &&
        job.projectPath &&
        Number.isFinite(job.totalMs) &&
        job.totalMs > 0
      ) {
        await persistCompletedJob(
          await runOnce(job.id, { totalMs: job.totalMs, finalize: true }),
        );
        continue;
      }
      await persistCompletedJob(job);
    }
    return recovered;
  }

  async function beginRecording({ sourcePath, fps }) {
    if (!enabled) return { state: 'disabled', job: null };
    const provider = resolveTranscriptionProvider({
      localProvider,
      cloudEnabled,
      cloudProvider,
    });
    if (!provider) return { state: 'unavailable', job: null };

    const job = await store.create({
      sourcePath,
      projectPath: null,
      provider,
      fps,
    });
    return { state: 'queued', job };
  }

  async function processAvailable(jobId, totalMs) {
    if (!enabled || captureSuspended) return null;
    return await runOnce(jobId, { totalMs, finalize: false });
  }

  async function updateCaptureHealth(health) {
    if (!enabled || captureSuspended) return captureSuspended;
    if (!shouldSuspendTranscription(health)) return false;
    captureSuspended = true;
    await runner.setCaptureSafe(false);
    return true;
  }

  async function prepareRecordingFinalization({ jobId, projectPath, totalMs }) {
    if (!enabled) return null;
    captureSuspended = false;
    if (!jobId) {
      await runner.setCaptureSafe(true);
      return null;
    }
    const job = await store.attachProject(jobId, projectPath, totalMs);
    await runner.setCaptureSafe(true);
    await activeRuns.get(jobId);
    preparedFinalizations.add(jobId);
    return job;
  }

  async function finishRecording({ jobId, projectPath, totalMs }) {
    if (!enabled) return null;
    if (!jobId) {
      return await prepareRecordingFinalization({ jobId, projectPath, totalMs });
    }
    if (!preparedFinalizations.delete(jobId)) {
      await prepareRecordingFinalization({ jobId, projectPath, totalMs });
      preparedFinalizations.delete(jobId);
    }
    return await persistCompletedJob(await runOnce(jobId, { totalMs, finalize: true }));
  }

  async function cancelRecording(jobId) {
    if (!enabled) return null;
    captureSuspended = false;
    const cancellation = jobId ? runner.cancel(jobId) : null;
    if (jobId) preparedFinalizations.delete(jobId);
    await activeRuns.get(jobId);
    const result = cancellation ? await cancellation : null;
    await runner.setCaptureSafe(true);
    return result;
  }

  return {
    initialize,
    beginRecording,
    processAvailable,
    updateCaptureHealth,
    prepareRecordingFinalization,
    finishRecording,
    cancelRecording,
    isCaptureSuspended() {
      return captureSuspended;
    },
  };
}
