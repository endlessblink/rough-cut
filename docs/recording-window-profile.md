# Recording Window Profile

## Problem

The Recording tab is a setup surface, not a full editor workspace. Keeping the main `BrowserWindow` at the normal studio size leaves a large dark empty area around the pre-record panel even if the panel itself is compact.

This cannot be solved completely with CSS. CSS can shrink the DOM shell, but it cannot shrink the native Electron window. The visible empty area reported in screenshots was the native window still being sized for Projects, Recording edit, Editor, and AI.

## Decision

When the main app is on the idle `Recording` tab, the renderer switches the native window to a compact `recording` profile. When the user leaves Recording, starts recording, or opens a project/editor surface, the app switches back to the normal `studio` profile.

The profile switch is implemented through Electron IPC:

- Renderer: `window.roughCut.setWindowProfile(profile)` in `apps/desktop/src/renderer/src/main.tsx`.
- Preload bridge: `APP_SET_WINDOW_PROFILE` in `apps/desktop/src/preload/index.cjs`.
- Main process: `ipcMain.handle(IPC_CHANNELS.APP_SET_WINDOW_PROFILE, ...)` in `apps/desktop/src/main/index.mjs`.

The compact Recording profile sets the native window to `760 x 620` and lowers the minimum size to `720 x 560`. The studio profile restores the previous bounds when available, otherwise it falls back to `1120 x 740` with the normal `860 x 560` minimum.

## Why Not CSS Only

The old attempts removed borders, hid the editor shell, and moved the bottom tab strip closer to the panel. That improved the internal layout, but the user still saw a large dark window because the OS-level window was unchanged.

The key invariant is:

> Recording tab compactness must be a native BrowserWindow profile, not only a DOM layout state.

Electron supports programmatic resizing with `BrowserWindow.setSize()` / `setBounds()` on normal desktop windows. Linux Wayland may restrict programmatic resize or positioning; the handler returns a result instead of throwing so unsupported environments degrade without breaking the renderer.

## Regression Coverage

Keep these tests when changing Recording navigation or window chrome:

- `apps/desktop/src/main/window-profile.test.mjs`
  - Verifies the main-process profile handler compacts to `760 x 620`.
  - Verifies previous studio bounds are saved and restored.
- `apps/desktop/src/renderer/src/app-views.test.mjs`
  - Verifies `Recording` is a first-class app view.
  - Verifies the renderer calls `setWindowProfile(profile)` from Recording view state.
- `apps/desktop/src/shared/ipc-channels.test.mjs`
  - Verifies the preload/shared IPC channel contract includes `APP_SET_WINDOW_PROFILE`.
- `scripts/smoke-recording-startup-ui.mjs`
  - Verifies real Electron startup reports `compactWindow: { width: 760, height: 620 }`.
  - Verifies leaving Recording restores `studioWindow: { width: 1120, height: 740 }`.
  - Captures screenshots proving the dark empty area is gone.

## Manual Check

Run:

```bash
pnpm smoke:recording-startup-ui
```

Open the generated `startup-panel/screenshot.png`. The expected visual is:

- The native app window is close to the pre-record panel size.
- The bottom app tab strip sits directly below the panel.
- There is no large dark empty editor-sized area around the panel.

If the screenshot shows a large empty area again, inspect the native window dimensions in the smoke report before editing CSS.
