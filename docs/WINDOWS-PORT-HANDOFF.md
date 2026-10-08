# Windows port handoff (branch feat/windows-port)

Goal (Noam, 2026-10-08): a working Windows build of Rough Cut; Linux must stay untouched. Noam tests on his Windows install and continues with Claude there.

## Done
- Commit 6786e21: platform layer for capture. Windows uses gdigrab (screen), dshow (mic, camera), device lists parsed from `ffmpeg -list_devices`. Linux args byte-identical, guarded by tests (1022 pass).
- Files: `apps/desktop/src/main/recording/{platform-capture,windows-devices,noop-button-listener}.mjs`, edits in ffmpeg-capture, preflight, recording-session, index.mjs.
- electron-dev spawns through a shell on Windows. `scripts/windows/start-rough-cut.cmd` installs Node/pnpm/FFmpeg via winget and starts the app.

## Not done / unverified (nothing has run on real Windows yet)
- Click/key telemetry is a no-op on Windows (needs a native mouse hook such as uiohook-napi); auto-zoom uses the cursor-jump heuristic.
- System audio only if a loopback device ("Stereo Mix") exists; real WASAPI loopback not done.
- Camera: dshow does not force MJPEG; check fps/quality. Cursor: session scales Electron DIP points by scaleFactor; verify on a scaled display.
- Cursor/video sync anchor (see CLAUDE.md two-clock model) is unverified on gdigrab/dshow: check banner `start:` anchoring and run the ground-truth harness idea.
- Windows packaging (installer) does not exist; only dev run.
- Wayland-only/xdotool code paths are gated to Linux; Windows ffmpeg stop uses the existing `q` on stdin path.

## First steps on Windows
1. Double-click `scripts/windows/start-rough-cut.cmd`.
2. Open Record: check the preflight panel, pick screen/mic/camera, record 10 s, open it in Recording edit.
3. Report what breaks; fix in the files above; keep Linux tests green (`pnpm --filter @rough-cut/desktop test`).
