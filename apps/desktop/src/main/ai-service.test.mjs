import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

import { analyzeProject, buildAnalysisPrompt, getAiStatus } from './ai-service.mjs';

test('the AI view is available exactly when the Claude Code CLI is installed', () => {
  assert.deepEqual(getAiStatus({ binary: '/usr/bin/claude' }), { available: true, reason: null });
  const missing = getAiStatus({ binary: null });
  assert.equal(missing.available, false);
  assert.match(missing.reason, /not installed/);
});

test('analysis goes through the Claude Code login, never an API key', async () => {
  const source = await readFile(new URL('./ai-service.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /ANTHROPIC_API_KEY|api\.anthropic\.com|x-api-key|ai-config\.json/);
  assert.match(source, /askClaudeForJson/);
});

test('suggestions come back shaped for the AI view', async () => {
  let request;
  const ask = async (options) => {
    request = options;
    return {
      ok: true,
      value: {
        summary: 'A short demo.',
        title: 'Fixing the compressor',
        description: 'Walkthrough.',
        zoomMarkers: [{ startFrame: 10, endFrame: 60, focalPoint: { x: 0.4, y: 0.6 }, strength: 0.5, rationale: 'click' }],
        cutRanges: [{ startFrame: 0, endFrame: 15, rationale: 'silent intro' }],
      },
    };
  };
  const analysis = await analyzeProject({ project: { document: { assets: [] } }, recordingDurationFrames: 300, fps: 30, ask });
  assert.equal(analysis.summary, 'A short demo.');
  assert.deepEqual(analysis.suggestions.map((s) => s.kind), ['zoom-marker', 'cut-range', 'title']);
  assert.ok(request.schema.required.includes('zoomMarkers'));
  assert.match(request.buildPrompt([]), /300 frames at 30 fps/);
  assert.match(request.buildPrompt(['bad json']), /rejected: bad json/);
});

test('a Claude failure surfaces its plain reason', async () => {
  const ask = async () => ({ ok: false, reason: 'Claude reported an error: Not logged in' });
  await assert.rejects(
    analyzeProject({ project: {}, recordingDurationFrames: 300, fps: 30, ask }),
    (error) => error.code === 'AI_CLAUDE' && /Not logged in/.test(error.message),
  );
});

test('the prompt carries the recording signals and bounds', () => {
  const prompt = buildAnalysisPrompt({ project: { document: { assets: [{ type: 'recording', cursorEvents: [{ type: 'down' }, { type: 'move' }] }] } }, recordingDurationFrames: 90, fps: 30 });
  assert.match(prompt, /Cursor events: 2 \(1 clicks\)/);
  assert.match(prompt, /endFrame <= 90/);
});
