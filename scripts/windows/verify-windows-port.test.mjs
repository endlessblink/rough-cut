import assert from 'node:assert/strict';
import test from 'node:test';
import { EVIDENCE_KEYS, parseFfmpegCapabilities, parseTestSummary, validateEvidence } from './verify-windows-port.mjs';

const good = (extra = {}) => ({ status: 'passed', confirmedBy: 'user', confirmedAt: '2026-10-13T10:00:00Z', note: 'checked on laptop', ...extra });

test('evidence passes only when every key is a user-confirmed pass with a note', () => {
  const all = Object.fromEntries(Object.keys(EVIDENCE_KEYS).map((key) => [key, good()]));
  assert.equal(validateEvidence(all).ok, true);
  assert.deepEqual(validateEvidence({}).missing, Object.keys(EVIDENCE_KEYS));
});

test('evidence written by anything other than the user, or without a note, does not count', () => {
  const key = Object.keys(EVIDENCE_KEYS)[0];
  assert.deepEqual(validateEvidence({ [key]: good({ confirmedBy: 'claude' }) }, [key]).missing, [key]);
  assert.deepEqual(validateEvidence({ [key]: good({ note: '' }) }, [key]).missing, [key]);
  assert.deepEqual(validateEvidence({ [key]: good({ status: 'failed' }) }, [key]).missing, [key]);
});

test('test summary is parsed from the node test reporter', () => {
  assert.deepEqual(parseTestSummary('ℹ tests 1136\nℹ pass 1078\nℹ fail 45\nℹ skipped 13\n'), { tests: 1136, pass: 1078, fail: 45, skipped: 13 });
  assert.equal(parseTestSummary('nothing').tests, null);
});

test('ffmpeg capabilities are read from encoder, device and filter listings', () => {
  const caps = parseFfmpegCapabilities(' V....D libx264  H.264', ' D  dshow  DirectShow\n D  gdigrab  GDI', ' ddagrab   Grab Windows Desktop');
  assert.deepEqual(caps, { libx264: true, gdigrab: true, dshow: true, ddagrab: true });
  assert.equal(parseFfmpegCapabilities('', '', '').libx264, false);
});
