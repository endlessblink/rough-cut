import test from 'node:test';
import assert from 'node:assert/strict';
import { isUiPath, validateFindings, UI_PROOF_CHECKLIST } from './ui-visual-proof-lib.mjs';

test('visual proof gate recognizes renderer behavior and presentation files', () => {
  assert.equal(isUiPath('apps/desktop/src/renderer/src/editor.tsx'), true);
  assert.equal(isUiPath('apps/desktop/src/renderer/src/styles.css'), true);
  assert.equal(isUiPath('apps/desktop/src/renderer/src/model.mjs'), true);
  assert.equal(isUiPath('vendor/freecut/src/main.tsx'), true);
});

test('visual proof gate ignores backend, generated, and documentation files', () => {
  assert.equal(isUiPath('apps/desktop/src/main/index.mjs'), false);
  assert.equal(isUiPath('apps/desktop/dist/renderer/index.js'), false);
  assert.equal(isUiPath('DESIGN.md'), false);
});

test('visual proof findings require every review gate', () => {
  const findings = UI_PROOF_CHECKLIST.join(' ');
  assert.doesNotThrow(() => validateFindings(findings));
  assert.throws(() => validateFindings('dock=pass layout=pass'), /visual proof findings must include/i);
});
