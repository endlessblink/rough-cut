/**
 * Starting straight into Recording asks for the compact recorder profile while the
 * window's own "maximize" follow-ups are still pending. If those follow-ups fire later,
 * they re-expand the recorder to full screen (smoke:recording-startup-ui caught this).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.mjs', import.meta.url), 'utf8');

test('ready-to-show does not maximize a window already in the recorder profile', () => {
  assert.match(source, /once\('ready-to-show', \(\) => \{\s*if \(!studioWindowBoundsById\.has\(window\.id\)\) maximizeStudioWindow\(window\);/);
});

test('the recorder profile cancels the pending maximize fallback timer', () => {
  assert.match(source, /if \(profile === 'recording'\) \{\s*cancelMaximizeFallback\(senderWindow\);/);
});
