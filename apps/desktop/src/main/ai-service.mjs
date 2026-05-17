// AI service — wraps Anthropic's Messages API for the AI app view.
//
// Single entry point: analyzeProject(project, recordingDuration) -> AiAnalysis.
// The renderer never sees the API key; it only learns whether one is
// configured via getKeyStatus(). The key is read from one of:
//   1. ANTHROPIC_API_KEY env var (preferred — Doppler / shell env friendly)
//   2. userData/ai-config.json (set via setApiKey)
// In that order. Env var wins so dev workflows don't need an explicit save.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { app } from 'electron';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 2048;

let cachedKeyFromDisk = null;
let cachedKeyLoaded = false;

function configPath() {
  return join(app.getPath('userData'), 'ai-config.json');
}

async function loadKeyFromDisk() {
  if (cachedKeyLoaded) return cachedKeyFromDisk;
  cachedKeyLoaded = true;
  try {
    const raw = await readFile(configPath(), 'utf8');
    const parsed = JSON.parse(raw);
    cachedKeyFromDisk = typeof parsed?.apiKey === 'string' && parsed.apiKey.trim()
      ? parsed.apiKey.trim()
      : null;
  } catch {
    cachedKeyFromDisk = null;
  }
  return cachedKeyFromDisk;
}

async function resolveApiKey() {
  const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  return loadKeyFromDisk();
}

export async function setApiKey(rawKey) {
  const key = typeof rawKey === 'string' ? rawKey.trim() : '';
  if (!key) throw new Error('API key cannot be empty');
  const path = configPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ apiKey: key }, null, 2), { mode: 0o600 });
  cachedKeyFromDisk = key;
  cachedKeyLoaded = true;
  return { ok: true };
}

export async function getKeyStatus() {
  const key = await resolveApiKey();
  return {
    configured: Boolean(key),
    source: process.env.ANTHROPIC_API_KEY?.trim()
      ? 'env'
      : key
        ? 'userData'
        : null,
  };
}

// Build a compact, structured prompt from the project document so the model
// reasons over signals (durations, click counts, existing markers) rather
// than verbose JSON. Returns a string the model gets as the user message.
function buildAnalysisPrompt({ project, recordingDurationFrames, fps }) {
  const document = project?.document ?? project;
  const recording = document?.assets?.find?.((a) => a.type === 'recording') ?? null;
  const cursorEvents = recording?.cursorEvents ?? [];
  const clicks = cursorEvents.filter((e) => e?.type === 'down').length;
  const existingZoomMarkers = recording?.presentation?.zoom?.markers ?? [];
  const existingCuts = document?.cutRanges ?? [];
  const durationSeconds = fps > 0 ? recordingDurationFrames / fps : 0;

  return [
    `You are reviewing a screen recording for a video editor. Suggest concrete edits.`,
    ``,
    `Recording: ${recordingDurationFrames} frames at ${fps} fps (${durationSeconds.toFixed(1)} s).`,
    `Cursor events: ${cursorEvents.length} (${clicks} clicks).`,
    `Existing zoom markers: ${existingZoomMarkers.length}.`,
    `Existing cut ranges: ${existingCuts.length}.`,
    ``,
    `Return a JSON object matching this exact shape (no prose, no markdown):`,
    `{`,
    `  "summary": "one-paragraph description of what's in the recording",`,
    `  "title": "short title (max 60 chars)",`,
    `  "description": "1-2 sentence description",`,
    `  "zoomMarkers": [ { "id": "...", "startFrame": int, "endFrame": int,`,
    `    "focalPoint": { "x": float, "y": float }, "strength": float, "rationale": "..." } ],`,
    `  "cutRanges": [ { "id": "...", "startFrame": int, "endFrame": int, "rationale": "..." } ]`,
    `}`,
    ``,
    `Rules:`,
    `- startFrame >= 0, endFrame <= ${recordingDurationFrames}, endFrame > startFrame.`,
    `- focalPoint coordinates in [0, 1].`,
    `- strength in [0, 1].`,
    `- At most 5 zoomMarkers and 3 cutRanges.`,
    `- Prefer cutting silent intros/outros when supported by the event data.`,
    `- Do not suggest cuts that, combined, would remove every frame.`,
  ].join('\n');
}

function parseModelJson(text) {
  // Models occasionally wrap JSON in ```json fences despite instructions.
  // Strip a single ```json … ``` wrapper if present.
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  const raw = fenced ? fenced[1] : text;
  return JSON.parse(raw);
}

function toSuggestions(parsed) {
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

// analyzeProject — calls Claude with the structured prompt above, parses the
// JSON response, and returns an AiAnalysis-shaped object. Caller (renderer)
// runs validateSuggestion() on each entry before applying.
//
// Throws on:
//   - missing API key (caller should check getKeyStatus() first)
//   - HTTP non-200 from Anthropic
//   - JSON parse failure
export async function analyzeProject({ project, recordingDurationFrames, fps, model = DEFAULT_MODEL }) {
  const apiKey = await resolveApiKey();
  if (!apiKey) {
    const err = new Error('ANTHROPIC_API_KEY not configured');
    err.code = 'AI_KEY_MISSING';
    throw err;
  }
  if (!Number.isFinite(recordingDurationFrames) || recordingDurationFrames <= 0) {
    throw new Error('recordingDurationFrames must be a positive number');
  }

  const prompt = buildAnalysisPrompt({ project, recordingDurationFrames, fps });
  const body = {
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  };

  let response;
  try {
    response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const wrapped = new Error(`Anthropic request failed: ${err.message}`);
    wrapped.code = 'AI_NETWORK';
    throw wrapped;
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const err = new Error(`Anthropic returned ${response.status}: ${text.slice(0, 200)}`);
    err.code = 'AI_HTTP';
    err.status = response.status;
    throw err;
  }
  const payload = await response.json();
  const textBlocks = Array.isArray(payload?.content) ? payload.content : [];
  const text = textBlocks
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');
  if (!text.trim()) {
    const err = new Error('Anthropic response contained no text');
    err.code = 'AI_EMPTY_RESPONSE';
    throw err;
  }

  let parsed;
  try {
    parsed = parseModelJson(text);
  } catch (jsonErr) {
    const err = new Error(`Model output was not valid JSON: ${jsonErr.message}`);
    err.code = 'AI_PARSE';
    err.rawText = text;
    throw err;
  }

  return {
    summary: typeof parsed?.summary === 'string' ? parsed.summary : '',
    suggestions: toSuggestions(parsed),
    generatedAt: new Date().toISOString(),
    model,
  };
}
