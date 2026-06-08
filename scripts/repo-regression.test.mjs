import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const benchmarkSource = readFileSync(join(root, 'scripts/benchmark-export.mjs'), 'utf8');
const packageLinuxSource = readFileSync(join(root, 'scripts/package-linux.mjs'), 'utf8');

test('root test command runs repo-level script regression tests', () => {
  assert.match(rootPackage.scripts.test, /node --test scripts\/repo-regression\.test\.mjs scripts\/export-benchmark-utils\.test\.mjs/);
});

test('stale root handoff files stay removed', () => {
  assert.equal(existsSync(join(root, 'HANDOFF.md')), false);
  assert.equal(existsSync(join(root, 'NEXT_SESSION_PROMPT.md')), false);
});

test('export benchmark keeps profiling and fast-path report coverage', () => {
  for (const caseId of [
    'profile-cursor-move-only',
    'profile-shadow-off',
    'profile-square-no-shadow',
    'profile-cut-ranges',
  ]) {
    assert.match(benchmarkSource, new RegExp(`id: '${caseId}'`));
  }
  assert.match(benchmarkSource, /fastPath: exportResult\.fastPath \?\? null/);
  assert.match(benchmarkSource, /profiling: buildProfilingSummary\(results\)/);
  assert.match(benchmarkSource, /optimizationCandidates: rankOptimizationCandidates\(comparisons\)/);
  assert.match(benchmarkSource, /compareTo: 'styled-basic'/);
});

test('linux package copies main-process workspace dependencies', () => {
  for (const packageName of [
    'project-model',
    'timeline-engine',
    'effect-registry',
    'frame-resolver',
  ]) {
    assert.match(packageLinuxSource, new RegExp(`'${packageName}'`));
  }
  assert.match(packageLinuxSource, /cpWorkspacePackage\(packageName\)/);
  assert.match(packageLinuxSource, /join\(appRoot, 'packages', packageName, 'dist'\)/);
});
