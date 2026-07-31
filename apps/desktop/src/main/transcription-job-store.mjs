import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const FILE_VERSION = 1;
const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'failed']);
const ACTIVE_STATUSES = new Set(['queued', 'running']);

function randomId() {
  return `transcription_${randomBytes(8).toString('hex')}`;
}

function emptyTranscript() {
  return { words: [], paragraphs: [], nonSpeech: [] };
}

function clone(value) {
  return structuredClone(value);
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function requirePositiveNumber(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return value;
}

function requireNonNegativeNumber(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
  return value;
}

function isJob(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.sourcePath === 'string' &&
    typeof value.status === 'string' &&
    Number.isFinite(value.checkpointMs) &&
    value.transcript &&
    Array.isArray(value.transcript.words) &&
    Array.isArray(value.transcript.paragraphs) &&
    Array.isArray(value.transcript.nonSpeech)
  );
}

function mergeUnique(current, incoming, keyFor) {
  if (!incoming?.length) return current;
  const seen = new Set(current.map(keyFor));
  const merged = [...current];
  for (const item of incoming) {
    const key = keyFor(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(clone(item));
  }
  merged.sort((left, right) => left.startFrame - right.startFrame || left.endFrame - right.endFrame);
  return merged;
}

function wordKey(word) {
  return `${word.startFrame}:${word.endFrame}:${word.word}`;
}

function paragraphKey(paragraph) {
  return `${paragraph.startFrame}:${paragraph.endFrame}:${paragraph.text}`;
}

function nonSpeechKey(segment) {
  return `${segment.startFrame}:${segment.endFrame}:${segment.kind}`;
}

function validFrameRange(value) {
  return (
    value &&
    Number.isInteger(value.startFrame) &&
    Number.isInteger(value.endFrame) &&
    value.startFrame >= 0 &&
    value.endFrame >= value.startFrame
  );
}

function validateTranscriptItems(progress) {
  for (const word of progress.words ?? []) {
    if (
      !validFrameRange(word) ||
      typeof word.word !== 'string' ||
      !word.word.trim() ||
      !Number.isFinite(word.confidence) ||
      word.confidence < 0 ||
      word.confidence > 1
    ) {
      throw new Error('Invalid transcript word in transcription progress');
    }
  }
  for (const paragraph of progress.paragraphs ?? []) {
    if (
      !validFrameRange(paragraph) ||
      typeof paragraph.text !== 'string' ||
      !paragraph.text.trim()
    ) {
      throw new Error('Invalid transcript paragraph in transcription progress');
    }
  }
  for (const segment of progress.nonSpeech ?? []) {
    if (
      !validFrameRange(segment) ||
      !['silence', 'music', 'noise', 'unrecognized'].includes(segment.kind)
    ) {
      throw new Error('Invalid non-speech segment in transcription progress');
    }
  }
}

export function createTranscriptionJobStore({
  filePath,
  now = () => Date.now(),
  createId = randomId,
  onLog = () => undefined,
}) {
  requireString(filePath, 'Transcription jobs file path');
  let operationQueue = Promise.resolve();

  function queue(operation) {
    const next = operationQueue.then(operation, operation);
    operationQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async function readJobs() {
    try {
      const parsed = JSON.parse(await readFile(filePath, 'utf8'));
      if (
        parsed?.version !== FILE_VERSION ||
        !Array.isArray(parsed.jobs) ||
        !parsed.jobs.every(isJob)
      ) {
        const error = new Error(`Transcription jobs file is malformed: ${filePath}`);
        onLog(`[transcription-jobs] ${error.message}`);
        throw error;
      }
      return parsed.jobs;
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      if (error?.message?.startsWith('Transcription jobs file is malformed:')) throw error;
      onLog(`[transcription-jobs] read failed: ${error?.message ?? error}`);
      throw new Error(`Could not read transcription jobs file: ${filePath}`, { cause: error });
    }
  }

  async function writeJobs(jobs) {
    await mkdir(dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(
      temporaryPath,
      JSON.stringify({ version: FILE_VERSION, jobs }, null, 2),
      'utf8',
    );
    await rename(temporaryPath, filePath);
  }

  async function mutateJob(id, update) {
    const jobs = await readJobs();
    const index = jobs.findIndex((job) => job.id === id);
    if (index < 0) throw new Error(`Transcription job not found: ${id}`);
    const next = update(jobs[index]);
    jobs[index] = next;
    await writeJobs(jobs);
    return clone(next);
  }

  function rejectTerminal(job, action) {
    if (TERMINAL_STATUSES.has(job.status)) {
      throw new Error(`Cannot ${action} terminal transcription job ${job.id}`);
    }
  }

  return {
    create(input) {
      return queue(async () => {
        const jobs = await readJobs();
        const timestamp = now();
        const provider = input?.provider;
        if (!provider || !['local', 'cloud'].includes(provider.kind)) {
          throw new Error('Transcription provider kind must be local or cloud');
        }
        const job = {
          id: requireString(createId(), 'Transcription job id'),
          sourcePath: requireString(input.sourcePath, 'Recording source path'),
          projectPath:
            input.projectPath == null ? null : requireString(input.projectPath, 'Project path'),
          provider: {
            kind: provider.kind,
            id: requireString(provider.id, 'Transcription provider id'),
            model: requireString(provider.model, 'Transcription model'),
          },
          fps: requirePositiveNumber(input.fps, 'Transcription fps'),
          status: 'queued',
          checkpointMs: 0,
          recoveryCount: 0,
          transcript: emptyTranscript(),
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        jobs.push(job);
        await writeJobs(jobs);
        return clone(job);
      });
    },

    list() {
      return queue(async () => clone(await readJobs()));
    },

    get(id) {
      return queue(async () => {
        const jobs = await readJobs();
        const job = jobs.find((candidate) => candidate.id === id);
        return job ? clone(job) : null;
      });
    },

    start(id) {
      return queue(() =>
        mutateJob(id, (job) => {
          rejectTerminal(job, 'start');
          if (job.status !== 'queued') {
            throw new Error(`Cannot start transcription job from ${job.status}`);
          }
          const timestamp = now();
          return {
            ...job,
            status: 'running',
            startedAt: job.startedAt ?? timestamp,
            updatedAt: timestamp,
          };
        }),
      );
    },

    appendProgress(id, progress) {
      return queue(() =>
        mutateJob(id, (job) => {
          rejectTerminal(job, 'append progress to');
          if (job.status !== 'running') {
            throw new Error(`Cannot append progress while transcription job is ${job.status}`);
          }
          validateTranscriptItems(progress);
          const checkpointMs = Math.max(
            job.checkpointMs,
            requireNonNegativeNumber(progress.checkpointMs, 'Transcription checkpoint'),
          );
          const totalMs =
            progress.totalMs === undefined
              ? job.totalMs
              : requireNonNegativeNumber(progress.totalMs, 'Transcription total duration');
          return {
            ...job,
            checkpointMs,
            ...(totalMs === undefined ? {} : { totalMs }),
            transcript: {
              words: mergeUnique(job.transcript.words, progress.words, wordKey),
              paragraphs: mergeUnique(
                job.transcript.paragraphs,
                progress.paragraphs,
                paragraphKey,
              ),
              nonSpeech: mergeUnique(
                job.transcript.nonSpeech,
                progress.nonSpeech,
                nonSpeechKey,
              ),
            },
            updatedAt: now(),
          };
        }),
      );
    },

    attachProject(id, projectPath, totalMs) {
      return queue(() =>
        mutateJob(id, (job) => ({
          ...job,
          projectPath: requireString(projectPath, 'Project path'),
          ...(totalMs === undefined
            ? {}
            : {
              totalMs: requireNonNegativeNumber(
                totalMs,
                'Transcription total duration',
              ),
            }),
          updatedAt: now(),
        })),
      );
    },

    pause(id) {
      return queue(() =>
        mutateJob(id, (job) => {
          rejectTerminal(job, 'pause');
          if (job.status === 'paused' && job.pauseReason === 'manual') return job;
          if (!ACTIVE_STATUSES.has(job.status)) {
            throw new Error(`Cannot pause transcription job from ${job.status}`);
          }
          return { ...job, status: 'paused', pauseReason: 'manual', updatedAt: now() };
        }),
      );
    },

    resume(id) {
      return queue(() =>
        mutateJob(id, (job) => {
          rejectTerminal(job, 'resume');
          if (job.status !== 'paused') {
            throw new Error(`Cannot resume transcription job from ${job.status}`);
          }
          const { pauseReason: _pauseReason, ...rest } = job;
          return { ...rest, status: 'queued', updatedAt: now() };
        }),
      );
    },

    park(id) {
      return queue(() =>
        mutateJob(id, (job) => {
          rejectTerminal(job, 'park');
          if (job.status !== 'running') {
            throw new Error(`Cannot park transcription job from ${job.status}`);
          }
          return { ...job, status: 'queued', updatedAt: now() };
        }),
      );
    },

    cancel(id) {
      return queue(() =>
        mutateJob(id, (job) => {
          rejectTerminal(job, 'cancel');
          const timestamp = now();
          return { ...job, status: 'cancelled', completedAt: timestamp, updatedAt: timestamp };
        }),
      );
    },

    complete(id) {
      return queue(() =>
        mutateJob(id, (job) => {
          rejectTerminal(job, 'complete');
          if (job.status !== 'running') {
            throw new Error(`Cannot complete transcription job from ${job.status}`);
          }
          const timestamp = now();
          return { ...job, status: 'completed', completedAt: timestamp, updatedAt: timestamp };
        }),
      );
    },

    fail(id, message) {
      return queue(() =>
        mutateJob(id, (job) => {
          rejectTerminal(job, 'fail');
          const timestamp = now();
          return {
            ...job,
            status: 'failed',
            error: requireString(message, 'Transcription failure message'),
            completedAt: timestamp,
            updatedAt: timestamp,
          };
        }),
      );
    },

    markProjectPersisted(id) {
      return queue(() =>
        mutateJob(id, (job) => {
          if (job.status !== 'completed') {
            throw new Error(`Cannot mark project persisted while transcription job is ${job.status}`);
          }
          if (job.projectPersistedAt !== undefined) return job;
          const timestamp = now();
          return { ...job, projectPersistedAt: timestamp, updatedAt: timestamp };
        }),
      );
    },

    setCaptureSafe(isSafe) {
      return queue(async () => {
        const jobs = await readJobs();
        let changed = false;
        const updated = jobs.map((job) => {
          if (!isSafe && ACTIVE_STATUSES.has(job.status)) {
            changed = true;
            return {
              ...job,
              status: 'paused',
              pauseReason: 'capture-load',
              updatedAt: now(),
            };
          }
          if (isSafe && job.status === 'paused' && job.pauseReason === 'capture-load') {
            const { pauseReason: _pauseReason, ...rest } = job;
            changed = true;
            return { ...rest, status: 'queued', updatedAt: now() };
          }
          return job;
        });
        if (changed) await writeJobs(updated);
        return clone(updated);
      });
    },

    recoverInterrupted() {
      return queue(async () => {
        const jobs = await readJobs();
        const recoveredIds = new Set();
        const updated = jobs.map((job) => {
          if (job.status !== 'running') return job;
          recoveredIds.add(job.id);
          return {
            ...job,
            status: 'queued',
            recoveryCount: (job.recoveryCount ?? 0) + 1,
            updatedAt: now(),
          };
        });
        if (recoveredIds.size > 0) await writeJobs(updated);
        return clone(updated.filter((job) => recoveredIds.has(job.id)));
      });
    },
  };
}

export function defaultTranscriptionJobsPath(userDataDir) {
  return join(userDataDir, 'transcription-jobs.json');
}
