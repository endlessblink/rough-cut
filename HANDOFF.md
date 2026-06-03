# Handoff - 2026-06-04 00:49 Thursday

```text
You are continuing work in rough-cut-mvp on branch feat/timeline-ruler-seek.

## Current task & next step
Fix Rough Cut edited preview playback — next: implement rVFC-driven segmented canvas playback in `StyledVideoPreview` without per-frame `currentTime` seeks.

## Files touched / in flight
Uncommitted tracked files:
- .gitignore
- apps/desktop/src/renderer/src/main.tsx
- apps/desktop/src/renderer/src/styled-preview.mjs
- apps/desktop/src/renderer/src/styled-preview.test.mjs
- apps/desktop/src/renderer/src/styled-video-preview.test.mjs
- apps/desktop/src/renderer/src/styled-video-preview.tsx
- apps/desktop/src/renderer/src/styles.css
- package.json
- scripts/playback-timeline-playwright.mjs

Untracked:
- AI_CREATIVE_STUDIO_DIRECTION.md
- scripts/visual-export-layout-parity.mjs

## Key decisions & gotchas
- Do not return to visible native <video> overlays for edited preview; they caused zoom/camera parity mismatches.
- Do not seek every frame. Current bad pattern is `screenVideo.currentTime = expectedSourceTime` during playback in `styled-video-preview.tsx`.
- The failed canvas-only attempt used rAF + seek-sync and caused black video/stuttering audio because Chromium stayed in `seeking` / `readyState: 1`.
- Correct path: use `video.requestVideoFrameCallback` and segmented playback. Seek only at play start, scrub, or real clip/cut boundary.
- Keep source-mode playback unchanged. First prove continuous timeline segment playback, then cuts/gaps/camera.
- Use real footage verification, not screenshots alone.

## Env / run state
Branch: feat/timeline-ruler-seek | Last commit: 495976d Move zoomed styled exports onto the static mask lane
Running: unrelated Docker services are up; nothing relevant to Rough Cut playback was confirmed running.
Timestamp: 2026-06-04 00:49 Thursday

Start by: inspect `apps/desktop/src/renderer/src/styled-video-preview.tsx` and replace the timeline playback draw loop with an rVFC segment loop that never assigns `video.currentTime` during continuous playback.
```
