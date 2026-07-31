import test from 'node:test';
import assert from 'node:assert/strict';
import { isUiPath } from './ui-visual-proof-lib.mjs';

test('visual proof gate recognizes renderer behavior and presentation files', () => {
  assert.equal(isUiPath('apps/desktop/src/renderer/src/editor.tsx'), true);
  assert.equal(isUiPath('apps/desktop/src/renderer/src/styles.css'), true);
  assert.equal(isUiPath('apps/desktop/src/renderer/src/model.mjs'), true);
});

test('visual proof gate ignores backend, generated, and documentation files', () => {
  assert.equal(isUiPath('apps/desktop/src/main/index.mjs'), false);
  assert.equal(isUiPath('apps/desktop/dist/renderer/index.js'), false);
  assert.equal(isUiPath('DESIGN.md'), false);
});
