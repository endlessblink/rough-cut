import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATE_STUBS, findTemplateStub } from './template-stubs.mjs';

test('TEMPLATE_STUBS exposes the documented three entries with the right aspect ratios', () => {
  const byId = Object.fromEntries(TEMPLATE_STUBS.map((t) => [t.id, t]));
  assert.equal(TEMPLATE_STUBS.length, 3);
  assert.equal(byId['short-form-vlog'].aspectRatio, '9:16');
  assert.equal(byId['tutorial'].aspectRatio, '16:9');
  assert.equal(byId['podcast-clip'].aspectRatio, '1:1');
});

test('every stub has a non-empty label and description', () => {
  for (const stub of TEMPLATE_STUBS) {
    assert.ok(stub.label.length > 0, `${stub.id} label`);
    assert.ok(stub.description.length > 0, `${stub.id} description`);
  }
});

test('findTemplateStub returns the matching stub by id', () => {
  assert.equal(findTemplateStub('tutorial')?.aspectRatio, '16:9');
  assert.equal(findTemplateStub('podcast-clip')?.aspectRatio, '1:1');
});

test('findTemplateStub returns null for unknown / invalid ids', () => {
  assert.equal(findTemplateStub('nope'), null);
  assert.equal(findTemplateStub(''), null);
  assert.equal(findTemplateStub(null), null);
  assert.equal(findTemplateStub(undefined), null);
});
