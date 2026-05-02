# Project Claude Notes

- Use the global `reliable-cursor-overlay` skill for cursor telemetry, preview overlays, and styled export cursor rendering.
- Cursor coordinates are source-recording coordinates. Any scale, fit, crop, or zoom must transform video and cursor together.
- Avoid FFmpeg chains with one overlay per telemetry sample; prefer a transparent cursor layer overlaid once.
- Keep styled export full-screen fit until explicit zoom/viewport logic exists.
