import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./index.mjs', import.meta.url), 'utf8');

test('main process wires transcription through every recording lifecycle path', () => {
  assert.match(source, /createTranscriptionRuntime\(\{/);
assert.match(source, /createRecordingTranscriptionBridge\(\{/);
assert.match(source, /IPC_CHANNELS\.TRANSCRIPTION_TRANSCRIBE_PROJECT/);
assert.match(source, /IPC_CHANNELS\.TRANSCRIPTION_PROGRESS/);
  assert.match(source, /createRecordingTranscriptionLifecycle\(\{/);
  assert.match(source, /recordingTranscriptionLifecycle\.recordingStarted\(status\)/);
  assert.match(source, /recordingTranscriptionLifecycle\.recordingProgress\(status\)/);
  assert.match(source, /recordingTranscriptionLifecycle\.recordingStopped\(result\)/);
  assert.match(
    source,
    /await recordingTranscriptionLifecycle\.recordingStopped\(result\)[\s\S]*openProjectFile\(result\.project\.path\)/,
  );
  assert.match(source, /recordingRestarted\(status\)/);
  assert.match(
    source,
    /finalRecordingStatus = recordingSession\.status\(\)[\s\S]*recordingTranscriptionLifecycle\.recordingStopping\(finalRecordingStatus\)[\s\S]*stopRecordingAndCreateProject\(\{/,
  );
  assert.match(
    source,
    /persistTranscript: persistRecordingTranscript[\s\S]*createRecordingTranscriptPersistence\(\{[\s\S]*enqueueProjectOp/,
  );

  const cancellationCalls = source.match(/recordingCancelled\(\)/g) ?? [];
  assert.ok(
    cancellationCalls.length >= 3,
    'visible cancel, hidden cancel, and hidden restart all discard active transcription',
  );
});
