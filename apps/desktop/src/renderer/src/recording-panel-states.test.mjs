import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const src = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');

test('Recording tab live panel replaces duplicate top-bar controls and banner', () => {
  assert.match(src, /const liveTakePanelShown = activeAppView === 'recording' && recording\.state === 'recording'/);
  for (const handler of ['togglePauseRecording', 'restartRecording', 'cancelRecording']) {
    const re = new RegExp(`recording\\.state === 'recording' && !liveTakePanelShown \\? \\(\\s*<button[^>]*onClick=\\{${handler}\\}`);
    assert.match(src, re, `${handler} top-bar button must hide while the live panel is shown`);
  }
  assert.match(src, /\{liveTakePanelShown \? null : <StateBanner/);
});

test('live panel is declared before use in the editor shell', () => {
  assert.ok(src.indexOf('const liveTakePanelShown') < src.indexOf('liveTakePanelShown ? null'));
});

test('Recording tab shows the live panel only while recording, setup page otherwise', () => {
  const block = src.slice(src.indexOf("activeAppView === 'recording' ? (\n            <section className=\"recordingWorkspace\""));
  assert.match(block.slice(0, 400), /recording\.state === 'recording' \? \(\s*<RecordingLauncherActive/);
  assert.match(block.slice(0, 2600), /<PreRecordPanel\s+variant="workspace"/);
});

test('top Record button flips back to Record once the state is no longer recording', () => {
  assert.match(src, /className=\{recording\.state === 'recording' \? 'stop primaryAction' : 'primaryAction'\}/);
  assert.match(src, /setRecording\(status\)/);
});

test('top-bar primary Record/Stop button is hidden while the Recording tab shows its live panel', () => {
  assert.match(src, /\{liveTakePanelShown \? null : \(\s*<button\s+type="button"\s+onClick=\{handlePrimaryRecordAction\}/);
});
