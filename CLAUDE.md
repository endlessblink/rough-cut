# Project Claude Notes

- Use the global `reliable-cursor-overlay` skill for cursor telemetry, preview overlays, and styled export cursor rendering.
- Cursor coordinates are source-recording coordinates. Any scale, fit, crop, or zoom must transform video and cursor together.
- Avoid FFmpeg chains with one overlay per telemetry sample; prefer a transparent cursor layer overlaid once.
- Keep styled export full-screen fit until explicit zoom/viewport logic exists.

## Recording setup requirements (Linux/X11 + NVIDIA)

- **Disable "Allow Flipping"** in `nvidia-settings` → OpenGL Settings. With it enabled, the NVIDIA driver uses page-flipping for vsync; x11grab occasionally reads the framebuffer mid-flip and captures torn frames into the recording. Disabling eliminates this. Persists across reboots. Confirmed on this user's hardware on 2026-05-04.
- Cursor sampling uses xdotool synchronous polling at 33 ms (`apps/desktop/src/main/recording/recording-session.mjs`). Do not replace with async motion-event streams — they have intrinsic IPC latency that causes visible cursor lag in playback. Regression-guarded by tests in `recording-session.test.mjs`.
- Cursor frame numbers are anchored to `recording-start`, not to ffmpeg's first-frame wall-clock. Do not re-anchor in `stop()` — that approach was tried and reverted (clamping pre-ffmpeg events to frame 0 broke the cursor overlay). Regression-guarded.
- The xinput button listener (`xinput-button-listener.mjs`) provides click/drag events for auto-zoom. Cursor *position* sampling stays on xdotool; only buttons come from xinput.
