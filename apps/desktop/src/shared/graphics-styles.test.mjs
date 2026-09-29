import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CREATIVITY_LEVELS, GRAPHIC_STYLES, normalizeCreativity, resolveCreativity, resolveGraphicStyle } from './graphics-styles.mjs';

test('every style has a unique id and a complete brief with Hebrew-capable fonts', () => {
  const ids = new Set();
  for (const style of GRAPHIC_STYLES) {
    assert.ok(!ids.has(style.id), style.id);
    ids.add(style.id);
    for (const key of ['label', 'mood', 'brief', 'fonts', 'motion']) assert.ok(style[key]?.length > 3, `${style.id}.${key}`);
    assert.match(style.fonts, /Hebrew:/, style.id);
  }
});

test('creativity is five levels, clamped, with Calm at 1 and Wild at 5', () => {
  assert.equal(CREATIVITY_LEVELS.length, 5);
  assert.equal(resolveCreativity(1).label, 'Calm');
  assert.equal(resolveCreativity(5).label, 'Wild');
  assert.equal(normalizeCreativity(0), 1);
  assert.equal(normalizeCreativity('4'), 4);
  assert.equal(normalizeCreativity('x'), 3);
  assert.equal(resolveGraphicStyle('noir').label, 'Shadow Cut');
  assert.equal(resolveGraphicStyle(undefined).id, 'studio');
});
