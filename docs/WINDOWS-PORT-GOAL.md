# Windows port: goal, plan and acceptance

Branch: `feat/windows-port`. Supersedes the status list in `WINDOWS-PORT-HANDOFF.md`.

## Goal

A person on Windows 10/11 x64 installs Rough Cut from one file, and can: record a display or region with mic, system audio and camera; see cursor, clicks and auto-zoom in the editor; edit; and export a valid MP4. Everything runs offline, as on Linux.

**Hard constraint:** Linux behaviour does not change. `pnpm test` stays green on Linux, and the Linux ffmpeg args stay byte-identical (guarded by `ffmpeg-capture-args.test.mjs`).

## Definition of done (end to end)

On a clean Windows 11 machine with no dev tools:

1. Run the installer or portable build. The app starts with no console and no missing-DLL error.
2. Record Screen (full display, 125% and 100% scaling) for 60 s with mic, system audio and camera. Stop. Nothing hangs and no file is corrupt.
3. The recording opens in the editor. The cursor and the clicks line up with the video within 1 frame at 30 fps. Auto-zoom suggestions appear from real clicks.
4. Region recording and a second monitor record the correct area.
5. Trim, zoom, camera layout, Claude graphics (if CLI present), censor.
6. Export MP4. `ffprobe` validates it. Picture and audio play in a stock Windows player.
7. Quit mid-recording: no orphaned `ffmpeg.exe`. Recording recovery works after a forced kill.
8. CI is green on both `ubuntu-latest` and `windows-latest`.

## The gate

The Definition of done above is enforced by one command. The port is not done until it prints `GATE PASSED`.

```
pnpm gate:windows          # everything: build, typecheck, full desktop tests, live capture, packaging, user evidence
pnpm gate:windows:quick    # fast checks only; can never print GATE PASSED
```

- **Automated checks** (Windows only): LF endings pinned; ffmpeg and ffprobe with libx264, gdigrab and dshow; a real 3 s gdigrab capture through the app's own argument builder, stopped with `q` and validated by ffprobe; CI has a `windows-latest` job; the Windows packaging script exists and its output contains `Rough Cut.exe`, `ffmpeg.exe` and `ffprobe.exe`; the click-telemetry stub is gone; build, typecheck and desktop tests have zero failures.
- **User evidence** for what needs hardware or eyes. The user records each with `node scripts/windows/verify-windows-port.mjs confirm <key> "<note>"`. It refuses to run without an interactive terminal, so Claude cannot record it. Keys: `record-all-sources`, `scaled-display`, `cursor-click-sync`, `region-and-second-monitor`, `editor-pass`, `export-playable`, `no-orphan-ffmpeg`, `crash-recovery`, `installer-clean-machine`. Stored in `.git/windows-port-evidence.json` (not committed).
- Do not weaken the gate to make it pass. If a check is wrong, change it in its own commit and say why.

### Active goal (paste into Claude Code)

```
/goal A Windows build the user can check works end to end. Done when, shown in the transcript: (1) `node scripts/windows/ui-e2e.mjs` prints UI E2E PASSED, driving the packaged "Rough Cut.exe" through its real UI (start a take with mic, system audio and camera, stop, open the editor, export an MP4, ffprobe the file); (2) `pnpm gate:windows` shows every automated check PASS (only user-evidence checks may remain); (3) the installer and zip in release\windows are rebuilt from the final commit and their SHA-256 printed; (4) everything is committed. Fix every bug the UI test exposes. Never edit the gate or the UI test to make it pass, and never record user evidence. Then stop and hand me a short checklist of exactly what to try. Stop after 60 turns.
```

## Phases

Each phase ends with a commit and with its checks passing.

### Phase 0: Baseline (merge done)
- [x] Merge `master` into `feat/windows-port`.
- [ ] `pnpm install`, `pnpm build`, `pnpm typecheck`, `pnpm test` on Windows. Record every failure. Classify each one: real Windows bug, a test that assumes POSIX paths, or an environment gap. Fix the test assumptions.
- [ ] Windows dev prerequisites documented: Node 22+, pnpm, FFmpeg (gyan full build, includes libx264 and ddagrab).

### Phase 1: Runs and records (screen only)
- [ ] `pnpm dev` launches on Windows (`start-rough-cut.cmd` works).
- [ ] Screen capture works. Evaluate `ddagrab` (ffmpeg >= 6, DPI-correct, lower CPU) against `gdigrab`. `gdigrab` runs in a non-DPI-aware ffmpeg.exe, so scaled displays may record wrong. Pick one and keep the other as fallback.
- [ ] Stopping ffmpeg: `q` on stdin is primary. Replace the `SIGINT`/`SIGTERM` escalation on Windows (Node maps these to a hard kill): use `taskkill /T` last, accept MKV as the resilient container. Add a test for the Windows cascade.
- [ ] Child reaping on quit: no stray `ffmpeg.exe` (`terminateChildren` and `process.on` paths; `SIGTERM` is not delivered on Windows, so use `app.on('before-quit')`).
- Check: 60 s screen-only recording, `ffprobe` ok, duration within 1 s.

### Phase 2: Audio and camera
- [ ] Mic via dshow. Prefer the dshow *alternative name* for stable IDs and handle device names with quotes or unicode.
- [ ] System audio: real WASAPI loopback. Options, in order of preference: (a) Electron `desktopCapturer` / `setDisplayMediaRequestHandler` with `audio: 'loopback'`, (b) small native helper piping PCM to ffmpeg. Stereo Mix stays only as a fallback. Fix the mic vs loopback split so it does not rely on name matching alone.
- [ ] Camera: force MJPEG or the best supported format via `-list_options`. Fix the preview path (`buildFfmpegCameraPreviewArgs`) for dshow. Make the camera stop timeouts meaningful on Windows.
- [ ] A/V sync between screen, mic, system audio and camera.
- Check: 60 s take with all four sources, audio audible on both tracks, camera in sync.

### Phase 3: Cursor, clicks, sync
- [ ] Cursor coordinates: Electron returns DIP. Convert with `screen.dipToScreenPoint` (not a single `scaleFactor` multiply, which breaks at fractional scaling and on mixed-DPI monitors).
- [ ] Click and key telemetry: implement a real listener behind the existing `buttonListenerFactory` seam (`uiohook-napi`, rebuilt for Electron, or a small native helper). Same `onButton / onMotion / onKey` contract as `xinput-button-listener.mjs`. Key events must stay privacy-safe (key code only, as on Linux), and the key code mapping must match what the editor expects.
- [ ] First-frame anchor: `createInputBannerAnchorParser` reads `start:` from the ffmpeg banner. Verify gdigrab/ddagrab emit an epoch-plausible `start:`. If not, fall back to the progress detector and measure the error.
- [ ] Ground truth: adapt `scripts/cursor-sync-ground-truth` to Windows.
- Check: recorded click-flash in a test page lands within 1 frame of the click event.

### Phase 4: Windows-isms in the app
- [ ] Paths: replace `split('/')` and manual `/` handling (`remux-service.mjs`, `project-files.mjs`, `organize-projects.mjs`, `path-label.ts`, `main.tsx`) with `path` helpers or Windows-aware ones. Concat list quoting and slashes for ffmpeg.
- [ ] Config and logs: `runtime-log.mjs` (`XDG_CONFIG_HOME`) to `app.getPath('userData')` on Windows. `/tmp/rough-cut-dock-provenance.json` to `os.tmpdir()`.
- [ ] `claude-cli.mjs`: find `claude.exe` / `claude.cmd`; spawn `.cmd` correctly.
- [ ] Transcription: Python venv layout (`Scripts\python.exe`), `access(X_OK)` semantics, whisper.cpp binary names. Provide a PowerShell equivalent of `setup-hebrew-transcription.sh`.
- [ ] Region selector overlay, tray, window maximise, native menu, single-instance and second-launch, Windows `AppUserModelId`, file picker (the `kdialog` branch is Linux-only already).
- [ ] Media protocol and `file://` URLs with drive letters and spaces.
- [ ] Display handling for multi-monitor and mixed DPI. The screen-choice fix from beta.9 must work with Windows display info.
- Check: full UI pass on Windows, with a project path containing spaces and non-ASCII characters.

### Phase 5: Packaging and distribution
- [ ] `scripts/package-windows.mjs`: copy Electron dist, rename to `Rough Cut.exe`, set icon and version resources, add `resources/bin` with `ffmpeg.exe` and `ffprobe.exe`, licences and source offer (`docs/MEDIA-SOURCE-BUILD.md` pattern; the ffmpeg build is GPL, the app is AGPL).
- [ ] `bundled-tools.mjs`: per-platform tool list and `.exe` lookup. Pin the ffmpeg build in a lock file with SHA-256, as for Linux.
- [ ] Installer (NSIS or Inno Setup) plus a portable zip. Start menu entry, uninstall, per-user install, no admin needed.
- [ ] Code signing: document the plan. Unsigned builds trigger SmartScreen; say so in the install docs.
- [ ] Updater: keep disabled for the first Windows beta; document it.
- [ ] `INSTALL.md` Windows section, README requirements and roadmap, and site download wiring.
- Check: install on a clean VM, run the Definition of done list.

### Phase 6: CI and release
- [ ] `windows-latest` job: install, build, typecheck, tests, ffmpeg via a pinned download, packaging smoke (`smoke-packaged-app` equivalent).
- [ ] Windows smoke for recording with a synthetic source where possible (headless runners have a desktop session, so gdigrab can run).
- [ ] Port or gate the `smoke:*` scripts that use POSIX env syntax (`cross-env`) and `xvfb-run`.
- [ ] Release notes and changelog.

## Working rules

- Add a Windows branch only behind `platform-capture.mjs` style seams or `process.platform` guards. No Linux edits unless a test proves them byte-identical.
- Every new Windows-only behaviour gets a unit test that takes `platform` as a parameter, so it runs on the Linux CI too.
- Do not mark a phase done from unit tests alone if it touches real hardware (capture, audio, camera, hooks). Verify by actually recording and say what was and was not verified.
- Do not commit signing keys, and do not enable the updater without a pinned publisher key.

## Status log

| Date | Phase | Note |
| --- | --- | --- |
| 2026-10-13 | 0 | Gate added (`pnpm gate:windows`). Baseline on Windows: build + typecheck pass; desktop tests 1078 pass / 45 fail (CRLF fixed via .gitattributes; rest: POSIX-path test expectations, ffmpeg not installed, Linux-args tests running on win32, claude-cli lookup). Live gdigrab capture verified on this machine. |
| 2026-10-13 | 0 | Merged `master` into `feat/windows-port` (conflicts in README, site and `package.json` resolved to `master`). |
| 2026-10-13 | 0 | Desktop suite at zero failures on Windows. Fixes: path-aware tests, platform parameter on capture builders and preflight, remux concat list (real bug), claude.exe lookup, %APPDATA% log dir, portable project paths (`/` in saved documents), bundled-tools `.exe`, symlink and bash-stub skips. |
| 2026-10-13 | 1 | Real capture, stop, remux, project save, reopen, raw and styled export verified end to end through the real session (`smoke-windows-recording.mjs`). gdigrab correct at 125% scaling; banner anchor works (70 ms). ffmpeg filter path escaping fixed for Windows paths. Windows quit now reaps ffmpeg children. |
| 2026-10-13 | 2 | Mic (dshow), system audio (WASAPI loopback feed, silence-padded) and webcam (probed MJPEG mode) recorded together; tone audible at -9.8 dB in the mix; camera linked; camera preview fixed (needed a probed mode). Verified by the all-sources smoke on real devices. |
| 2026-10-13 | 3 | Click/key telemetry via uiohook-napi (button numbering and physical coordinates measured with real synthesized input). Double-scaling bug at 125% found and fixed (`inputCoordinatesArePhysical`). Cursor uses `dipToScreenPoint`. **Still needs a human:** cursor-to-video alignment with a real hand (`cursor-click-sync`). |
| 2026-10-13 | 4 | App boots on Windows (dev and packaged); sandboxed dev launcher; packaged app opens in the editor; tmpdir provenance path. |
| 2026-10-13 | 5 | `package-windows.mjs`, pinned FFmpeg (SHA-256), `build-windows-release.mjs` (NSIS per-user installer 234 MB + zip 326 MB, unsigned). Silent install, launch and uninstall verified clean on this machine. Docs: INSTALL-WINDOWS.md, WINDOWS-DEVELOPMENT.md, notices, FFmpeg source offer. |
| 2026-10-13 | 6 | CI `windows` job added (cannot be run from here; first run will be on push). |
