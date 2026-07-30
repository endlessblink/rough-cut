import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTranscriptionProvider,
  shouldSuspendTranscription,
  transcriptionFeatureEnabled,
} from './transcription-policy.mjs';

test('transcription is enabled by default and can be explicitly disabled', () => {
  assert.equal(transcriptionFeatureEnabled({}), true);
  assert.equal(transcriptionFeatureEnabled({ ROUGH_CUT_SMART_ROUGH_CUT: '0' }), false);
  assert.equal(transcriptionFeatureEnabled({ ROUGH_CUT_SMART_ROUGH_CUT: 'true' }), true);
  assert.equal(transcriptionFeatureEnabled({ ROUGH_CUT_SMART_ROUGH_CUT: '1' }), true);
});

test('provider policy always prefers an available local provider', () => {
  assert.deepEqual(
    resolveTranscriptionProvider({
      localProvider: { id: 'whisper-local', model: 'small' },
      cloudEnabled: true,
      cloudProvider: { id: 'cloud', model: 'large' },
    }),
    { kind: 'local', id: 'whisper-local', model: 'small' },
  );
});

test('cloud provider is used only after explicit opt-in', () => {
  assert.deepEqual(
    resolveTranscriptionProvider({
      localProvider: null,
      cloudEnabled: false,
      cloudProvider: { id: 'cloud', model: 'large' },
    }),
    null,
  );
  assert.deepEqual(
    resolveTranscriptionProvider({
      localProvider: null,
      cloudEnabled: true,
      cloudProvider: { id: 'cloud', model: 'large' },
    }),
    { kind: 'cloud', id: 'cloud', model: 'large' },
  );
});

test('capture health suspends analysis before recording quality degrades further', () => {
  assert.equal(
    shouldSuspendTranscription({
      recordingState: 'idle',
      frameDrops: 12,
      queueWarnings: 2,
    }),
    false,
  );
  assert.equal(
    shouldSuspendTranscription({
      recordingState: 'recording',
      frameDrops: 1,
      previousFrameDrops: 0,
    }),
    true,
  );
  assert.equal(
    shouldSuspendTranscription({
      recordingState: 'recording',
      queueWarnings: 1,
    }),
    true,
  );
  assert.equal(
    shouldSuspendTranscription({
      recordingState: 'recording',
      captureFps: 24,
      targetFps: 30,
    }),
    true,
  );
});

test('healthy or incomplete capture telemetry does not suspend analysis', () => {
  assert.equal(
    shouldSuspendTranscription({
      recordingState: 'recording',
      frameDrops: 0,
      previousFrameDrops: 0,
      queueWarnings: 0,
      captureFps: 29.5,
      targetFps: 30,
    }),
    false,
  );
  assert.equal(shouldSuspendTranscription({ recordingState: 'recording' }), false);
});
