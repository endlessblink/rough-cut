import test from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY_PREDICATES, findPredicate } from './predicates.mjs';

const NOW = new Date('2026-05-17T15:00:00.000Z');

function makeSummary(over = {}) {
  return {
    path: '/x.roughcut',
    name: 'x',
    modifiedAt: null,
    createdAt: null,
    durationMs: 0,
    durationFrames: 0,
    frameRate: 30,
    hasCamera: false,
    thumbnailUrl: null,
    recordingUrl: null,
    width: 1920,
    height: 1080,
    resolutionLabel: '1080p',
    ...over,
  };
}

test('has-camera matches when hasCamera is true', () => {
  const pred = findPredicate('has-camera');
  assert.ok(pred);
  assert.equal(pred.matches(makeSummary({ hasCamera: true })), true);
  assert.equal(pred.matches(makeSummary({ hasCamera: false })), false);
});

test('today matches modifiedAt within today (local-day boundary, same as date-group headers)', () => {
  const pred = findPredicate('today');
  assert.ok(pred);
  // Both 10:00 UTC May 17 (= 13:00 in any common +TZ) and 22:00 UTC May 17 are
  // unambiguously inside "today" relative to NOW=2026-05-17T15:00Z.
  assert.equal(pred.matches(makeSummary({ modifiedAt: '2026-05-17T10:00:00.000Z' }), NOW), true);
  // Pick a date two days back so it's "yesterday or earlier" in every TZ.
  assert.equal(pred.matches(makeSummary({ modifiedAt: '2026-05-15T10:00:00.000Z' }), NOW), false);
});

test('long-takes matches when durationMs >= 60s', () => {
  const pred = findPredicate('long-takes');
  assert.ok(pred);
  assert.equal(pred.matches(makeSummary({ durationMs: 60_000 })), true);
  assert.equal(pred.matches(makeSummary({ durationMs: 59_999 })), false);
});

test('predicates tolerate missing/null fields without throwing', () => {
  for (const pred of LIBRARY_PREDICATES) {
    assert.doesNotThrow(() => pred.matches({}), `${pred.id} threw on empty summary`);
    assert.doesNotThrow(() => pred.matches({ modifiedAt: 'not-a-date' }, NOW), `${pred.id} threw on bad date`);
  }
});

test('findPredicate returns null for unknown id', () => {
  assert.equal(findPredicate('nope'), null);
});
