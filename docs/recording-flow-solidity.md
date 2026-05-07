# Recording Flow Solidity Checklist

This checklist defines what "the current recording flow is solid" means before adding more Screen Studio-style features. It is a gate, not a guarantee: passing it means the flow is release-candidate solid on the target Linux/X11 machine, with known residual risks documented.

## Scope

Canonical flow:

1. Start a recording.
2. Capture screen video with cursor telemetry and click events.
3. Optionally capture microphone audio.
4. Stop recording cleanly.
5. Remux MKV to MP4.
6. Save a `.roughcut` project.
7. Reopen the project.
8. Preview the styled canvas.
9. Export raw MP4.
10. Export styled MP4.
11. Reopen outputs from disk and verify they play.

Out of scope for this solidity gate:

- Wayland capture.
- System audio capture.
- Region/window capture.
- Pause/resume/cancel.
- Trim/cut editing.
- Webcam PiP acceptance beyond not breaking existing camera plumbing.

## Environment Gate

The target machine must satisfy all of these before recording quality can be judged:

- Linux/X11 session is active; `DISPLAY` is set and reachable.
- `ffmpeg` and `ffprobe` are installed and runnable.
- `xdotool` is installed and can read live cursor position.
- `xinput` is installed if click/drag telemetry is being judged.
- PulseAudio/PipeWire Pulse compatibility is available if mic capture is being judged.
- NVIDIA `Allow Flipping` is disabled on the user's NVIDIA/KDE/X11 setup.
- Enough disk space exists in the recordings directory for the test duration.

## Automated Gate

Run these before manual acceptance:

```bash
pnpm typecheck
pnpm test
pnpm smoke:mvp
ROUGH_CUT_SMOKE_MIC=1 pnpm smoke:mvp
ROUGH_CUT_SMOKE_SYSTEM_AUDIO=1 pnpm smoke:mvp
pnpm smoke:ui
pnpm smoke:styled-export
pnpm smoke:package
pnpm smoke:package-recording-flow
```

Passing criteria:

- Typecheck is clean.
- Unit tests pass across all packages.
- `pnpm smoke:mvp` records, stops, remuxes, saves, reopens, persists cursor telemetry, and exports MP4.
- Mic smoke either records an audio stream or skips with a clear no-device reason.
- UI smoke opens a project, previews, exercises presentation controls, and exports.
- Styled export smoke verifies dimensions, frame rate, cursor visibility, and zoom scenarios.
- Package smoke launches the packaged app and verifies preview/export UI from the installed artifact.
- Package recording-flow smoke records through the packaged pre-record flow, simulates a camera warning, stops, saves, opens review, and verifies post-recording actions plus persisted warning copy.

## Recording Artifact Gate

For a fresh recording, verify the saved project and media artifacts:

- Raw MKV exists until remux has completed or is intentionally retained for diagnostics.
- MP4 exists and `ffprobe` reports a valid video stream.
- MP4 duration is within an acceptable tolerance of the requested recording duration.
- MP4 average frame rate is close to the configured capture fps.
- No FFmpeg stderr warning indicates persistent dropped frames or input queue backpressure after startup.
- `.roughcut` project exists and passes schema migration/validation on reopen.
- Project recording asset metadata includes width, height, fps, startedAt, stoppedAt, rawPath, cursorTelemetryPath, cursorEvents, and audio metadata when enabled.
- Cursor sidecar exists and contains events aligned to recording-start frame numbers.
- Click/drag events are present when the manual test includes clicks or drags.

## Manual Packaged-App Gate

Run this through the packaged app, not only `pnpm dev`:

Detailed runbook: `docs/packaged-recording-acceptance.md`.

1. Launch the packaged app.
2. Select microphone if available.
3. Record a 30-60 second real desktop demo.
4. Move the cursor across the source area and briefly onto another monitor if available.
5. Click and drag at least once.
6. Stop recording.
7. Confirm the project opens automatically.
8. Scrub preview and check video playback, cursor position, and click/drag timing.
9. Generate auto-zoom suggestions and apply one if suggestions exist.
10. Export raw MP4.
11. Export styled MP4.
12. Play both exports outside the app.
13. Reopen the `.roughcut` project and confirm preview/export still work.

Passing criteria:

- No crash or hung FFmpeg process.
- Stop produces a usable project without manual file repair.
- Preview plays smoothly enough for review.
- Cursor overlay follows the real cursor closely with no stuck-edge or multi-monitor clamping artifact.
- Click/drag telemetry lines up well enough for auto-zoom/click effects to build on.
- Mic audio is present and synchronized when enabled.
- Styled export visually matches preview at a semantic level: same screen framing, rounded corners, shadow, cursor, and zoom behavior.
- Raw and styled exports play in an external player.

## Failure Triage

If a gate fails, classify it before adding new features:

- Capture failure: FFmpeg cannot start, capture source invalid, X11 inaccessible.
- Finalization failure: stop/remux leaves corrupt or missing MP4.
- Sync failure: cursor, click, audio, or zoom timing does not match video.
- Quality failure: tearing, dropped frames, stutter, wrong fps, unreadable text.
- Project failure: `.roughcut` missing, invalid, or not reopenable.
- Export failure: raw/styled export fails, wrong dimensions, no audio, or preview/export mismatch.
- Environment failure: missing tools, driver setting, unavailable mic, or compositor issue.

Do not mark recording flow solid while an unclassified failure remains.

## Solidity Decision

The flow can be called release-candidate solid only when:

- All automated gates pass on the target machine.
- One packaged-app manual acceptance run passes.
- Known residual risks are documented in `MASTER_PLAN.md` or a follow-up task.
- Any failure is either fixed or explicitly scoped out of the current Linux/X11 MVP.
