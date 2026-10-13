import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createUiohookButtonListener, isUiohookAvailable } from './uiohook-button-listener.mjs';

function fakeHook() {
  const hook = new EventEmitter();
  hook.started = 0;
  hook.stopped = 0;
  hook.start = () => { hook.started += 1; };
  hook.stop = () => { hook.stopped += 1; };
  return hook;
}

test('uiohook buttons are translated to the recording schema (right and middle swap)', () => {
  const hook = fakeHook();
  const buttons = [];
  const listener = createUiohookButtonListener({ onButton: (e) => buttons.push(e), loadHook: () => hook });
  assert.equal(listener.start(), true);
  hook.emit('mousedown', { button: 1, x: 400, y: 300 });
  hook.emit('mouseup', { button: 1, x: 401, y: 301 });
  hook.emit('mousedown', { button: 2, x: 500, y: 350 }); // right in uiohook
  hook.emit('mousedown', { button: 3, x: 600, y: 400 }); // middle in uiohook
  hook.emit('mousedown', { button: 4, x: 1, y: 1 }); // side button: ignored
  assert.deepEqual(buttons, [
    { type: 'down', button: 0, x: 400, y: 300 },
    { type: 'up', button: 0, x: 401, y: 301 },
    { type: 'down', button: 2, x: 500, y: 350 },
    { type: 'down', button: 1, x: 600, y: 400 },
  ]);
});

test('motion and key events carry coordinates; keys report only the key code and the last pointer position', () => {
  const hook = fakeHook();
  const motions = [];
  const keys = [];
  const listener = createUiohookButtonListener({ onButton: () => {}, onMotion: (e) => motions.push(e), onKey: (e) => keys.push(e), loadHook: () => hook });
  listener.start();
  hook.emit('keydown', { keycode: 30, rawcode: 65, ctrlKey: false });
  hook.emit('mousemove', { x: 10, y: 20 });
  hook.emit('keydown', { keycode: 42, shiftKey: true });
  assert.deepEqual(motions, [{ x: 10, y: 20 }]);
  assert.deepEqual(keys, [{ keyCode: 30, x: null, y: null }, { keyCode: 42, x: 10, y: 20 }]);
  assert.equal(Object.hasOwn(keys[0], 'rawcode'), false);
});

test('stop removes only this listener and stops the hook; start is idempotent', () => {
  const hook = fakeHook();
  const other = [];
  hook.on('mousedown', (e) => other.push(e));
  const listener = createUiohookButtonListener({ onButton: () => {}, loadHook: () => hook });
  assert.equal(listener.start(), true);
  assert.equal(listener.start(), true);
  assert.equal(hook.started, 1);
  listener.stop();
  assert.equal(hook.stopped, 1);
  assert.equal(hook.listenerCount('mousedown'), 1);
  hook.emit('mousedown', { button: 1, x: 0, y: 0 });
  assert.equal(other.length, 1);
});

test('an unavailable native module degrades to no telemetry instead of throwing', () => {
  const loadHook = () => { throw new Error('module missing'); };
  const listener = createUiohookButtonListener({ onButton: () => {}, loadHook });
  assert.equal(listener.start(), false);
  assert.equal(isUiohookAvailable({ loadHook }), false);
  listener.stop();
});

test('a hook that fails to start leaves no handlers behind', () => {
  const hook = fakeHook();
  hook.start = () => { throw new Error('denied'); };
  const listener = createUiohookButtonListener({ onButton: () => {}, loadHook: () => hook });
  assert.equal(listener.start(), false);
  assert.equal(hook.listenerCount('mousedown'), 0);
});

test('the real uiohook-napi module loads on Windows', { skip: process.platform !== 'win32' && 'Windows only' }, () => {
  assert.equal(isUiohookAvailable(), true);
});
