import { describe, it, expect } from 'vitest';
import {
  frameToSeconds,
  secondsToFrame,
  framesToTimecode,
  timecodeToFrames,
  clipDurationFrames,
  clipSourceDurationFrames,
} from './frame-utils.js';
import { createClip } from './factories.js';
import type { AssetId, TrackId, Clip } from './types.js';

describe('frame-utils', () => {
  describe('frameToSeconds', () => {
    it('30 frames at 30fps = 1 second', () => {
      expect(frameToSeconds(30, 30)).toBe(1.0);
    });

    it('0 frames = 0 seconds', () => {
      expect(frameToSeconds(0, 30)).toBe(0);
    });

    it('60 frames at 24fps', () => {
      expect(frameToSeconds(60, 24)).toBe(2.5);
    });
  });

  describe('secondsToFrame', () => {
    it('1.5 seconds at 30fps = 45 frames', () => {
      expect(secondsToFrame(1.5, 30)).toBe(45);
    });

    it('0 seconds = 0 frames', () => {
      expect(secondsToFrame(0, 30)).toBe(0);
    });

    it('rounds to nearest integer', () => {
      // 1/3 second at 30fps = 10 frames
      expect(secondsToFrame(1 / 3, 30)).toBe(10);
    });
  });

  describe('framesToTimecode', () => {
    it('0 frames', () => {
      expect(framesToTimecode(0, 30)).toBe('00:00:00:00');
    });

    it('90 frames at 30fps = 3 seconds', () => {
      expect(framesToTimecode(90, 30)).toBe('00:00:03:00');
    });

    it('complex timecode: 1h 1m 1s 15f', () => {
      const frames = 3661 * 30 + 15;
      expect(framesToTimecode(frames, 30)).toBe('01:01:01:15');
    });

    it('handles frame remainders', () => {
      expect(framesToTimecode(31, 30)).toBe('00:00:01:01');
    });
  });

  describe('timecodeToFrames', () => {
    it('parses zero timecode', () => {
      expect(timecodeToFrames('00:00:00:00', 30)).toBe(0);
    });

    it('parses 3 seconds', () => {
      expect(timecodeToFrames('00:00:03:00', 30)).toBe(90);
    });

    it('throws on invalid format', () => {
      expect(() => timecodeToFrames('00:00:00', 30)).toThrow();
    });
  });

  describe('round-trip: frames -> timecode -> frames', () => {
    it('round-trips correctly', () => {
      const testCases = [0, 1, 29, 30, 90, 1800, 3661 * 30 + 15];
      for (const frames of testCases) {
        const tc = framesToTimecode(frames, 30);
        const result = timecodeToFrames(tc, 30);
        expect(result).toBe(frames);
      }
    });

    it('round-trips at 24fps', () => {
      const testCases = [0, 23, 24, 48, 72];
      for (const frames of testCases) {
        const tc = framesToTimecode(frames, 24);
        const result = timecodeToFrames(tc, 24);
        expect(result).toBe(frames);
      }
    });
  });

  describe('clipDurationFrames', () => {
    it('returns timelineOut - timelineIn', () => {
      const clip = createClip('a' as AssetId, 't' as TrackId, {
        timelineIn: 10,
        timelineOut: 40,
      });
      expect(clipDurationFrames(clip)).toBe(30);
    });
  });

  describe('clipSourceDurationFrames', () => {
    it('returns sourceOut - sourceIn', () => {
      const clip = createClip('a' as AssetId, 't' as TrackId, {
        sourceIn: 5,
        sourceOut: 35,
      });
      expect(clipSourceDurationFrames(clip)).toBe(30);
    });
  });
});
