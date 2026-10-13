# Windows development guide

How the Windows port works, how to build and test it, and the facts that were measured the hard way. Status and acceptance live in [WINDOWS-PORT-GOAL.md](WINDOWS-PORT-GOAL.md) and the gate (`pnpm gate:windows`).

Rule for every change: **Linux behaviour must not change.** Windows code sits behind `process.platform` checks or an explicit `platform` parameter (default `process.platform`), so Linux tests can exercise the Windows branches.

## Set up

```powershell
winget install -e --id OpenJS.NodeJS.LTS     # Node 22+
winget install -e --id Gyan.FFmpeg           # ffmpeg + ffprobe on PATH (dev only; the package bundles its own)
npm install -g pnpm@9.15.0
git clone https://github.com/endlessblink/rough-cut; cd rough-cut
pnpm install
```

`scripts\windows\start-rough-cut.cmd` does the same and starts the app. Open a new terminal after winget installs so PATH updates.

| Task | Command |
| --- | --- |
| Run in dev (Vite + Electron) | `pnpm --filter @rough-cut/desktop dev` |
| Build / typecheck | `pnpm build` / `pnpm typecheck` |
| Desktop tests | `pnpm --filter @rough-cut/desktop test` |
| Real recording pipeline smoke | `node scripts/windows/smoke-windows-recording.mjs` |
| Same, with mic + system audio + camera | `$env:ROUGH_CUT_WIN_SMOKE_SOURCES='all'; node scripts/windows/smoke-windows-recording.mjs` |
| UI end-to-end, quiet (synthetic recording, no devices, no input) | `node scripts/windows/ui-e2e-editor.mjs` |
| UI end-to-end, full (real mic, system audio, camera, a real mouse click) | `node scripts/windows/ui-e2e.mjs` |
| The completion gate | `pnpm gate:windows` (`:quick` skips build and tests) |
| Portable package | `node scripts/prepare-windows-tools.mjs; node scripts/package-windows.mjs` |
| Installer + zip | `node scripts/build-windows-release.mjs` (output in `release\windows`) |

The all-sources smoke uses real devices: the microphone hears the room, the camera sees you, and a tone plays through your speakers. Output is written to a temp folder and deleted.

## Architecture

```
recording-session.mjs ── captureFactory ──► ffmpeg-capture.mjs ── platform-capture.mjs ──► ffmpeg.exe
        │                                         builders take `platform`        gdigrab | dshow | tcp://
        ├─ buttonListenerFactory ─► uiohook-button-listener.mjs   (clicks, motion, key codes; physical px)
        ├─ systemAudioFeedFactory ► system-audio-loopback.mjs     (WASAPI → silence-padded PCM → local TCP)
        └─ getCursorPoint ────────► index.mjs                     (screen.dipToScreenPoint, physical px)
windows-devices.mjs: dshow device lists, camera mode probing, display info (physical pixels)
```

| Linux | Windows |
| --- | --- |
| `x11grab` | `gdigrab` (`desktop`, offsets and size in physical pixels) |
| PulseAudio mic | DirectShow `audio=<name>` |
| PulseAudio monitor (system audio) | WASAPI loopback via `loopback-capture`, fed to ffmpeg as `-f s16le -i tcp://127.0.0.1:<port>` |
| v4l2 camera | DirectShow `video=<name>`, opened in a probed mode |
| `xdotool` cursor | `screen.dipToScreenPoint(screen.getCursorScreenPoint())` |
| `xinput` clicks | `uiohook-napi` global hook |
| `/tmp`, `XDG_CONFIG_HOME` | `os.tmpdir()`, `%APPDATA%` |
| AppImage / deb | NSIS installer + portable zip via `electron-builder --prepackaged` |

## Measured facts (do not rediscover these)

**Capture**
- gdigrab sees the real physical resolution at 125% scaling (checked: 1920×1080 on a 1536×864 logical display). ffmpeg 9 also has `ddagrab`; it was not needed.
- gdigrab's banner prints an epoch `start:` about 70 ms after spawn, so the existing first-frame anchor parser works unchanged. The `-progress` fallback is about 250 ms looser.
- Stop ffmpeg by writing `q` to stdin. On Windows `SIGINT`/`SIGTERM`/`SIGKILL` all become a hard `TerminateProcess`, which is why the stop cascade only matters as a last resort. The app records to MKV first, so a hard kill still leaves a recoverable file.
- Windows never delivers `SIGTERM` to the main process on quit and ffmpeg.exe children outlive their parent. `index.mjs` reaps recording children on `will-quit` and `exit` (Windows only).
- Windows timers tick at about 15 ms. Tests that poll at 5 ms must wait long enough (they use 200 ms).

**ffmpeg filter paths**: ffmpeg unescapes filter text twice. For `subtitles=`/`sendcmd=` a Windows path must use forward slashes and `\\:` for the drive colon when unquoted, or `\:` inside single quotes. See `escapeFilterPath` in `export-service.mjs` and its test. The original escaping gave "Unable to parse original_size" on Windows.

**Cameras**: DirectShow only opens a mode the camera advertises (`ffmpeg -list_options true -f dshow -i video=NAME`). Asking for 15 fps from a camera that offers 30 fps at 1280×720 fails with `I/O error`. `windows-devices.mjs` probes each camera when listing and picks MJPEG first (raw YUYV caps at 10 fps at 720p on the tested camera), then the preview/capture filters lower the rate.

**System audio**: ffmpeg has no WASAPI input. `loopback-capture` delivers 48 kHz stereo s16le in 10 ms chunks, **only while something is playing**. The feed pads silence against the wall clock (in blocks of 60 ms or more, so scheduling jitter never punches holes into real audio), serves one client at a time on 127.0.0.1, and runs for the life of a session so pause/resume reuse it. Do not add `-use_wallclock_as_timestamps` to that input: with ffmpeg 9 the raw demuxer then delivers nothing.

**Input hook**: `uiohook-napi` buttons are 1 left, 2 right, 3 middle; the recording schema is 0 left, 1 middle, 2 right, so right and middle swap. Coordinates are physical pixels. Key codes are only used to de-duplicate, never interpreted. `SetCursorPos` does not raise hook motion events.

**Coordinates**: every Windows input is already physical, so the session is created with `inputCoordinatesArePhysical` and does not multiply by the display scale factor again (without it, clicks land 25% off at 125% scaling). Polled cursor points come from `screen.dipToScreenPoint`, which is correct per monitor on mixed-DPI setups.

**Fractional display scaling**: Electron reports rounded logical sizes, so `1707 x 1.5 = 2560.5` for a 2560-wide screen, and `dipToScreenRect` rounds up to 2561 as well. Asking gdigrab for that extra pixel fails with "extends outside window area". `physicalExtent()` in `windows-devices.mjs` rounds down to an even number (the same clamp is used for regions in `region-selector.mjs`). Found by the UI test on a 150% display; unit tests use these exact numbers.

**A capture that dies at startup** now fails the take with ffmpeg's reason (`assertScreenCaptureStayedUp`, 1.5 s window) and the failed start releases everything, instead of leaving a recorder UI that says "recording".

**Export opens the standard Save dialog** (`pickSavePath`). No UI driver can click it, so the tests set `ROUGH_CUT_UI_SMOKE_EXPORT_PATH`, the app's own hook, and a person verifies the dialog (`export-playable`). "Preparing export" in the UI is that dialog waiting. The app logs `[export] finished ok=true` only when the file is complete; the MP4 appears earlier while ffmpeg is still writing it, so tests wait for the log line.

**Project files** store relative paths with `/` on every platform so a project made on Windows opens on Linux and back.

**Packaging**: `app.isPackaged` is true once `electron.exe` is renamed to `Rough Cut.exe`, so the built renderer loads without environment variables. A packaged Windows app opens in editor mode like the Linux launcher. FFmpeg is pinned by URL and SHA-256 (`scripts/bundled-tools-windows.lock.json`). Git for Windows puts a GNU `tar` first on PATH that reads `C:` as a remote host, so scripts call `%SystemRoot%\System32\tar.exe`.

## The UI tests (how they stay safe)

`ui-e2e.mjs` makes one real OS mouse click so the global hook has a click at a known position. It must never click another program, so before recording anything (and again just before the click) it pins the app window on top, computes the physical screen point of the app's title text, and checks with `WindowFromPoint` that the window there belongs to the exact `Rough Cut.exe` it launched. If not, it stops with a message instead of clicking. It also records the mic, the screen and the camera and plays a tone, so run it when the PC is free. The tone is found as a burst that stands out anywhere in the take, because the take starts a variable time before the UI reports it. Selectors that work: the export toggle is `[data-ui-region="export-popover-toggle"]` and the go button is `button.exportGo` (their accessible names are "Show/Hide export panel", not "Export").

## Windows gotchas for contributors

- Source files are LF on every platform (`.gitattributes`). A CRLF checkout breaks tests that read source as text.
- Test fixtures that are `#!/usr/bin/env bash` or `#!/usr/bin/env node` scripts cannot run on Windows; those tests skip there with a stated reason and still run on Linux CI.
- Symlink tests need Developer Mode or elevation on Windows; the one affected test skips when `EPERM`.
- When you write code that builds paths, use `node:path`; in tests, compute expectations with `join`/`resolve` instead of hard-coding `/tmp/...`.
- Spawning a `.cmd` shim needs a shell. Prefer the real `.exe`.

## Not done yet

See the gate (`pnpm gate:windows`) for the live list. At the time of writing: code signing, an auto-updater, and verification on real multi-monitor and mixed-DPI hardware.
