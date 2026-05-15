import test from 'node:test';
import assert from 'node:assert/strict';
import { appError, errorStateCopy } from './app-error-copy.mjs';

test('maps disk failures to actionable copy', () => {
  const copy = errorStateCopy(appError('recording', new Error('ENOSPC: no space left on device')));
  assert.equal(copy.title, 'Not enough space to finish');
  assert.match(copy.detail, /Free space/);
});

test('maps permission failures to actionable copy', () => {
  const copy = errorStateCopy(appError('export', new Error('Permission denied')));
  assert.equal(copy.title, 'Rough Cut cannot access that location');
  assert.match(copy.detail, /writable folder/);
});

test('maps ffmpeg failures to diagnostics-first copy', () => {
  const copy = errorStateCopy(appError('export', new Error('ffmpeg exited unexpectedly')));
  assert.equal(copy.title, 'FFmpeg stopped unexpectedly');
  assert.match(copy.detail, /Open diagnostics/);
});

test('maps stale Electron main process export cancel failures to restart copy', () => {
  const copy = errorStateCopy(appError('export', new Error("Error invoking remote method 'export:cancel': Error: No handler registered for 'export:cancel'")));
  assert.equal(copy.title, 'Export cancel is not available yet');
  assert.match(copy.detail, /Restart Rough Cut/);
});

test('keeps source-specific recording and export fallback copy', () => {
  assert.equal(errorStateCopy(appError('recording', 'Camera is enabled but no camera device is selected.')).title, 'Recording could not continue');
  assert.equal(errorStateCopy(appError('export', 'Output path was not writable.')).title, 'Export did not finish');
});
