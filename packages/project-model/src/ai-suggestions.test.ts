import { test, expect } from 'vitest';
import type { Frame } from './types.js';
import {
  validateSuggestion,
  type AiZoomMarkerSuggestion,
  type AiCutRangeSuggestion,
  type AiTitleSuggestion,
} from './ai-suggestions.js';

const frame = (n: number) => n as unknown as Frame;
const baseCtx = { recordingDurationFrames: 300, existingCutRanges: [] };

function zoom(overrides: Partial<AiZoomMarkerSuggestion> = {}): AiZoomMarkerSuggestion {
  return {
    kind: 'zoom-marker',
    id: 'z1',
    startFrame: frame(30),
    endFrame: frame(90),
    focalPoint: { x: 0.5, y: 0.5 },
    strength: 0.6,
    rationale: 'click cluster',
    ...overrides,
  };
}

function cut(overrides: Partial<AiCutRangeSuggestion> = {}): AiCutRangeSuggestion {
  return {
    kind: 'cut-range',
    id: 'c1',
    startFrame: frame(0),
    endFrame: frame(60),
    rationale: 'silent intro',
    ...overrides,
  };
}

function title(overrides: Partial<AiTitleSuggestion> = {}): AiTitleSuggestion {
  return {
    kind: 'title',
    id: 't1',
    title: 'Demo recording',
    description: 'A short walkthrough',
    ...overrides,
  };
}

test('zoom marker inside the recording is valid', () => {
  expect(validateSuggestion(zoom(), baseCtx)).toBe(null);
});

test('zoom marker past the end of recording fails frame-out-of-range', () => {
  const result = validateSuggestion(zoom({ endFrame: frame(500) }), baseCtx);
  expect(result?.code).toBe('frame-out-of-range');
});

test('zoom marker with flipped span fails span-invalid', () => {
  const result = validateSuggestion(
    zoom({ startFrame: frame(100), endFrame: frame(80) }),
    baseCtx,
  );
  expect(result?.code).toBe('span-invalid');
});

test('zoom marker with zero-length span fails span-invalid', () => {
  const result = validateSuggestion(
    zoom({ startFrame: frame(50), endFrame: frame(50) }),
    baseCtx,
  );
  expect(result?.code).toBe('span-invalid');
});

test('zoom marker with focal point outside frame fails focal-out-of-bounds', () => {
  const result = validateSuggestion(zoom({ focalPoint: { x: 1.5, y: 0.5 } }), baseCtx);
  expect(result?.code).toBe('focal-out-of-bounds');
});

test('zoom marker with strength > 1 fails strength-out-of-bounds', () => {
  const result = validateSuggestion(zoom({ strength: 1.4 }), baseCtx);
  expect(result?.code).toBe('strength-out-of-bounds');
});

test('cut range inside recording is valid', () => {
  expect(validateSuggestion(cut(), baseCtx)).toBe(null);
});

test('cut range that would empty timeline alone fails cut-empties-timeline', () => {
  const result = validateSuggestion(
    cut({ startFrame: frame(0), endFrame: frame(300) }),
    baseCtx,
  );
  expect(result?.code).toBe('cut-empties-timeline');
});

test('cut range that empties timeline together with existing cuts fails', () => {
  const ctx = {
    recordingDurationFrames: 300,
    existingCutRanges: [{ startFrame: 0, endFrame: 200 }],
  };
  const result = validateSuggestion(cut({ startFrame: frame(180), endFrame: frame(300) }), ctx);
  expect(result?.code).toBe('cut-empties-timeline');
});

test('cut range that overlaps existing cuts but leaves frames is valid', () => {
  const ctx = {
    recordingDurationFrames: 300,
    existingCutRanges: [{ startFrame: 0, endFrame: 60 }],
  };
  expect(
    validateSuggestion(cut({ startFrame: frame(40), endFrame: frame(120) }), ctx),
  ).toBe(null);
});

test('title with content is valid', () => {
  expect(validateSuggestion(title(), baseCtx)).toBe(null);
});

test('title that is whitespace-only fails title-empty', () => {
  const result = validateSuggestion(title({ title: '   ' }), baseCtx);
  expect(result?.code).toBe('title-empty');
});
