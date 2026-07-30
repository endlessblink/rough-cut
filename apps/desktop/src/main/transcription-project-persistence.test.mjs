import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createProjectForRecording,
  openProjectFile,
  saveProjectFile,
} from './project-files.mjs';
import { persistTranscriptToProject } from './transcription-project-persistence.mjs';

const recording = {
  state: 'saved',
  startedAt: '2026-07-29T10:00:00.000Z',
  stoppedAt: '2026-07-29T10:00:04.000Z',
  outputPath: '/tmp/transcript-recording.mp4',
  width: 1920,
  height: 1080,
  fps: 30,
  audio: { micSource: 'fixture-mic' },
  cursorTelemetryPath: '/tmp/transcript-recording.cursor.json',
  cursorEvents: [],
};

const transcript = {
  words: [
    { word: 'const', startFrame: 0, endFrame: 8, confidence: 0.99 },
    { word: 'value', startFrame: 9, endFrame: 18, confidence: 0.98 },
  ],
  paragraphs: [{ text: 'const value', startFrame: 0, endFrame: 18 }],
  nonSpeech: [{ kind: 'silence', startFrame: 19, endFrame: 30 }],
};
const provenance = {
  jobId: 'job-local',
  provider: {
    kind: 'local',
    id: 'sona-local',
    model: 'ggml-model.bin',
  },
  fps: 30,
};

test('finalized transcript and explicit local provider survive atomic save and reopen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rough-cut-transcript-project-'));
  try {
    const projectPath = join(dir, 'session.roughcut');
    await saveProjectFile(projectPath, createProjectForRecording({ recording }));

    await persistTranscriptToProject({
      projectPath,
      transcript,
      ...provenance,
    });
    const reopened = await openProjectFile(projectPath);

    assert.deepEqual(reopened.document.transcript, transcript);
    assert.deepEqual(reopened.document.transcription, {
      jobId: 'job-local',
      provider: {
        kind: 'local',
        id: 'sona-local',
        model: 'ggml-model.bin',
      },
      fps: 30,
    });
    assert.equal(reopened.document.timeline.tracks.length > 0, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('identical transcript is idempotent and does not rewrite the project', async () => {
  const document = {
    id: 'project',
    transcript,
    transcription: provenance,
  };
  let saves = 0;
  const result = await persistTranscriptToProject({
    projectPath: '/projects/session.roughcut',
    transcript: structuredClone(transcript),
    ...provenance,
    openProject: async () => ({ path: '/projects/session.roughcut', document }),
    saveProject: async () => {
      saves += 1;
    },
  });

  assert.equal(saves, 0);
  assert.equal(result.document, document);
  assert.equal(result.changed, false);
});

test('persistence preserves unrelated project state', async () => {
  const document = {
    id: 'project',
    name: 'Live coding',
    transcript: undefined,
    timeline: { effects: [{ id: 'stabilization-effect' }] },
  };
  let saved;
  await persistTranscriptToProject({
    projectPath: '/projects/session.roughcut',
    transcript,
    ...provenance,
    openProject: async () => ({ document }),
    saveProject: async (_path, next) => {
      saved = next;
      return { path: '/projects/session.roughcut', document: next };
    },
  });

  assert.deepEqual(saved.timeline, document.timeline);
  assert.equal(saved.name, 'Live coding');
  assert.deepEqual(saved.transcript, transcript);
});
