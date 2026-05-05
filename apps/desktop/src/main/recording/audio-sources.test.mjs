import test from 'node:test';
import assert from 'node:assert/strict';
import { listPulseAudioMicSources, listPulseAudioSystemAudioSources, parsePulseAudioSources } from './audio-sources.mjs';

const pactlOutput = `61\talsa_output.usb-Samson_Technologies_Samson_Q2U_Microphone-00.analog-stereo.monitor\tPipeWire\ts16le 2ch 48000Hz\tSUSPENDED
62\talsa_input.usb-Samson_Technologies_Samson_Q2U_Microphone-00.analog-stereo\tPipeWire\ts16le 2ch 48000Hz\tRUNNING
63\talsa_input.usb-Sonix_Technology_Co.__Ltd._Lenovo_FHD_Webcam_Audio_SN0001-02.analog-stereo\tPipeWire\ts16le 2ch 48000Hz\tSUSPENDED
`;

test('parsePulseAudioSources parses pactl source rows', () => {
  const sources = parsePulseAudioSources(pactlOutput);

  assert.equal(sources.length, 3);
  assert.deepEqual(sources[1], {
    id: '62',
    name: 'alsa_input.usb-Samson_Technologies_Samson_Q2U_Microphone-00.analog-stereo',
    label: 'usb-Samson Technologies Samson Q2U Microphone-00',
    driver: 'PipeWire',
    state: 'RUNNING',
    monitor: false,
  });
  assert.equal(sources[0].monitor, true);
});

test('listPulseAudioMicSources filters out monitor sources', async () => {
  const sources = await listPulseAudioMicSources({
    run: (_command, _args, callback) => callback(null, pactlOutput),
  });

  assert.equal(sources.length, 2);
  assert.equal(sources.some((source) => source.name.endsWith('.monitor')), false);
  assert.equal(sources[0].name, 'alsa_input.usb-Samson_Technologies_Samson_Q2U_Microphone-00.analog-stereo');
});

test('listPulseAudioSystemAudioSources keeps only monitor sources', async () => {
  const sources = await listPulseAudioSystemAudioSources({
    run: (_command, _args, callback) => callback(null, pactlOutput),
  });

  assert.equal(sources.length, 1);
  assert.equal(sources[0].name, 'alsa_output.usb-Samson_Technologies_Samson_Q2U_Microphone-00.analog-stereo.monitor');
  assert.equal(sources[0].monitor, true);
});
