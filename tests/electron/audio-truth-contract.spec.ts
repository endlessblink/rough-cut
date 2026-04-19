import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveAudioSourceSelection } from '../../apps/desktop/src/main/recording/audio-sources.mjs';
import {
  probeRecordingResult,
  muxAudioIntoRecording,
} from '../../apps/desktop/src/main/recording/recording-file-utils.mjs';

test.describe('Audio truth contract', () => {
  test('strict mic selection resolves the intended capture source instead of falling back', () => {
    const selection = resolveAudioSourceSelection({
      monitorSources: ['alsa_output.pci-0000_00_1f.3.analog-stereo.monitor'],
      micSources: ['alsa_input.usb-Default_Mic-00.mono-fallback', 'alsa_input.usb-PodTrak_P4-00.stereo-fallback'],
      micSourceDetails: [
        {
          name: 'alsa_input.usb-Default_Mic-00.mono-fallback',
          description: 'Default Mic',
          isMonitor: false,
        },
        {
          name: 'alsa_input.usb-PodTrak_P4-00.stereo-fallback',
          description: 'Zoom PodTrak P4',
          isMonitor: false,
        },
      ],
      defaultSinkName: 'alsa_output.pci-0000_00_1f.3.analog-stereo',
      defaultSourceName: 'alsa_input.usb-Default_Mic-00.mono-fallback',
      preferredMicSourceId: 'browser-device-id-that-does-not-match-pulse',
      preferredMicLabel: 'Zoom PodTrak P4',
      strictMicSelection: true,
      strictSystemSelection: false,
    });

    expect(selection.micSource).toBe('alsa_input.usb-PodTrak_P4-00.stereo-fallback');
  });

  test('strict system audio selection becomes unavailable instead of silently falling back', () => {
    const selection = resolveAudioSourceSelection({
      monitorSources: ['alsa_output.pci-0000_00_1f.3.analog-stereo.monitor'],
      micSources: ['alsa_input.usb-Default_Mic-00.mono-fallback'],
      micSourceDetails: [],
      defaultSinkName: 'alsa_output.pci-0000_00_1f.3.analog-stereo',
      defaultSourceName: 'alsa_input.usb-Default_Mic-00.mono-fallback',
      preferredSystemAudioSourceId: 'alsa_output.usb-Dock.monitor',
      strictMicSelection: false,
      strictSystemSelection: true,
    });

    expect(selection.monitorSource).toBeNull();
  });

  test('post-mux probe reflects the final file audio truth', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rough-cut-audio-truth-'));

    try {
      const videoPath = join(dir, 'video-only.webm');
      const audioPath = join(dir, 'audio-only.webm');

      execFileSync('ffmpeg', [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=320x240:rate=30',
        '-t',
        '1',
        '-c:v',
        'libvpx',
        '-an',
        videoPath,
      ]);

      execFileSync('ffmpeg', [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=1000:sample_rate=48000',
        '-t',
        '1',
        '-c:a',
        'libopus',
        audioPath,
      ]);

      const beforeMux = probeRecordingResult(videoPath, { fps: 999, timelineFps: 30 });
      expect(beforeMux.hasAudio).toBe(false);

      const muxed = await muxAudioIntoRecording(videoPath, audioPath);
      expect(muxed).toBe(true);

      const afterMux = probeRecordingResult(videoPath, { fps: 999, timelineFps: 30 });
      expect(afterMux.hasAudio).toBe(true);
      expect(afterMux.fps).toBeLessThan(120);
      expect(afterMux.fileSize).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
