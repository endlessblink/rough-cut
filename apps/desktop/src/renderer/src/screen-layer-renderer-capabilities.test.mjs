import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const here = new URL('.', import.meta.url).pathname;
const source = readFileSync(join(here, 'screen-layer-renderer-capabilities.ts'), 'utf8');

test('preview renderer ladder keeps WebGPU first and Canvas2D last', () => {
  assert.match(source, /export const PREVIEW_RENDERER_LADDER/);
  assert.match(source, /'webgpu-external-texture'[\s\S]*'webgl2-videoframe'[\s\S]*'webgl'[\s\S]*'canvas2d'/);
});

test('WebGPU tier requires a complete external texture probe', () => {
  assert.match(source, /function webGpuExternalTextureReady/);
  assert.match(source, /probe\.device\?\.importExternalTexture !== 'function'/);
  assert.match(source, /steps\.navigatorGpu\?\.ok/);
  assert.match(source, /steps\.requestAdapter\?\.ok/);
  assert.match(source, /steps\.requestDevice\?\.ok/);
  assert.match(source, /steps\.importExternalTextureVideo\?\.ok \|\| steps\.importExternalTextureVideoFrame\?\.ok/);
});

test('renderer selection falls through to existing safe fallback tiers', () => {
  assert.match(source, /if \(webGpuExternalTextureReady\(input\.webgpu\)\) return 'webgpu-external-texture'/);
  assert.match(source, /if \(input\.webgl2\) return 'webgl2-videoframe'/);
  assert.match(source, /if \(input\.webgl\) return 'webgl'/);
  assert.match(source, /return 'canvas2d'/);
});
