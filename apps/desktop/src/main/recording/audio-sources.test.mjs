import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAudioSourceSelection } from './audio-sources.mjs';

test('selected mic route resolves from exact source id when available', () => {
  const result = resolveAudioSourceSelection({
    monitorSources: ['alsa_output.pci-0000_00_1f.3.analog-stereo.monitor'],
    micSources: ['alsa_input.usb-blue_yeti-00.mono-fallback'],
    micSourceDetails: [
      {
        name: 'alsa_input.usb-blue_yeti-00.mono-fallback',
        description: 'Blue Yeti Microphone',
        isMonitor: false,
      },
    ],
    defaultSinkName: 'alsa_output.pci-0000_00_1f.3.analog-stereo',
    defaultSourceName: 'alsa_input.usb-blue_yeti-00.mono-fallback',
    preferredMicSourceId: 'alsa_input.usb-blue_yeti-00.mono-fallback',
    strictMicSelection: true,
  });

  assert.equal(result.micSource, 'alsa_input.usb-blue_yeti-00.mono-fallback');
});

test('selected mic route does not silently fall back when strict selection is unavailable', () => {
  const result = resolveAudioSourceSelection({
    monitorSources: ['alsa_output.pci-0000_00_1f.3.analog-stereo.monitor'],
    micSources: ['alsa_input.usb-fallback-00.mono-fallback'],
    micSourceDetails: [
      {
        name: 'alsa_input.usb-fallback-00.mono-fallback',
        description: 'Fallback USB Mic',
        isMonitor: false,
      },
    ],
    defaultSinkName: 'alsa_output.pci-0000_00_1f.3.analog-stereo',
    defaultSourceName: 'alsa_input.usb-fallback-00.mono-fallback',
    preferredMicSourceId: 'alsa_input.usb-missing-00.mono-fallback',
    preferredMicLabel: 'Missing Mic',
    strictMicSelection: true,
  });

  assert.equal(result.micSource, null);
});

test('selected system audio route keeps the requested monitor source when available', () => {
  const result = resolveAudioSourceSelection({
    monitorSources: [
      'alsa_output.usb-dock.monitor',
      'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor',
    ],
    micSources: [],
    micSourceDetails: [],
    defaultSinkName: 'alsa_output.pci-0000_00_1f.3.analog-stereo',
    defaultSourceName: null,
    preferredSystemAudioSourceId: 'alsa_output.usb-dock.monitor',
    strictSystemSelection: true,
  });

  assert.equal(result.monitorSource, 'alsa_output.usb-dock.monitor');
});

test('selected system audio route does not silently fall back when strict selection is unavailable', () => {
  const result = resolveAudioSourceSelection({
    monitorSources: ['alsa_output.pci-0000_00_1f.3.analog-stereo.monitor'],
    micSources: [],
    micSourceDetails: [],
    defaultSinkName: 'alsa_output.pci-0000_00_1f.3.analog-stereo',
    defaultSourceName: null,
    preferredSystemAudioSourceId: 'alsa_output.missing.monitor',
    strictSystemSelection: true,
  });

  assert.equal(result.monitorSource, null);
});
