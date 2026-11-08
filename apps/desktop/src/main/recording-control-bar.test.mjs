import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTROL_BAR_ACTION_PREFIX,
  buildControlBarHtml,
  controlBarPosition,
  controlBarSupported,
  formatControlBarClock,
  parseControlBarTitle,
} from './recording-control-bar.mjs';

test('the bar reports its three buttons through the page title and ignores anything else', () => {
  assert.equal(parseControlBarTitle(`${CONTROL_BAR_ACTION_PREFIX}pause:3`), 'pause');
  assert.equal(parseControlBarTitle(`${CONTROL_BAR_ACTION_PREFIX}resume:1`), 'resume');
  assert.equal(parseControlBarTitle(`${CONTROL_BAR_ACTION_PREFIX}stop:7`), 'stop');
  assert.equal(parseControlBarTitle(`${CONTROL_BAR_ACTION_PREFIX}format-disk:1`), null);
  assert.equal(parseControlBarTitle('Recording controls'), null);
  assert.equal(parseControlBarTitle(undefined), null);
});

test('the bar page has the three buttons and valid inline script', () => {
  const html = buildControlBarHtml();
  for (const id of ['pause', 'resume', 'stop', 'clock']) assert.match(html, new RegExp(`id="${id}"`));
  const script = /<script>([\s\S]*)<\/script>/.exec(html)[1];
  assert.doesNotThrow(() => new Function(script));
});

test('the bar is only shown where it is excluded from capture', () => {
  assert.equal(controlBarSupported('win32'), true);
  assert.equal(controlBarSupported('darwin'), true);
  assert.equal(controlBarSupported('linux'), false);
});

test('the clock and the position', () => {
  assert.equal(formatControlBarClock(0), '00:00');
  assert.equal(formatControlBarClock(65_900), '01:05');
  assert.equal(formatControlBarClock(3_725_000), '1:02:05');
  assert.deepEqual(controlBarPosition({ x: 0, y: 40, width: 1920, height: 1000 }, { width: 232, height: 52 }), { x: 844, y: 52, width: 232, height: 52 });
});