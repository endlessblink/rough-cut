import type { Frame, ProjectDocument } from './types.js';
import {
  sourceFrameTimelineRanges,
  type TranscriptTimelineRange,
} from './transcript-timeline.js';

export type ScreenActionLandmarkKind =
  | 'command'
  | 'application-change'
  | 'file-change'
  | 'error'
  | 'wait'
  | 'visual-change';

export type ScreenActionEvidenceSource = 'transcript' | 'non-speech' | 'cursor';

export interface ScreenActionEvidence {
  readonly source: ScreenActionEvidenceSource;
  readonly startFrame: Frame;
  readonly endFrame: Frame;
  readonly detail: string;
}

export interface ScreenActionLandmark {
  readonly id: string;
  readonly kind: ScreenActionLandmarkKind;
  readonly label: string;
  readonly sourceStartFrame: Frame;
  readonly sourceEndFrame: Frame;
  readonly timelineRanges: readonly TranscriptTimelineRange[];
  readonly confidence: number;
  readonly evidence: readonly ScreenActionEvidence[];
}

export interface ScreenActionLandmarkOptions {
  readonly minimumWaitSeconds?: number;
  readonly cursorEvidenceWindowSeconds?: number;
}

const COMMAND_TOKENS = new Set([
  'npm',
  'npx',
  'pnpm',
  'yarn',
  'bun',
  'git',
  'node',
  'python',
  'pip',
  'cargo',
  'docker',
  'kubectl',
  'make',
]);
const COMMAND_ACTIONS = new Set(['build', 'test', 'install', 'deploy', 'compile']);
const ERROR_TOKENS = new Set([
  'error',
  'errors',
  'failed',
  'failure',
  'exception',
  'crash',
  'crashed',
  'broken',
]);
const APPLICATION_TOKENS = new Set([
  'app',
  'application',
  'browser',
  'chrome',
  'firefox',
  'terminal',
  'editor',
  'vscode',
  'figma',
]);
const CHANGE_ACTIONS = new Set(['open', 'opened', 'switch', 'switched', 'back']);
const FILE_ACTIONS = new Set(['edit', 'edited', 'open', 'opened', 'save', 'saved']);

type CursorEvent = {
  readonly frame: number;
  readonly type: string;
};

export function deriveScreenActionLandmarks(
  document: ProjectDocument,
  options: ScreenActionLandmarkOptions = {},
): readonly ScreenActionLandmark[] {
  const fps = document.settings?.frameRate ?? 30;
  const minimumWaitFrames = Math.max(
    1,
    Math.round((options.minimumWaitSeconds ?? 3) * fps),
  );
  const cursorWindowFrames = Math.max(
    0,
    Math.round((options.cursorEvidenceWindowSeconds ?? 2) * fps),
  );
  const words = document.transcript?.words ?? [];
  const cursorClicks = recordingCursorEvents(document).filter(
    (event) => event.type === 'down',
  );
  const landmarks: ScreenActionLandmark[] = [];

  for (let index = 0; index < words.length; index += 1) {
    const token = normalizeToken(words[index]?.word);
    const nextToken = normalizeToken(words[index + 1]?.word);
    const nextNextToken = normalizeToken(words[index + 2]?.word);
    const isCommand =
      COMMAND_TOKENS.has(token) ||
      ((token === 'run' || token === 'execute') &&
        (COMMAND_TOKENS.has(nextToken) || COMMAND_ACTIONS.has(nextToken)));
    const isError =
      ERROR_TOKENS.has(token) ||
      ((token === 'doesnt' || token === 'didnt') && nextToken === 'work') ||
      (token === 'does' && nextToken === 'not' && nextNextToken === 'work') ||
      (token === 'did' && nextToken === 'not' && nextNextToken === 'work');
    const isFileChange =
      (FILE_ACTIONS.has(token) && isFileToken(nextToken)) ||
      (token === 'file' && isFileToken(nextToken));
    const isApplicationChange =
      (CHANGE_ACTIONS.has(token) &&
        (APPLICATION_TOKENS.has(nextToken) ||
          (nextToken === 'to' && APPLICATION_TOKENS.has(nextNextToken)))) ||
      (token === 'return' &&
        nextToken === 'to' &&
        APPLICATION_TOKENS.has(nextNextToken));
    const isVisualChange =
      (token === 'you' && nextToken === 'can' && nextNextToken === 'see') ||
      (token === 'now' && nextToken === 'we' && nextNextToken === 'see') ||
      (token === 'screen' && (nextToken === 'changed' || nextToken === 'changes')) ||
      (token === 'there' && nextToken === 'it' && nextNextToken === 'is');
    if (
      !isCommand &&
      !isError &&
      !isFileChange &&
      !isApplicationChange &&
      !isVisualChange
    ) {
      continue;
    }

    const endIndex = Math.min(
      words.length - 1,
      index +
        (isCommand ||
        (isError && nextToken === 'not') ||
        isVisualChange ||
        (isApplicationChange && nextToken === 'to')
          ? 2
          : 1),
    );
    const selectedWords = words.slice(index, endIndex + 1);
    const sourceStartFrame = selectedWords[0]?.startFrame ?? 0;
    const sourceEndFrame =
      selectedWords[selectedWords.length - 1]?.endFrame ?? sourceStartFrame + 1;
    const timelineRanges = sourceFrameTimelineRanges(document, {
      startFrame: sourceStartFrame,
      endFrame: sourceEndFrame,
    });
    if (timelineRanges.length === 0) continue;

    const snippet = selectedWords.map((word) => word.word).join(' ').trim();
    const nearbyClick = cursorClicks.find(
      (event) =>
        event.frame >= sourceStartFrame - cursorWindowFrames &&
        event.frame <= sourceEndFrame + cursorWindowFrames,
    );
    const evidence: ScreenActionEvidence[] = [
      {
        source: 'transcript',
        startFrame: sourceStartFrame,
        endFrame: sourceEndFrame,
        detail: `${landmarkKindDetail(
          isCommand,
          isError,
          isFileChange,
          isApplicationChange,
        )} phrase: ${snippet}`,
      },
    ];
    if (nearbyClick) {
      evidence.push({
        source: 'cursor',
        startFrame: nearbyClick.frame as Frame,
        endFrame: (nearbyClick.frame + 1) as Frame,
        detail: 'click near spoken action',
      });
    }
    const kind: ScreenActionLandmarkKind = isCommand
      ? 'command'
      : isError
        ? 'error'
        : isFileChange
          ? 'file-change'
          : isApplicationChange
            ? 'application-change'
            : 'visual-change';
    const baseConfidence =
      kind === 'error'
        ? 0.86
        : kind === 'command'
          ? 0.78
          : kind === 'file-change'
            ? 0.8
            : kind === 'application-change'
              ? 0.76
              : 0.7;
    landmarks.push({
      id: landmarkId(kind, sourceStartFrame, sourceEndFrame, snippet),
      kind,
      label: `${landmarkKindName(kind)}: ${snippet}`,
      sourceStartFrame,
      sourceEndFrame,
      timelineRanges,
      confidence:
        Math.round(
          Math.min(1, baseConfidence + (nearbyClick ? 0.06 : 0)) * 100,
        ) / 100,
      evidence,
    });
    index = endIndex;
  }

  for (const segment of document.transcript?.nonSpeech ?? []) {
    if (
      segment.kind !== 'silence' ||
      segment.endFrame - segment.startFrame < minimumWaitFrames
    ) {
      continue;
    }
    const timelineRanges = sourceFrameTimelineRanges(document, segment);
    if (timelineRanges.length === 0) continue;
    const durationSeconds = (segment.endFrame - segment.startFrame) / fps;
    landmarks.push({
      id: landmarkId('wait', segment.startFrame, segment.endFrame, 'silence'),
      kind: 'wait',
      label: `Wait: ${formatDuration(durationSeconds)} silence`,
      sourceStartFrame: segment.startFrame,
      sourceEndFrame: segment.endFrame,
      timelineRanges,
      confidence: 0.96,
      evidence: [
        {
          source: 'non-speech',
          startFrame: segment.startFrame,
          endFrame: segment.endFrame,
          detail: 'sustained silence',
        },
      ],
    });
  }

  return landmarks.sort(
    (left, right) =>
      (left.timelineRanges[0]?.startFrame ?? 0) -
        (right.timelineRanges[0]?.startFrame ?? 0) ||
      left.kind.localeCompare(right.kind),
  );
}

export function searchScreenActionLandmarks(
  landmarks: readonly ScreenActionLandmark[],
  query: string,
): readonly ScreenActionLandmark[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return landmarks;
  return landmarks.filter((landmark) =>
    [
      landmark.kind,
      landmark.label,
      ...landmark.evidence.map((evidence) => evidence.detail),
    ].some((value) => value.toLocaleLowerCase().includes(normalized)),
  );
}

export function timelineFrameForScreenActionLandmark(
  landmark: ScreenActionLandmark,
): Frame | null {
  return landmark.timelineRanges[0]?.startFrame ?? null;
}

function recordingCursorEvents(document: ProjectDocument): readonly CursorEvent[] {
  const screenSource = document.timeline.sources.find((source) => source.kind === 'screen');
  const asset = screenSource?.assetId
    ? document.assets.find((candidate) => candidate.id === screenSource.assetId)
    : document.assets.find((candidate) => candidate.type === 'recording');
  const events = asset?.metadata?.cursorEvents;
  if (!Array.isArray(events)) return [];
  return events
    .filter(
      (event): event is CursorEvent =>
        Boolean(
          event &&
            typeof event === 'object' &&
            Number.isInteger((event as CursorEvent).frame) &&
            (event as CursorEvent).frame >= 0 &&
            typeof (event as CursorEvent).type === 'string',
        ),
    )
    .sort((left, right) => left.frame - right.frame);
}

function normalizeToken(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9+#.-]/g, '');
}

function isFileToken(token: string): boolean {
  return (
    token.includes('/') ||
    /^[a-z0-9_-]+\.(?:[cm]?[jt]sx?|json|css|html?|md|py|rb|rs|go|java|kt|swift|ya?ml|toml)$/.test(
      token,
    )
  );
}

function landmarkKindDetail(
  isCommand: boolean,
  isError: boolean,
  isFileChange: boolean,
  isApplicationChange: boolean,
): string {
  if (isCommand) return 'command';
  if (isError) return 'error';
  if (isFileChange) return 'file change';
  if (isApplicationChange) return 'application change';
  return 'visual change';
}

function landmarkKindName(kind: ScreenActionLandmarkKind): string {
  if (kind === 'command') return 'Command';
  if (kind === 'error') return 'Error';
  if (kind === 'file-change') return 'File';
  if (kind === 'application-change') return 'Application';
  if (kind === 'visual-change') return 'Visual change';
  return 'Wait';
}

function landmarkId(
  kind: ScreenActionLandmarkKind,
  startFrame: number,
  endFrame: number,
  label: string,
): string {
  const token = normalizeToken(label).replace(/[^a-z0-9]+/g, '-').slice(0, 32);
  return `landmark:${kind}:${startFrame}:${endFrame}:${token}`;
}

function formatDuration(seconds: number): string {
  const rounded = Math.round(seconds * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}s`;
}
