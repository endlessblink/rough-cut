import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

test('Generated asset panel is wired to AI asset IPC and filtering controls', () => {
  const source = readFileSync(join(here, 'asset-panel.tsx'), 'utf8');

  assert.match(source, /listAiAssets/);
  assert.match(source, /data-ui-region="nle-generated-assets"/);
  assert.match(source, /type="search"/);
  assert.match(source, /Generated asset type filter/);
  assert.match(source, /aria-pressed=\{filter === item\.id\}/);
  assert.match(source, /asset\.sourcePrompt/);
  assert.match(source, /asset\.providerId/);
  assert.match(source, /asset\.sessionId/);
  assert.match(source, /\.some\(\(value\) => value\.toLowerCase\(\)\.includes\(needle\)\)/);
});

test('Generated asset panel renders kind-specific previews', () => {
  const source = readFileSync(join(here, 'asset-panel.tsx'), 'utf8');

  assert.match(source, /asset\.kind === 'image'/);
  assert.match(source, /<img className="nleAssetThumb generated"/);
  assert.match(source, /asset\.kind === 'video'/);
  assert.match(source, /<video className="nleAssetThumb generated"/);
  assert.match(source, /asset\.kind === 'audio'/);
  assert.match(source, /aria-label="Audio preview"/);
  assert.match(source, /aria-label="Motion graphics preview"/);
  assert.match(source, /draggable/);
  assert.match(source, /application\/x-rough-cut-ai-asset/);
});

test('Generated asset panel styles stay compact and product-like', () => {
  const css = readFileSync(join(here, '..', 'styles.css'), 'utf8');

  assert.match(css, /\.nleGeneratedControls\s*{/);
  assert.match(css, /\.nleGeneratedSearch input\s*{/);
  assert.match(css, /\.nleGeneratedFilters button\[aria-pressed="true"\]/);
  assert.match(css, /\.nleAssetItem\.generated\s*{/);
  assert.match(css, /\.nleTrackLaneBody\.generatedDropValid/);
  assert.match(css, /\.nleTrackLaneBody\.generatedDropInvalid/);
  assert.match(css, /\.nleGeneratedSkeleton\s*{/);
  assert.doesNotMatch(css, /\.nleAssetItem\.generated\s*{[^}]*border-left:\s*[2-9]/s);
  assert.doesNotMatch(css, /\.nleAssetItem\.generated\s*{[^}]*border-right:\s*[2-9]/s);
});
