# Cursor-sync ground-truth harness

Measures the end-to-end offset between recorded video and cursor telemetry.
A Chromium window flips black/white while xdotool jumps the mouse at the same
wall instant; the flip is visible in the video, the jump in the telemetry.
`analyze.py` reports the residual in frames (aligned should be within ~1 frame
screen-only, ~3 frames with camera).

Usage (takes over the mouse for ~10 s):

    node record-ground-truth.mjs            # screen-only path
    CAMERA=/dev/video0 node record-ground-truth.mjs   # unified camera path
    CYCLES=60 node record-ground-truth.mjs  # ~75 s drift test (CYCLE_SLEEP_MS tunes spacing)
    python3 analyze.py

The first 1-2 cycles read as outliers (Chromium first-paint warm-up); judge
the steady-state residual. Uses system Chromium (`CHROMIUM_PATH` to override)
because the playwright-managed build may be missing.

Assumes primary display 1920x1080 at +0,0 and playwright installed globally.
Written 2026-07-14 while fixing the telemetry-vs-video clock alignment
(see CLAUDE.md "Cursor telemetry uses a two-clock model").
