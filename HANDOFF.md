# Dropoff — 2026-09-27 17:34 Sunday

```text
You are continuing work in rough-cut-mvp on branch fix/freecut-timeline-sync-foundation.

## Current task & next step
Recording-edit usability pass, driven by the user's live testing. The uncommitted batch
adds Story · 9:16, the screen picker, the region overlay, the stay-on-top recorder,
the window-size fallback, zoom lane placement, and edge extend/reveal.
Next: once the user has closed Rough Cut, run `pnpm package:linux` and have them try
Story · 9:16 in the app. Commit only when they say "commit".

## Files touched / in flight (all UNCOMMITTED; last commit 3dd5d12)
- Story template: packages/project-model/src/recording-templates.ts (story-9-16:
  screenCropAspect '9:16' + backgroundOverrides no padding/radius/shadow).
  main.tsx applyTemplatePreset sets a centred 9:16 screenCrop and drops it when
  leaving. A test export (1080x1920) matched the preview.
- Recorder screen picker: main.tsx ScreenPreviewCard (live getUserMedia desktop
  stream per monitor) sits in one row with a Region card; wholeDisplayCaptureRegion
  records the picked monitor. index.mjs RECORDING_GET_DISPLAYS adds previewSourceId.
- Region overlay: NEW apps/desktop/src/main/region-selector.mjs (+ test) plus a
  RECORDING_SELECT_CAPTURE_REGION handler in index.mjs. Before this the handler never
  existed, so Region had always failed.
- index.mjs: setRecorderStacking (recorder window always-on-top), maximizeStudioWindow
  fallback to the display workArea, keepWindowOnScreen.
- Zoom lane: timeline-rail.mjs timelineFrameToSourceFrame /
  sourceRangeToTimelinePlacement; main.tsx sourceTimeFromClient maps lane→timeline→source.
  shared-timeline.ts computeTimelineDuration skips linkedGroupId markers.
  The auto-zoom count now counts only visible zooms.
- Edges: recording-timeline.mjs extendRecordingSection (fill empty space first,
  then push); clipTrimBounds is ripple-aware; amber hasHiddenFootage chevrons.
- Tests/gates updated: recording-edit-regressions-playwright.mjs (15 checks),
  visual-region-selector-playwright.mjs, verify-recording-editor-design-gate.mjs,
  and the UI smoke inside index.mjs.
- scripts/probe-zoom-drag.mjs is untracked and was NOT written in this session.
  Ask the user before committing or deleting it.

## Key decisions & gotchas
- Zoom and censor ranges live in RECORDING (source) frames by design, so they follow
  the footage through trims and cuts. The lanes are laid out in TIMELINE frames, so
  always convert with timelineFrameToSourceFrame / sourceRangeToTimelinePlacement.
- The user runs the dock app. Never rebuild while it runs: the package step deletes
  its folder. Detect it with `pgrep -f dist/rough-cut-mvp-linux-x64/electron` and
  comm == electron; a hidden or tray window still counts as running. An earlier check
  missed it once and the user tested a stale build.
- The render-guard hook blocks ffmpeg, `node *export*.mjs` and `render` commands.
  Exports need an explicit user OK, asked via AskUserQuestion.
- On this busy desktop, run Playwright probes under `xvfb-run -a`, or check rAF counts;
  throttled windows fake 250 ms stalls. Probe only temp copies of real projects;
  scratch helper copy-project.mjs makes media paths absolute.
- The user wants picture and audio of a section selected together, as one linked
  pair. Ripple (magnet) is ON by default and remembered in localStorage.
- Recording flow still to do: an always-visible stop/pause control while recording.
  Offered, not started.
- The Editor view shows camera only for the 07-25 project; linked-lanes gate fails
  on load (1px markers around a 45-frame clip). Both pre-existing and unfixed.

## Env / run state
Branch: fix/freecut-timeline-sync-foundation | Last commit: 3dd5d12 fix: delete, trim and gaps behave like an editor timeline (pushed)
Running: the user's packaged Rough Cut (dock) is OPEN and blocks the rebuild.
Tests at handoff: desktop 1024 pass, project-model 271 pass, real-app regression gate
and recording smoke pass.

Start by: checking whether Rough Cut is closed. If it is, run `pnpm package:linux`
and tell the user to try Story · 9:16. Otherwise, ask them to close it.
```
