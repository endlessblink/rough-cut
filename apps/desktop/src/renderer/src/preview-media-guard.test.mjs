import test from 'node:test';
import assert from 'node:assert/strict';
import { installPlayTracker, pauseAllPlayedMedia, silenceAfterStop } from './preview-media-guard.mjs';

function fakeProto() {
  return { play() { this.paused = false; return Promise.resolve(); } };
}

test('an element played through the tracker is paused on stop even if nothing else references it', () => {
  const proto = fakeProto();
  assert.equal(installPlayTracker(proto), true);
  assert.equal(installPlayTracker(proto), false, 'installs once');
  const stray = Object.create(proto);
  stray.paused = true; stray.isConnected = false;
  stray.pause = function pause() { this.paused = true; };
  stray.play();
  assert.equal(stray.paused, false);
  assert.equal(pauseAllPlayedMedia(), 1);
  assert.equal(stray.paused, true);
  assert.equal(pauseAllPlayedMedia(), 0);
});

test('stop silences now and again after 150 ms and 600 ms for late play promises', () => {
  const proto = fakeProto();
  installPlayTracker(proto);
  const late = Object.create(proto);
  late.paused = true; late.isConnected = true;
  late.pause = function pause() { this.paused = true; };
  const timers = [];
  silenceAfterStop((fn, ms) => timers.push({ fn, ms }));
  assert.deepEqual(timers.map((t) => t.ms), [150, 600]);
  late.play();
  timers[0].fn();
  assert.equal(late.paused, true);
});
