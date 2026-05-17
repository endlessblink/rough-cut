// AI suggestion types and validators.
//
// Suggestions are produced by the main-process AI service and consumed by the
// renderer's AI shell. Each suggestion is independently applyable or
// dismissable; the schema is intentionally narrow so an LLM can fill it from
// structured signals (cursor telemetry, click events, audio markers) without
// the renderer having to trust free-form JSON.
//
// Pure functions only — no Electron, no SDK imports. Lives in project-model so
// validation can be unit-tested off-thread.

import type { Frame } from './types.js';

export type AiSuggestionKind = 'zoom-marker' | 'cut-range' | 'title';

export interface AiZoomMarkerSuggestion {
  readonly kind: 'zoom-marker';
  readonly id: string;
  readonly startFrame: Frame;
  readonly endFrame: Frame;
  readonly focalPoint: { readonly x: number; readonly y: number };
  readonly strength: number;
  readonly rationale: string;
}

export interface AiCutRangeSuggestion {
  readonly kind: 'cut-range';
  readonly id: string;
  readonly startFrame: Frame;
  readonly endFrame: Frame;
  readonly rationale: string;
}

export interface AiTitleSuggestion {
  readonly kind: 'title';
  readonly id: string;
  readonly title: string;
  readonly description: string;
}

export type AiSuggestion =
  | AiZoomMarkerSuggestion
  | AiCutRangeSuggestion
  | AiTitleSuggestion;

export interface AiAnalysis {
  readonly summary: string;
  readonly suggestions: readonly AiSuggestion[];
  readonly generatedAt: string; // ISO timestamp
  readonly model: string;
}

export type AiValidationError =
  | { code: 'frame-out-of-range'; suggestionId: string; detail: string }
  | { code: 'span-invalid'; suggestionId: string; detail: string }
  | { code: 'cut-empties-timeline'; suggestionId: string; detail: string }
  | { code: 'focal-out-of-bounds'; suggestionId: string; detail: string }
  | { code: 'strength-out-of-bounds'; suggestionId: string; detail: string }
  | { code: 'title-empty'; suggestionId: string; detail: string };

export interface ValidateContext {
  readonly recordingDurationFrames: number;
  readonly existingCutRanges: readonly { startFrame: number; endFrame: number }[];
}

// Returns null if valid, or an AiValidationError if the suggestion would
// produce a broken project state if applied. Validation here is strict:
// every reason an LLM might emit a bad suggestion (clamped at zero, ranges
// flipped, focal point off-canvas, strength outside 0–1, cuts that delete
// the whole timeline) is rejected so the renderer can show the user *why*.
export function validateSuggestion(
  suggestion: AiSuggestion,
  ctx: ValidateContext,
): AiValidationError | null {
  if (suggestion.kind === 'zoom-marker') {
    if (suggestion.startFrame < 0 || suggestion.endFrame > ctx.recordingDurationFrames) {
      return {
        code: 'frame-out-of-range',
        suggestionId: suggestion.id,
        detail: `Marker spans ${suggestion.startFrame}–${suggestion.endFrame}; recording is ${ctx.recordingDurationFrames} frames`,
      };
    }
    if (suggestion.endFrame <= suggestion.startFrame) {
      return {
        code: 'span-invalid',
        suggestionId: suggestion.id,
        detail: `endFrame (${suggestion.endFrame}) must be greater than startFrame (${suggestion.startFrame})`,
      };
    }
    const { x, y } = suggestion.focalPoint;
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      return {
        code: 'focal-out-of-bounds',
        suggestionId: suggestion.id,
        detail: `Focal point (${x}, ${y}) must be inside [0, 1] x [0, 1]`,
      };
    }
    if (suggestion.strength < 0 || suggestion.strength > 1) {
      return {
        code: 'strength-out-of-bounds',
        suggestionId: suggestion.id,
        detail: `Strength ${suggestion.strength} must be inside [0, 1]`,
      };
    }
    return null;
  }

  if (suggestion.kind === 'cut-range') {
    if (suggestion.startFrame < 0 || suggestion.endFrame > ctx.recordingDurationFrames) {
      return {
        code: 'frame-out-of-range',
        suggestionId: suggestion.id,
        detail: `Cut spans ${suggestion.startFrame}–${suggestion.endFrame}; recording is ${ctx.recordingDurationFrames} frames`,
      };
    }
    if (suggestion.endFrame <= suggestion.startFrame) {
      return {
        code: 'span-invalid',
        suggestionId: suggestion.id,
        detail: `endFrame (${suggestion.endFrame}) must be greater than startFrame (${suggestion.startFrame})`,
      };
    }
    // Reject if applying this cut on top of existing cuts would remove every
    // frame in the timeline. Conservative: we compute the union of all cuts
    // (existing + this one) and check if it covers the whole duration.
    const merged = mergeRanges([
      ...ctx.existingCutRanges,
      { startFrame: suggestion.startFrame, endFrame: suggestion.endFrame },
    ]);
    const totalCut = merged.reduce((sum, r) => sum + (r.endFrame - r.startFrame), 0);
    if (totalCut >= ctx.recordingDurationFrames) {
      return {
        code: 'cut-empties-timeline',
        suggestionId: suggestion.id,
        detail: `Applying this cut leaves no frames in the timeline`,
      };
    }
    return null;
  }

  if (suggestion.kind === 'title') {
    if (!suggestion.title.trim()) {
      return {
        code: 'title-empty',
        suggestionId: suggestion.id,
        detail: 'Title is empty after trim',
      };
    }
    return null;
  }

  // Exhaustiveness: TS will fail at compile time if a new kind is added
  // without a branch.
  const _exhaustive: never = suggestion;
  return _exhaustive;
}

function mergeRanges(
  ranges: readonly { startFrame: number; endFrame: number }[],
): { startFrame: number; endFrame: number }[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.startFrame - b.startFrame);
  const first = sorted[0]!;
  const out: { startFrame: number; endFrame: number }[] = [first];
  for (let i = 1; i < sorted.length; i += 1) {
    const last = out[out.length - 1]!;
    const next = sorted[i]!;
    if (next.startFrame <= last.endFrame) {
      out[out.length - 1] = {
        startFrame: last.startFrame,
        endFrame: Math.max(last.endFrame, next.endFrame),
      };
    } else {
      out.push(next);
    }
  }
  return out;
}
