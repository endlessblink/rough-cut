import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSourceVolumePercent } from './audio-sources.mjs';
import { _peekRegistrySize, _clearRegistry } from './source-volume-registry.mjs';

test('parseSourceVolumePercent reads front-left percent from pactl block', () => {
  const block = `
Source #62
\tState: RUNNING
\tName: alsa_input.usb-Samson_Q2U-00.analog-stereo
\tDescription: Samson Q2U Microphone Analog Stereo
\tSample Specification: s16le 2ch 48000Hz
\tVolume: front-left: 45746 /  70% / -9.37 dB,   front-right: 45746 /  70% / -9.37 dB
\t        balance 0.00
`;
  assert.equal(parseSourceVolumePercent(block), 70);
});

test('parseSourceVolumePercent handles 100% volume', () => {
  const block = 'Volume: front-left: 65536 / 100% / 0.00 dB';
  assert.equal(parseSourceVolumePercent(block), 100);
});

test('parseSourceVolumePercent handles 0% volume', () => {
  const block = 'Volume: front-left:     0 /   0% / -inf dB';
  assert.equal(parseSourceVolumePercent(block), 0);
});

test('parseSourceVolumePercent returns null when no Volume line is present', () => {
  assert.equal(parseSourceVolumePercent('Source #62\n\tState: RUNNING'), null);
});

test('source-volume-registry starts empty and clears cleanly', () => {
  _clearRegistry();
  assert.equal(_peekRegistrySize(), 0);
});
