import test from 'node:test';
import assert from 'node:assert/strict';
import { groupSummariesByDate } from './group-by-date.mjs';

const NOW = new Date('2026-05-16T15:00:00.000Z');

function makeSummary(path, modifiedAt) {
  return { path, name: path, modifiedAt, durationMs: 1000, durationFrames: 30, frameRate: 30, hasCamera: false, thumbnailUrl: null, recordingUrl: null, width: 1920, height: 1080, resolutionLabel: '1080p', createdAt: modifiedAt };
}

test('groupSummariesByDate buckets across today/yesterday/this-week/this-month/earlier', () => {
  const items = [
    makeSummary('a', '2026-05-16T10:00:00.000Z'),       // today
    makeSummary('b', '2026-05-15T20:00:00.000Z'),       // yesterday
    makeSummary('c', '2026-05-13T20:00:00.000Z'),       // this week (3 days ago)
    makeSummary('d', '2026-04-28T20:00:00.000Z'),       // this month (~18 days ago)
    makeSummary('e', '2026-02-01T20:00:00.000Z'),       // earlier
  ];
  const groups = groupSummariesByDate(items, NOW);
  assert.deepEqual(groups.map((g) => g.id), ['today', 'yesterday', 'this-week', 'this-month', 'earlier']);
  assert.deepEqual(groups.map((g) => g.items.map((i) => i.path)), [['a'], ['b'], ['c'], ['d'], ['e']]);
});

test('empty buckets are dropped from the output', () => {
  const items = [makeSummary('a', '2026-05-16T10:00:00.000Z')];
  const groups = groupSummariesByDate(items, NOW);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, 'today');
});

test('items with missing/invalid modifiedAt fall into Earlier', () => {
  const items = [
    makeSummary('a', null),
    makeSummary('b', 'not-a-date'),
  ];
  const groups = groupSummariesByDate(items, NOW);
  assert.deepEqual(groups.map((g) => g.id), ['earlier']);
  assert.equal(groups[0].items.length, 2);
});

test('a project saved exactly at the day boundary lands in today, not yesterday', () => {
  const groups = groupSummariesByDate([makeSummary('boundary', '2026-05-16T00:00:00.000Z')], NOW);
  assert.equal(groups[0].id, 'today');
});

test('input order is preserved within each bucket', () => {
  const items = [
    makeSummary('a', '2026-05-16T11:00:00.000Z'),
    makeSummary('b', '2026-05-16T13:00:00.000Z'),
    makeSummary('c', '2026-05-16T09:00:00.000Z'),
  ];
  const groups = groupSummariesByDate(items, NOW);
  assert.deepEqual(groups[0].items.map((i) => i.path), ['a', 'b', 'c']);
});
