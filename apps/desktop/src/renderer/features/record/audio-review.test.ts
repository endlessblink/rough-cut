import { describe, expect, it } from 'vitest';
import {
  assessAudioMeter,
  getPreviewDuckingState,
  getRecordingAudioReview,
} from './audio-review.js';

describe('audio-review helpers', () => {
  it('flags clipping when the meter peak is too high', () => {
    expect(assessAudioMeter({ level: 0.7, peak: 0.99 })).toMatchObject({
      severity: 'clipping',
    });
  });

  it('returns an active ducking preview only when both audio sources are enabled', () => {
    expect(
      getPreviewDuckingState({
        micEnabled: true,
        sysAudioEnabled: true,
        systemAudioGainPercent: 100,
        meter: { level: 0.4, peak: 0.6 },
      }),
    ).toMatchObject({
      available: true,
      active: true,
      duckedPercent: 60,
    });
  });

  it('describes mixed mic and system audio review truthfully', () => {
    const review = getRecordingAudioReview(
      {
        requested: { micEnabled: true, sysAudioEnabled: true },
        resolved: {
          micSource: 'alsa_input.test',
          systemAudioSource: 'alsa_output.test.monitor',
        },
        final: { hasAudio: true },
      },
      true,
    );

    expect(review.mixedReview).toBe(true);
    expect(review.tracks.map((track) => track.id)).toEqual(['microphone', 'system']);
    expect(review.summary).toContain('mixed stream');
  });
});
