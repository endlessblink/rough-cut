import test from 'node:test';
import assert from 'node:assert/strict';
import { installPlayTracker, pauseAllPlayedMedia, silenceAfterStop, setGuardClock } from './preview-media-guard.mjs';

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

test('stop silences now and again after 150 ms and 600 ms', () => {
  let now = 500;
  setGuardClock(() => now);
  const proto = fakeProto();
  installPlayTracker(proto);
  const el = Object.create(proto);
  el.paused = true; el.isConnected = true;
  el.pause = function pause() { this.paused = true; };
  el.play(); // started before the stop
  now = 600;
  const timers = [];
  silenceAfterStop((fn, ms) => timers.push({ fn, ms }));
  assert.deepEqual(timers.map((t) => t.ms), [150, 600]);
  assert.equal(el.paused, true, 'paused straight away');
  el.paused = false; // a late play promise resumes it
  timers[0].fn();
  assert.equal(el.paused, true, 'paused again by the delayed pass');
});

test('playback started after Stop is left alone by the delayed silencing', () => {
  let now = 1000;
  setGuardClock(() => now);
  const proto = fakeProto();
  installPlayTracker(proto);
  const el = Object.create(proto);
  el.paused = true; el.isConnected = true;
  el.pause = function pause() { this.paused = true; };
  const timers = [];
  silenceAfterStop((fn, ms) => timers.push({ fn, ms }));
  now = 1100; // the user presses play again 100 ms after stop
  el.play();
  timers[0].fn(); timers[1].fn();
  assert.equal(el.paused, false, 'new playback must not be paused by the old stop');
});
