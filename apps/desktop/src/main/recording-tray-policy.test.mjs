import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { planTrayUpdate } from './recording-tray-policy.mjs';

test('light disappears once a take is saved or discarded', () => {
  for (const state of ['saved', 'discarded']) {
    for (const hasTray of [true, false]) {
      for (const hasWindow of [true, false]) {
        assert.equal(planTrayUpdate({ hasTray, hasWindow, state }), 'destroy');
      }
    }
  }
});

test('stopping/pausing/cancelling from the visible window never creates a light', () => {
  for (const state of ['finalizing', 'paused', 'restarting', 'canceling', 'recording']) {
    assert.equal(planTrayUpdate({ hasTray: false, hasWindow: false, state }), 'skip');
  }
});

test('hidden-recorder flow creates and updates the light', () => {
  assert.equal(planTrayUpdate({ hasTray: false, hasWindow: true, state: 'recording' }), 'show');
  assert.equal(planTrayUpdate({ hasTray: true, hasWindow: false, state: 'paused' }), 'show');
});

test('full take from the visible window: light never appears, nothing lingers', () => {
  let tray = false;
  const run = (state, hasWindow = false) => {
    const plan = planTrayUpdate({ hasTray: tray, hasWindow, state });
    if (plan === 'destroy') tray = false;
    if (plan === 'show') tray = true;
  };
  run('recording'); run('paused'); run('recording'); run('finalizing'); run('saved');
  assert.equal(tray, false);
});

test('full hidden take: light shows while recording, gone after stop and after cancel', () => {
  for (const end of ['saved', 'discarded']) {
    let tray = false;
    const run = (state, hasWindow = false) => {
      const plan = planTrayUpdate({ hasTray: tray, hasWindow, state });
      if (plan === 'destroy') tray = false;
      if (plan === 'show') tray = true;
    };
    run('recording', true);
    assert.equal(tray, true);
    run('finalizing'); run(end);
    assert.equal(tray, false);
  }
});

test('main process routes every tray change through the policy', () => {
  const src = readFileSync(new URL('./index.mjs', import.meta.url), 'utf8');
  assert.match(src, /planTrayUpdate\(/);
  assert.doesNotMatch(src, /function updateRecordingTray[\s\S]{0,200}new Tray\(icon\)[\s\S]{0,0}$/);
});
