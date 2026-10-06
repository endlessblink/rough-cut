import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEVELING_MAX_GAIN_DB,
  buildLevelingArgs,
  levelingGainDb,
  parseIntegratedLufs,
} from './export-leveling.mjs';

test('quiet exports are lifted toward -16 LUFS', () => {
  assert.equal(levelingGainDb(-28), 12);
  assert.equal(levelingGainDb(-31.9), 15.9);
});

test('exports that are loud enough are left alone', () => {
  assert.equal(levelingGainDb(-22), null);
  assert.equal(levelingGainDb(-16), null);
  assert.equal(levelingGainDb(-9), null);
});

test('the lift is capped and silence or unreadable audio is ignored', () => {
  assert.equal(levelingGainDb(-60), LEVELING_MAX_GAIN_DB);
  assert.equal(levelingGainDb(null), null);
  assert.equal(levelingGainDb(Number.NEGATIVE_INFINITY), null);
});

test('reads the integrated loudness from the ebur128 summary only', () => {
  const stderr = [
    '[Parsed_ebur128_0] t: 3.4  M: -30 S: -31  I: -40.0 LUFS  LRA: 1.0 LU',
    '[Parsed_ebur128_0] Summary:',
    '',
    '  Integrated loudness:',
    '    I:         -28.0 LUFS',
    '    Threshold: -38.0 LUFS',
  ].join('\n');
  assert.equal(parseIntegratedLufs(stderr), -28);
  assert.equal(parseIntegratedLufs('no loudness here'), null);
});

test('the leveling pass copies video and limits peaks', () => {
  const args = buildLevelingArgs({ inputPath: 'in.mp4', outputPath: 'out.mp4', gainDb: 12 });
  assert.ok(args.includes('copy'));
  assert.ok(args.some((arg) => arg.startsWith('volume=12dB,alimiter')));
});
