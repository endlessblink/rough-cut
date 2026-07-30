import type { Frame, ProjectDocument } from './types.js';
import {
  sourceFrameTimelineRanges,
  type TranscriptTimelineRange,
} from './transcript-timeline.js';

export type WaitTreatmentAction = 'remove' | 'compress';
export type WaitTreatmentDisposition = 'recommend' | 'keep-flagged';
export type WaitAudioTreatment = 'mute' | 'soften';

export interface WaitActivitySample {
  readonly frame: Frame;
  readonly kind: 'cursor' | 'terminal-output' | 'visual-change';
  readonly meaningful: boolean;
  readonly detail: string;
}

export interface WaitTreatmentPreview {
  readonly before: readonly TranscriptTimelineRange[];
  readonly treatment: readonly TranscriptTimelineRange[];
  readonly after: readonly TranscriptTimelineRange[];
}

export interface WaitTreatmentSuggestion {
  readonly id: string;
  readonly disposition: WaitTreatmentDisposition;
  readonly action: WaitTreatmentAction;
  readonly sourceStartFrame: Frame;
  readonly sourceEndFrame: Frame;
  readonly timelineRanges: readonly TranscriptTimelineRange[];
  readonly targetDurationFrames: Frame;
  readonly audioTreatment: WaitAudioTreatment;
  readonly operation?: 'build' | 'install' | 'loading' | 'waiting';
  readonly reason: string;
  readonly confidence: number;
  readonly activityEvidence: readonly WaitActivitySample[];
  readonly preview: WaitTreatmentPreview;
}

export interface WaitTreatmentOptions {
  /**
   * Undefined means activity telemetry was unavailable. An empty array means it
   * was available and observed no meaningful progress.
   */
  readonly activitySamples?: readonly WaitActivitySample[];
  readonly activityCoverage?: readonly {
    readonly startFrame: Frame;
    readonly endFrame: Frame;
  }[];
  readonly minimumWaitSeconds?: number;
  readonly compressedDurationSeconds?: number;
  readonly previewContextSeconds?: number;
}

const OPERATION_TOKENS = new Map<string, WaitTreatmentSuggestion['operation']>([
  ['build', 'build'],
  ['building', 'build'],
  ['compile', 'build'],
  ['compiling', 'build'],
  ['install', 'install'],
  ['installing', 'install'],
  ['load', 'loading'],
  ['loading', 'loading'],
  ['wait', 'waiting'],
  ['waiting', 'waiting'],
]);

export function deriveWaitTreatmentSuggestions(
  document: ProjectDocument,
  options: WaitTreatmentOptions = {},
): readonly WaitTreatmentSuggestion[] {
  const fps = document.settings?.frameRate ?? 30;
  const minimumWaitFrames = Math.max(
    1,
    Math.round((options.minimumWaitSeconds ?? 3) * fps),
  );
  const targetDurationFrames = Math.round(
    clamp(options.compressedDurationSeconds ?? 3, 2, 4) * fps,
  );
  const previewContextFrames = Math.max(
    1,
    Math.round((options.previewContextSeconds ?? 2) * fps),
  );
  const suggestions: WaitTreatmentSuggestion[] = [];

  for (const segment of document.transcript?.nonSpeech ?? []) {
    if (
      segment.kind !== 'silence' ||
      segment.endFrame - segment.startFrame < minimumWaitFrames
    ) {
      continue;
    }
    const timelineRanges = sourceFrameTimelineRanges(document, segment);
    if (timelineRanges.length === 0) continue;
    const activityEvidence = (options.activitySamples ?? []).filter(
      (sample) =>
        sample.frame >= segment.startFrame && sample.frame < segment.endFrame,
    );
    const telemetryAvailable =
      options.activitySamples !== undefined &&
      (options.activityCoverage === undefined ||
        options.activityCoverage.some(
          (coverage) =>
            coverage.startFrame <= segment.startFrame &&
            coverage.endFrame >= segment.endFrame,
        ));
    const meaningfulProgress = activityEvidence.some((sample) => sample.meaningful);
    const action: WaitTreatmentAction = meaningfulProgress ? 'compress' : 'remove';
    const disposition: WaitTreatmentDisposition = telemetryAvailable
      ? 'recommend'
      : 'keep-flagged';
    const operation = precedingOperation(document, segment.startFrame, fps);
    const sourceDurationFrames = segment.endFrame - segment.startFrame;
    const confidence = telemetryAvailable
      ? meaningfulProgress
        ? 0.88
        : 0.92
      : 0.54;

    suggestions.push({
      id: `wait:${segment.startFrame}:${segment.endFrame}`,
      disposition,
      action,
      sourceStartFrame: segment.startFrame,
      sourceEndFrame: segment.endFrame,
      timelineRanges,
      targetDurationFrames:
        action === 'compress'
          ? Math.min(targetDurationFrames, sourceDurationFrames)
          : 0,
      audioTreatment: action === 'remove' ? 'mute' : 'soften',
      operation,
      reason: waitReason({
        action,
        disposition,
        meaningfulProgress,
        operation,
      }),
      confidence,
      activityEvidence,
      preview: {
        before: sourceFrameTimelineRanges(document, {
          startFrame: Math.max(0, segment.startFrame - previewContextFrames),
          endFrame: segment.startFrame,
        }),
        treatment: timelineRanges,
        after: sourceFrameTimelineRanges(document, {
          startFrame: segment.endFrame,
          endFrame: segment.endFrame + previewContextFrames,
        }),
      },
    });
  }

  return suggestions;
}

function precedingOperation(
  document: ProjectDocument,
  waitStartFrame: number,
  fps: number,
): WaitTreatmentSuggestion['operation'] | undefined {
  const windowStart = Math.max(0, waitStartFrame - fps * 8);
  const words = document.transcript?.words ?? [];
  for (let index = words.length - 1; index >= 0; index -= 1) {
    const word = words[index]!;
    if (word.endFrame > waitStartFrame) continue;
    if (word.endFrame < windowStart) break;
    const operation = OPERATION_TOKENS.get(normalizeToken(word.word));
    if (operation) return operation;
  }
  return undefined;
}

function waitReason({
  action,
  disposition,
  meaningfulProgress,
  operation,
}: {
  readonly action: WaitTreatmentAction;
  readonly disposition: WaitTreatmentDisposition;
  readonly meaningfulProgress: boolean;
  readonly operation?: WaitTreatmentSuggestion['operation'];
}): string {
  const label = operation ? `${operation} wait` : 'wait';
  if (disposition === 'keep-flagged') {
    return `Keep this ${label}: activity telemetry is unavailable, so removal is uncertain.`;
  }
  if (action === 'compress' && meaningfulProgress) {
    return `Compress this ${label}: meaningful screen progress should remain visible.`;
  }
  return `Remove this ${label}: no meaningful screen progress was observed.`;
}

function normalizeToken(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9+#.-]/g, '');
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
