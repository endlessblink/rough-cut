function positiveNumber(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return value;
}

function errorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function isAbortError(error) {
  return error?.name === 'AbortError';
}

export function createTranscriptionJobRunner({
  store,
  transcribeChunk,
  chunkDurationMs = 15_000,
  onStateChange = () => undefined,
}) {
  if (!store || typeof store.get !== 'function') {
    throw new Error('Transcription job store is required');
  }
  if (typeof transcribeChunk !== 'function') {
    throw new Error('Transcription chunk provider is required');
  }
  positiveNumber(chunkDurationMs, 'Transcription chunk duration');

  const activeControllers = new Map();

  async function emit(job) {
    await onStateChange(job);
    return job;
  }

  async function run(id, { totalMs, finalize = true }) {
    positiveNumber(totalMs, 'Transcription total duration');
    if (activeControllers.has(id)) {
      throw new Error(`Transcription job is already running: ${id}`);
    }
    const controller = new AbortController();
    activeControllers.set(id, controller);

    try {
      let job = await store.get(id);
      if (!job) throw new Error(`Transcription job not found: ${id}`);
      if (job.status === 'queued') job = await emit(await store.start(id));
      if (job.status !== 'running') return job;

      while (job.checkpointMs < totalMs) {
        const startMs = job.checkpointMs;
        const endMs = Math.min(totalMs, startMs + chunkDurationMs);
        const chunk = await transcribeChunk({
          job,
          sourcePath: job.sourcePath,
          provider: job.provider,
          fps: job.fps,
          startMs,
          endMs,
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          throw new DOMException('Transcription suspended', 'AbortError');
        }

        job = await emit(
          await store.appendProgress(id, {
            checkpointMs: endMs,
            totalMs,
            words: chunk?.words,
            paragraphs: chunk?.paragraphs,
            nonSpeech: chunk?.nonSpeech,
          }),
        );
      }

      return await emit(finalize ? await store.complete(id) : await store.park(id));
    } catch (error) {
      if (isAbortError(error)) {
        const paused = await store.get(id);
        if (paused) return await emit(paused);
        throw error;
      }
      const current = await store.get(id);
      if (current && !['completed', 'cancelled', 'failed'].includes(current.status)) {
        await emit(await store.fail(id, errorMessage(error)));
      }
      throw error;
    } finally {
      activeControllers.delete(id);
    }
  }

  async function setCaptureSafe(isSafe) {
    const jobs = await store.setCaptureSafe(isSafe);
    if (!isSafe) {
      for (const controller of activeControllers.values()) {
        controller.abort(new DOMException('Capture quality takes priority', 'AbortError'));
      }
    }
    for (const job of jobs) await onStateChange(job);
    return jobs;
  }

  async function cancel(id) {
    activeControllers.get(id)?.abort(new DOMException('Transcription cancelled', 'AbortError'));
    return await emit(await store.cancel(id));
  }

  return {
    run,
    cancel,
    setCaptureSafe,
    isRunning(id) {
      return activeControllers.has(id);
    },
  };
}
