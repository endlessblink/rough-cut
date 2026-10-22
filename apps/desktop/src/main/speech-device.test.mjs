import assert from 'node:assert/strict';
import test from 'node:test';
import { fasterWhisperDevice } from './speech-device.mjs';

test('speech runs on CUDA by default, on the CPU on a Mac, and the env always wins', () => {
  assert.deepEqual(fasterWhisperDevice({ env: {}, platform: 'linux' }), { device: 'cuda', computeType: 'int8_float16' });
  assert.deepEqual(fasterWhisperDevice({ env: {}, platform: 'win32' }), { device: 'cuda', computeType: 'int8_float16' });
  assert.deepEqual(fasterWhisperDevice({ env: {}, platform: 'darwin' }), { device: 'cpu', computeType: 'int8' });
  assert.deepEqual(
    fasterWhisperDevice({ env: { ROUGH_CUT_FASTER_WHISPER_DEVICE: 'cpu', ROUGH_CUT_FASTER_WHISPER_COMPUTE_TYPE: 'float32' }, platform: 'linux' }),
    { device: 'cpu', computeType: 'float32' },
  );
});
