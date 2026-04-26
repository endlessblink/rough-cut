import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCaptureSourceInfo } from './resolve-capture-source-info.mjs';

function makeDisplay(id, { x = 0, y = 0, width = 1920, height = 1080, scaleFactor = 1 } = {}) {
  return { id, bounds: { x, y, width, height }, scaleFactor, label: `display-${id}` };
}

// Passthrough that returns the display's bounds — isolates ID-resolution
// logic from the scaleFactor/X11 math in the real getDisplayCaptureBounds.
function identityBounds(display) {
  return { ...display.bounds, scaleFactor: display.scaleFactor ?? 1 };
}

test('returns null when selectedSourceId is missing', () => {
  const result = resolveCaptureSourceInfo({
    selectedSourceId: null,
    displays: [makeDisplay(1)],
    cachedCaptureSources: [],
    x11DisplayName: ':0',
    getDisplayCaptureBounds: identityBounds,
  });
  assert.equal(result, null);
});

test('returns null for window sources (x11grab cannot target a window)', () => {
  const result = resolveCaptureSourceInfo({
    selectedSourceId: 'window:123:0',
    displays: [makeDisplay(1)],
    cachedCaptureSources: [],
    x11DisplayName: ':0',
    getDisplayCaptureBounds: identityBounds,
  });
  assert.equal(result, null);
});

// Regression guard for commit e736a45: selectedSourceId's middle segment is
// an Electron display.id (potentially a large integer), NOT an array index.
// Treating it as an index on multi-monitor setups silently falls back to
// displays[0] (the primary), so the user's chosen monitor is ignored.
test('resolves the correct display by id on a multi-monitor setup (not by array index)', () => {
  const primary = makeDisplay(10, { x: 0, y: 0, width: 1920, height: 1080 });
  const secondary = makeDisplay(2147483647, { x: 1920, y: 0, width: 2560, height: 1440 });

  const result = resolveCaptureSourceInfo({
    selectedSourceId: 'screen:2147483647:0',
    displays: [primary, secondary],
    cachedCaptureSources: [],
    x11DisplayName: ':0',
    getDisplayCaptureBounds: identityBounds,
  });

  assert.ok(result);
  assert.equal(result.width, 2560);
  assert.equal(result.height, 1440);
  assert.equal(result.offsetX, 1920);
  assert.equal(result.offsetY, 0);
  assert.equal(result.display, ':0+1920,0');
  assert.equal(result.sourceId, 'screen:2147483647:0');
});

test('prefers cachedCaptureSources.displayId over the id parsed from selectedSourceId', () => {
  const primary = makeDisplay(10);
  const secondary = makeDisplay(20, { x: 1920, y: 0, width: 1280, height: 720 });

  // selectedSourceId claims display.id=10 but the cached source says it really
  // points to display.id=20. Cache wins — it's set at source-pick time and is
  // the most stable mapping.
  const result = resolveCaptureSourceInfo({
    selectedSourceId: 'screen:10:0',
    displays: [primary, secondary],
    cachedCaptureSources: [{ id: 'screen:10:0', displayId: 20 }],
    x11DisplayName: ':0',
    getDisplayCaptureBounds: identityBounds,
  });

  assert.equal(result.width, 1280);
  assert.equal(result.offsetX, 1920);
});

test('falls back to displays[0] only when no id matches', () => {
  const primary = makeDisplay(10);
  const secondary = makeDisplay(20, { x: 1920, y: 0, width: 1280, height: 720 });

  const result = resolveCaptureSourceInfo({
    selectedSourceId: 'screen:99999:0',
    displays: [primary, secondary],
    cachedCaptureSources: [],
    x11DisplayName: ':0',
    getDisplayCaptureBounds: identityBounds,
  });

  assert.equal(result.width, primary.bounds.width);
  assert.equal(result.offsetX, 0);
});

test('returns null when displays is empty', () => {
  const result = resolveCaptureSourceInfo({
    selectedSourceId: 'screen:10:0',
    displays: [],
    cachedCaptureSources: [],
    x11DisplayName: ':0',
    getDisplayCaptureBounds: identityBounds,
  });
  assert.equal(result, null);
});

test('invokes logDiagnostic with the resolved display id', () => {
  let captured = null;
  resolveCaptureSourceInfo({
    selectedSourceId: 'screen:20:0',
    displays: [makeDisplay(10), makeDisplay(20)],
    cachedCaptureSources: [],
    x11DisplayName: ':0',
    getDisplayCaptureBounds: identityBounds,
    logDiagnostic: (info) => {
      captured = info;
    },
  });

  assert.ok(captured);
  assert.equal(captured.displayId, 20);
});
