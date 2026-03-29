---
name: recording-session-flow
description: Recording session lifecycle — floating toolbar window, app minimization during capture, countdown, pause/resume, post-recording transition to Edit tab. Auto-activates when working on the recording session UX beyond the in-app Record tab config.
triggers:
  - RecordingToolbar
  - FloatingToolbar
  - recording-session
  - recording:start
  - recording:stop
  - recording:pause
  - countdown
  - post-recording
  - captureExclude
---

# Recording Session Flow — Architectural Context

## Overview

This skill covers the **out-of-main-window** recording experience: from the moment the user clicks Record to the moment they land in the Edit tab with their clip. It mirrors the UX pattern established by Screen Studio, Focusee, and Loom.

## Three-Phase Flow

### Phase 1: Pre-Recording (Countdown)

- User configures source, mic, camera in the Record tab (covered by record-tab skill)
- User clicks REC → **3-second countdown overlay** appears on the main window
- Countdown is configurable (0/3/5 seconds) via project settings
- During countdown: main window is still visible, cancel is possible
- State transition: `ready → countdown → recording`

### Phase 2: During Recording (Floating Toolbar)

**Main window behavior:**
- Main window **hides** (not minimize — hide to avoid taskbar presence)
- Alternatively: minimize to tray with a tray icon indicator

**Floating toolbar window:**
- A separate frameless `BrowserWindow` (Electron), always-on-top
- **Self-excludes from screen capture** using Electron's `setContentProtection(true)` or platform-specific ScreenCaptureKit exclusion on macOS
- Small pill/bar shape (~300×48px), draggable via custom title bar region
- Semi-transparent or frosted-glass background

**Toolbar controls (priority order):**
1. **Elapsed timer** — always visible, updated every 100ms
2. **Stop** (primary action, red) — ends recording
3. **Pause/Resume** — toggles MediaRecorder pause
4. **Restart** — discard current and start fresh (confirm first)
5. **Delete** — discard and return to main window (confirm first)

**IPC during recording:**
| Channel | Direction | Purpose |
|---------|-----------|---------|
| `recording-session:start` | main→toolbar | Initialize toolbar with config |
| `recording-session:pause` | toolbar→main | Pause MediaRecorder |
| `recording-session:resume` | toolbar→main | Resume MediaRecorder |
| `recording-session:stop` | toolbar→main | Stop recording, trigger save |
| `recording-session:restart` | toolbar→main | Discard + restart |
| `recording-session:delete` | toolbar→main | Discard + abort |
| `recording-session:elapsed` | main→toolbar | Elapsed time updates |
| `recording-session:status` | main→toolbar | Status changes (paused, error) |

### Phase 3: Post-Recording (Transition)

- Main process saves recording (existing `saveRecording()` in capture-service)
- Main process creates Asset entry
- Main window **restores/shows**
- Floating toolbar **closes**
- Two options for post-recording UX:
  - **Auto-navigate**: Switch to Edit tab with new clip selected on timeline
  - **Action sheet**: Brief overlay with "Edit" / "Record Another" / "Delete" buttons (like Android 17 pattern)
- Clip is auto-placed on the first video track (existing behavior in `App.tsx handleRecordingComplete`)

## Canonical Constraints

From the project constitution:

1. **Main process owns all I/O** (§8) — The floating toolbar BrowserWindow is created/destroyed by main. Recording state machine runs in main. The toolbar renderer is a pure UI.

2. **Recording produces assets, not clips** (§6) — The floating toolbar never touches timeline logic. It only signals start/stop/pause to the main process recording pipeline.

3. **The project document is inert data** (§5) — Recording session state (elapsed, paused, source config) is transient and NOT stored in ProjectDocument.

4. **Frame-based, not time-based** (§4) — Elapsed display converts frames to mm:ss for the user, but internal tracking uses frame count.

5. **UI does NOT own rendering logic** (§2) — The toolbar renderer has no PixiJS, no compositor. It's plain React rendering simple controls.

## Architecture (Self-Contained Panel)

```
┌─────────────────────────────────────────────────┐
│  MAIN PROCESS                                    │
│                                                  │
│  session.setDisplayMediaRequestHandler()         │
│    → intercepts getDisplayMedia() from panel     │
│    → uses selectedSourceId from main state       │
│    → supplies source + loopback audio            │
│                                                  │
│  RecordingSessionManager                         │
│    → creates/destroys panel BrowserWindow        │
│    → countdown timer (ticks to panel)            │
│    → elapsed timer (to panel)                    │
│    → tray icon + global shortcut                 │
│    → routes recording result to main window      │
│                                                  │
│  capture-service.mjs                             │
│    → saveRecording() + ffprobe (existing)         │
└─────────────────────────────────────────────────┘
         ↕ IPC                    ↕ IPC
┌──────────────────┐    ┌─────────────────────────┐
│  MAIN WINDOW     │    │  PANEL WINDOW (500x460) │
│  (stays visible) │    │  Own renderer process   │
│                  │    │                         │
│  Record tab REC  │    │  getDisplayMedia()      │
│  → opens panel   │    │  → live <video> preview │
│                  │    │  MediaRecorder           │
│  Receives asset  │    │  → chunks → blob → IPC  │
│  via IPC on done │    │                         │
│  → addAsset()    │    │  Source selector        │
│  → addClip()     │    │  Device controls        │
│                  │    │  REC / Pause / Stop      │
└──────────────────┘    └─────────────────────────┘
```

## File Map (planned)

```
apps/desktop/src/main/
  recording-session-manager.mjs  — Orchestrates the 3-phase flow
  capture-service.mjs            — Existing: source enum + save

apps/desktop/src/renderer/features/record/
  CountdownOverlay.tsx           — 3-2-1 fullscreen overlay
  PostRecordingSheet.tsx         — Action sheet after recording

apps/desktop/src/toolbar/       — Separate renderer entry for toolbar window
  index.html                    — Minimal HTML shell
  App.tsx                       — Toolbar React root
  RecordingToolbar.tsx           — Timer + controls
  toolbar-preload.mjs           — Preload script for toolbar window

apps/desktop/src/shared/
  ipc-channels.mjs              — Add recording-session:* channels
```

## Implementation Order

1. **CountdownOverlay** — Render 3-2-1 in the existing main window before capture starts
2. **RecordingSessionManager (main)** — Orchestrate hide/show/create-toolbar/destroy-toolbar
3. **Floating toolbar window** — Frameless BrowserWindow + minimal React renderer
4. **Toolbar IPC** — Wire stop/pause/resume between toolbar and main
5. **Self-exclusion** — `setContentProtection(true)` or platform API
6. **Post-recording transition** — Restore main window, navigate to Edit tab
7. **Pause/Resume** — MediaRecorder.pause()/resume() support
8. **Action sheet** — Optional post-recording choice UI
9. **Tray icon** — System tray indicator during recording

## Lessons Learned (Validated the Hard Way)

### React Portals Do NOT Work for Live Video in Electron

**Attempted**: `window.open()` + `ReactDOM.createPortal()` to render React components into a child BrowserWindow, sharing the same renderer process and MediaStream.

**Result**: GPU texture conflicts (SharedImageManager::ProduceSkia errors), video flickering every ~300ms, and status state not propagating correctly. The child window's GPU context fights with the parent's.

**Root cause**: Even though `window.open()` creates a window in the same renderer process, the two windows have separate GPU compositing surfaces. Live video textures (`<video>` with `srcObject`) cannot be reliably rendered across these surfaces.

**Rule**: Never use React Portals for cross-window live video in Electron. Use a self-contained BrowserWindow with its own stream acquisition instead.

### Self-Contained Panel Window Is the Correct Architecture

The panel is its own BrowserWindow with its own renderer process. It acquires its own MediaStream via `getDisplayMedia()` (intercepted by `session.setDisplayMediaRequestHandler` in main process). It runs its own MediaRecorder. Communication is via IPC only.

This is what Loom does (confirmed by their engineering blog post). Each UI element (camera bubble, controls bar, main app) is a separate BrowserWindow.

### `setDisplayMediaRequestHandler` Replaces chromeMediaSourceId

The old `desktopCapturer.getSources()` → pass ID via IPC → `getUserMedia({ chromeMediaSourceId })` pattern has:
- 10-second ID expiry
- webContents binding (ID only works in the window that requested it)
- Error 263 when ID is stale

The new pattern: main process registers `session.setDisplayMediaRequestHandler`, panel renderer calls standard `getDisplayMedia()`. Main intercepts and supplies the source directly. Zero ID passing, zero expiry, zero cross-window issues.

### Vite Multi-Page Paths Must Be Absolute

`rollupOptions.input` paths MUST use `resolve(__dirname, 'src/renderer/panel.html')` — absolute, anchored to the config file directory. Relative paths or paths relative to `root` fail silently or cause Rollup resolution errors.

## Platform Limitations (Validated)

### Window Exclusion from Screen Capture

**macOS 14+ (Sonoma/Sequoia)**: `setContentProtection(true)` is BROKEN. ScreenCaptureKit ignores `NSWindow.sharingType`. The floating toolbar WILL appear in recordings. No workaround exists in Electron. Mitigations: position toolbar on secondary display, or fall back to menu bar tray icon.

**Windows 10+**: `WDA_EXCLUDEFROMCAPTURE` works but a regression (Electron #45990) may show the window as solid black instead of invisible. Version-dependent.

**Linux**: `setContentProtection` is a no-op on both X11 and Wayland. No OS-level mechanism exists.

### Floating Toolbar on Wayland

`setAlwaysOnTop` is unreliable on Wayland — compositors may ignore it. Frameless windows lack shadows on GNOME Wayland. Multi-display positioning is buggy (Electron #48749). **Fallback**: Use system tray menu on Linux Wayland instead of floating toolbar.

### MediaRecorder Pause/Resume Bug

Chromium bug #593560: `pause()`/`resume()` does NOT stop the timestamp counter. The output file contains silent/frozen frames during the pause duration. **Workaround**: Use segment-based recording (stop + start new segment) instead of native pause. Concatenate segments in post.

### MediaRecorder Long Recording Crash

Electron #40440: MediaRecorder may crash after ~70 minutes consistently. **Mitigation**: Monitor recording duration, warn user at 60 minutes, and consider periodic segment rotation for long sessions.

### System Tray Integration

The skill should implement a tray icon with states:
- **Idle**: Normal app icon
- **Recording**: Pulsing red dot + elapsed time in tooltip
- **Paused**: Orange dot
- **Processing**: Spinner

Context menu: Stop Recording, Pause/Resume, Show Window, Cancel.

**Linux caveat**: GNOME Wayland requires AppIndicator extension for tray icons. May not appear without it.

## Safety Rules

- **Never show the floating toolbar in the recording** — use content protection APIs
- **Always confirm before Restart/Delete** — these are destructive actions
- **Handle toolbar window crash gracefully** — if toolbar crashes, stop recording and restore main window
- **Don't store session state in ProjectDocument** — elapsed time, pause state are transient
- **Clean up temp files on Delete** — don't orphan partial webm files
- **Toolbar must not import PixiJS** — it's a minimal control surface
- **Main window restore must happen even if recording save fails** — never leave user stuck
- **Handle SOURCE_LOST** — listen to `MediaStreamTrack.onended` for display disconnect mid-recording. Stop recorder, show recovery UI.
- **Handle SCREEN_LOCKED** — `ondataavailable` silently stops on screen lock (Electron #22860). Use a watchdog timer to detect data gaps.
- **Handle DISK_FULL** — main process write failures must be communicated back via IPC to trigger error state.
- **Handle PERMISSION_STALE** — macOS permission status cache doesn't update without relaunch (Electron #36722).

## What NOT to Do

- Don't put recording logic in the toolbar renderer (it's a remote control, not the engine)
- Don't use a single BrowserWindow with overlay (separate window is required for capture exclusion)
- Don't make the toolbar resizable or complex (it's a minimal control strip)
- Don't add timeline preview to the toolbar (that's for the Edit tab)
- Don't bypass the Asset pipeline (recording → asset → clip, never recording → clip)
- Don't use `win.minimize()` for the main window (use `win.hide()` to fully remove from screen)

## Platform Considerations

- **macOS**: ScreenCaptureKit can exclude specific windows from capture natively. Electron's `setContentProtection(true)` works.
- **Linux**: Content protection is less reliable. May need to position toolbar on a separate virtual desktop or accept it appears in recording.
- **Windows**: `setContentProtection(true)` works via DWM. Window exclusion from capture available on Windows 10+.

## Dependencies on Other Skills

- **record-tab** (planned): Owns the in-app config UI before recording starts
- **projects-section**: Post-recording creates Assets which appear in project store
