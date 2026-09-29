// AI service for the AI app view: editing suggestions for the open recording.
//
// Uses the local Claude Code login through claude-cli (no API key to manage).
// Single entry point: analyzeProject(...) -> AiAnalysis.

import { CLAUDE_MISSING_REASON, askClaudeForJson, resolveClaudeBinary } from './claude-cli.mjs';

const ANALYSIS_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'title', 'description', 'zoomMarkers', 'cutRanges'],
  properties: {
    summary: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    zoomMarkers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['startFrame', 'endFrame', 'focalPoint', 'strength', 'rationale'],
        properties: {
          id: { type: 'string' },
          startFrame: { type: 'integer' },
          endFrame: { type: 'integer' },
          focalPoint: {
            type: 'object',
            additionalProperties: false,
            required: ['x', 'y'],
            properties: { x: { type: 'number' }, y: { type: 'number' } },
          },
          strength: { type: 'number' },
          rationale: { type: 'string' },
        },
      },
    },
    cutRanges: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['startFrame', 'endFrame', 'rationale'],
        properties: {
          id: { type: 'string' },
          startFrame: { type: 'integer' },
          endFrame: { type: 'integer' },
          rationale: { type: 'string' },
        },
      },
    },
  },
});

/** Whether the AI view can run: the local Claude Code CLI is installed. */
export function getAiStatus({ binary = resolveClaudeBinary() } = {}) {
  return binary
    ? { available: true, reason: null }
    : { available: false, reason: CLAUDE_MISSING_REASON };
}

// Build a compact, structured prompt from the project document so the model
// reasons over signals (durations, click counts, existing markers) rather
// than verbose JSON.
export function buildAnalysisPrompt({ project, recordingDurationFrames, fps }) {
  const document = project?.document ?? project;
  const recording = document?.assets?.find?.((a) => a.type === 'recording') ?? null;
  const cursorEvents = recording?.cursorEvents ?? [];
  const clicks = cursorEvents.filter((e) => e?.type === 'down').length;
  const existingZoomMarkers = recording?.presentation?.zoom?.markers ?? [];
  const existingCuts = document?.cutRanges ?? [];
  const durationSeconds = fps > 0 ? recordingDurationFrames / fps : 0;

  return [
    `Recording: ${recordingDurationFrames} frames at ${fps} fps (${durationSeconds.toFixed(1)} s).`,
    `Cursor events: ${cursorEvents.length} (${clicks} clicks).`,
    `Existing zoom markers: ${existingZoomMarkers.length}.`,
    `Existing cut ranges: ${existingCuts.length}.`,
    '',
    'Rules:',
    `- startFrame >= 0, endFrame <= ${recordingDurationFrames}, endFrame > startFrame.`,
    '- focalPoint coordinates in [0, 1].',
    '- strength in [0, 1].',
    '- At most 5 zoomMarkers and 3 cutRanges.',
    '- Prefer cutting silent intros/outros when supported by the event data.',
    '- Do not suggest cuts that, combined, would remove every frame.',
  ].join('\n');
}

const SYSTEM_PROMPT = [
  'You are reviewing a screen recording for a video editor. Suggest concrete edits.',
  'Return ONLY the JSON object the schema asks for: a one-paragraph summary, a short title (max 60 chars),',
  'a 1-2 sentence description, zoom markers and cut ranges, each with a short rationale.',
].join(' ');

export function toSuggestions(parsed) {
  const out = [];
  const stamp = Date.now();
  const zoomMarkers = Array.isArray(parsed?.zoomMarkers) ? parsed.zoomMarkers : [];
  zoomMarkers.forEach((m, i) => {
    out.push({
      kind: 'zoom-marker',
      id: typeof m?.id === 'string' && m.id ? m.id : `ai-zoom-${stamp}-${i}`,
      startFrame: Number(m?.startFrame ?? 0),
      endFrame: Number(m?.endFrame ?? 0),
      focalPoint: {
        x: Number(m?.focalPoint?.x ?? 0.5),
        y: Number(m?.focalPoint?.y ?? 0.5),
      },
      strength: Number(m?.strength ?? 0.5),
      rationale: typeof m?.rationale === 'string' ? m.rationale : '',
    });
  });
  const cuts = Array.isArray(parsed?.cutRanges) ? parsed.cutRanges : [];
  cuts.forEach((c, i) => {
    out.push({
      kind: 'cut-range',
      id: typeof c?.id === 'string' && c.id ? c.id : `ai-cut-${stamp}-${i}`,
      startFrame: Number(c?.startFrame ?? 0),
      endFrame: Number(c?.endFrame ?? 0),
      rationale: typeof c?.rationale === 'string' ? c.rationale : '',
    });
  });
  const titleText = typeof parsed?.title === 'string' ? parsed.title.trim() : '';
  if (titleText) {
    out.push({
      kind: 'title',
      id: `ai-title-${stamp}`,
      title: titleText,
      description: typeof parsed?.description === 'string' ? parsed.description : '',
    });
  }
  return out;
}

// Returns an AiAnalysis-shaped object; the renderer runs validateSuggestion()
// on each entry before applying. Throws (with a code) on failure so the IPC
// handler can hand the renderer a readable error.
export async function analyzeProject({ project, recordingDurationFrames, fps, signal = null, ask = askClaudeForJson, debugDir = null }) {
  if (!Number.isFinite(recordingDurationFrames) || recordingDurationFrames <= 0) {
    throw new Error('recordingDurationFrames must be a positive number');
  }
  const userPrompt = buildAnalysisPrompt({ project, recordingDurationFrames, fps });
  const result = await ask({
    systemPrompt: SYSTEM_PROMPT,
    schema: ANALYSIS_SCHEMA,
    buildPrompt: (errors) => (errors.length > 0
      ? `${userPrompt}\n\nYour previous answer was rejected: ${errors.join('; ')}`
      : userPrompt),
    signal,
    label: 'analysis',
    debugDir,
  });
  if (!result.ok) {
    const err = new Error(result.reason);
    err.code = result.cancelled ? 'AI_CANCELLED' : 'AI_CLAUDE';
    throw err;
  }
  return {
    summary: typeof result.value?.summary === 'string' ? result.value.summary : '',
    suggestions: toSuggestions(result.value),
    generatedAt: new Date().toISOString(),
    model: 'claude-code',
  };
}
