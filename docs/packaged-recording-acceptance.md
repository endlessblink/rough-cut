# Packaged Recording Acceptance Runbook

Use this runbook before calling the current Linux/X11 recording flow solid. Run it against the packaged app, not `pnpm dev`, because packaging can change module resolution, file paths, permissions, and Electron behavior.

## Preconditions

- Linux/X11 session is active and `DISPLAY` is set.
- `ffmpeg`, `ffprobe`, `xdotool`, and `xinput` are installed.
- NVIDIA `Allow Flipping` is disabled on the target NVIDIA/KDE/X11 setup.
- The recordings directory has enough free disk space for a 30-60 second capture plus exports.
- A microphone is available if mic acceptance is being judged.

## Automated Warm-Up

Run these before the manual pass:

```bash
pnpm typecheck
pnpm test
pnpm smoke:mvp
pnpm smoke:real-recording
pnpm smoke:long-recording
pnpm smoke:package
pnpm smoke:package-recording-flow
```

If microphone acceptance is in scope, also run:

```bash
ROUGH_CUT_SMOKE_MIC=1 pnpm smoke:mvp
ROUGH_CUT_REAL_SMOKE_EXPECT_AUDIO=1 pnpm smoke:real-recording
```

## Manual Packaged-App Flow

1. Build and launch the packaged app with `pnpm smoke:package` and `pnpm smoke:package-recording-flow`; the recording-flow smoke also covers a persisted camera-warning review state. Open the packaged app artifact manually only if a visible pass is needed.
2. Confirm the recording controls are visible and the app is idle before recording.
3. Select a microphone if audio acceptance is in scope.
4. Select a camera only if webcam PiP acceptance is in scope; otherwise keep camera disabled.
5. Start a 30-60 second recording.
6. During capture, move the cursor slowly across the screen, then quickly across the screen.
7. Click at least three times in visually distinct places.
8. Drag once for at least one second.
9. If multiple monitors are active, briefly move the cursor off the captured monitor and back.
10. Speak a short phrase if microphone capture is enabled.
11. Stop recording and wait for remux/project save to complete.
12. Confirm the project opens automatically or can be opened from the saved `.roughcut` file.
13. Scrub the preview from start to end.
14. Generate auto-zoom suggestions.
15. Apply one suggestion if any are generated.
16. Export raw MP4.
17. Export styled MP4.
18. Open the recording/project folder and confirm the `.roughcut`, MP4, diagnostics JSON, raw export, and styled export are present.
19. Close and relaunch the packaged app.
20. Reopen the `.roughcut` project and confirm preview and exports still work.

## Visual Checks

- Recording stops without a crash, hang, or orphaned FFmpeg process.
- Preview video duration matches the intended recording length within a small tolerance.
- Cursor position in preview follows the real cursor without stuck-edge, scaling, or multi-monitor clamping artifacts.
- Click and drag timing line up with the visible cursor movement.
- Applied auto-zoom follows the intended cursor area during playback.
- Styled export visually matches preview: same aspect ratio, screen framing, rounded corners, shadow, cursor, zoom, and camera PiP if enabled.
- Raw export plays externally and preserves the original capture without styled presentation.
- Styled export plays externally and has expected dimensions/fps.
- Microphone audio is present and acceptably synchronized when enabled.
- Diagnostics JSON reports `status: "ok"`, video present, expected audio present when enabled, and no drop/queue warnings that persist past startup.

## Environment Record

Copy this block into the acceptance notes for each run:

```text
Date/time:
Git commit or branch:
Packaged artifact path:
OS/distribution:
Desktop environment:
Session type: X11 / Wayland
GPU/driver:
NVIDIA Allow Flipping: disabled / enabled / n/a
Display layout:
FFmpeg version:
Audio backend:
Mic source:
Camera source:
Recording duration:
Project path:
Recording MP4 path:
Diagnostics JSON path:
Raw export path:
Styled export path:
Result: PASS / FAIL
Residual risks:
```

## Failure Handling

- Capture failure: collect app logs, FFmpeg stderr, and the diagnostics JSON if it exists.
- Remux/finalization failure: keep the raw MKV and MP4 paths for probing.
- Sync failure: note the preview/export timestamp where cursor, click, audio, or zoom diverges.
- Export failure: keep the `.roughcut`, raw recording MP4, and export command logs.
- Environment failure: record missing tools, unavailable devices, driver settings, or compositor/session mismatch.

Do not mark the recording flow solid until every failure is fixed, explicitly scoped out, or tracked as a follow-up task.
