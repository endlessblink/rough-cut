import { test } from 'node:test';
import * as assert from 'node:assert';
import { canCaptureScreenThumbnails, requestMacPermissions, macPermissionMessage } from './mac-devices.mjs';

test('P2: canCaptureScreenThumbnails returns false when no sources', async (t) => {
  const desktopCapturer = {
    getSources: async () => [],
  };
  const result = await canCaptureScreenThumbnails({ desktopCapturer });
  assert.strictEqual(result, false);
});

test('P2: canCaptureScreenThumbnails returns false when sources have null thumbnails', async (t) => {
  const desktopCapturer = {
    getSources: async () => [
      { thumbnail: null, name: 'Screen 1' },
    ],
  };
  const result = await canCaptureScreenThumbnails({ desktopCapturer });
  assert.strictEqual(result, false);
});

test('P2: canCaptureScreenThumbnails returns true when source has valid thumbnail', async (t) => {
  const desktopCapturer = {
    getSources: async () => [
      {
        thumbnail: {
          toDataURL: () => 'data:image/png;base64,' + 'A'.repeat(100),
        },
        name: 'Screen 1',
      },
    ],
  };
  const result = await canCaptureScreenThumbnails({ desktopCapturer });
  assert.strictEqual(result, true);
});

test('P2: canCaptureScreenThumbnails returns false if getSources throws', async (t) => {
  const desktopCapturer = {
    getSources: async () => {
      throw new Error('Permission denied');
    },
  };
  const result = await canCaptureScreenThumbnails({ desktopCapturer });
  assert.strictEqual(result, false);
});

test('P2: requestMacPermissions verifies thumbnails when status is granted', async (t) => {
  let captureVerified = false;
  const systemPreferences = {
    getMediaAccessStatus: (kind) => 'granted',
  };
  const desktopCapturer = {
    getSources: async () => {
      captureVerified = true;
      return [
        {
          thumbnail: {
            toDataURL: () => 'data:image/png;base64,' + 'B'.repeat(100),
          },
          name: 'Screen 1',
        },
      ];
    },
  };
  const result = await requestMacPermissions({ systemPreferences, desktopCapturer });
  assert.strictEqual(result.screen, 'granted');
  assert.strictEqual(captureVerified, true);
});

test('P2: requestMacPermissions marks as not-determined when status says granted but thumbnails fail', async (t) => {
  const systemPreferences = {
    getMediaAccessStatus: (kind) => 'granted',
  };
  const desktopCapturer = {
    getSources: async () => {
      // Simulate no real thumbnails
      return [];
    },
  };
  const result = await requestMacPermissions({ systemPreferences, desktopCapturer });
  assert.strictEqual(result.screen, 'not-determined');
});

test('P2: macPermissionMessage provides actionable guidance for not-determined', (t) => {
  const msg = macPermissionMessage('screen', 'not-determined');
  assert.match(msg, /Open System Settings/);
});

test('P2: macPermissionMessage provides actionable guidance for denied', (t) => {
  const msg = macPermissionMessage('screen', 'denied');
  assert.match(msg, /Open System Settings/);
  assert.match(msg, /enable.*Rough Cut/);
});
