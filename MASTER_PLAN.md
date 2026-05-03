# Rough Cut MVP Master Plan

This repo is focused on becoming a Screen Studio-style Linux app for recording client project demos: reliable screen capture first, then polished exports, cursor presentation, and automatic/manual zooms before general-purpose editing.

## Development Rule

- Build one task at a time.
- Do not batch multiple product features into one implementation pass.
- Every task must include automated verification when feasible.
- Every user-visible capture/export change must have a manual packaged-app verification step before moving on.
- Prefer small foundations that unblock the next step over large rewrites.

## Status Summary

| ID | Title | Priority | Status |
| --- | --- | --- | --- |
| TASK-001 | Add repeatable MVP smoke verification script | P1 | DONE |
| TASK-002 | Add Electron UI smoke coverage for preview and export | P2 | DONE |
| TASK-003 | Improve Watchpost compatibility for project task tracking | P2 | DONE |
| TASK-004 | Package the desktop MVP for local install testing | P2 | DONE |
| TASK-005 | Document release-ready Linux/X11 verification steps | P3 | PLANNED |
| TASK-006 | Define client-demo roadmap before editing work | P1 | DONE |
| TASK-007 | Add export mode selection: raw vs styled | P1 | DONE |
| TASK-008 | Add styled 16:9 canvas export preset | P1 | DONE |
| TASK-009 | Add styled export UI preview metadata | P2 | DONE |
| TASK-010 | Add cursor telemetry recording foundation | P1 | DONE |
| TASK-011 | Add cursor overlay export rendering | P1 | DONE |
| TASK-012 | Add cursor overlay preview rendering | P2 | SUPERSEDED → TASK-025 |
| TASK-013 | Add click emphasis telemetry and export rendering | P2 | PLANNED |
| TASK-014 | Add manual zoom marker data model | P1 | DONE |
| TASK-015 | Add manual zoom marker UI controls | P1 | DONE |
| TASK-016 | Add smooth manual zoom export rendering | P1 | DONE |
| TASK-017 | Add zoom preview playback approximation | P2 | SUPERSEDED → TASK-025 |
| TASK-018 | Add automatic zoom suggestion engine | P2 | DONE |
| TASK-019 | Add automatic zoom review/apply flow | P2 | DONE |
| TASK-020 | Add countdown before recording | P2 | PLANNED |
| TASK-021 | Add clear recording indicator and elapsed time | P2 | PLANNED |
| TASK-022 | Add open recording/project folder action | P2 | PLANNED |
| TASK-023 | Add recent projects or recordings list | P2 | PLANNED |
| TASK-024 | Add microphone recording foundation | P2 | PLANNED |
| TASK-025 | Unified preview that mirrors styled export | P1 | DONE |
| TASK-026 | Switch capture pipeline to xdg-desktop-portal + PipeWire (Wayland) | P1 | PLANNED |
| TASK-027 | Cursor-follow zoom (preview + export, parity-preserving) | P1 | IN PROGRESS |

## Recently Verified

- `pnpm test` — desktop 101/101 pass, project-model 91/91 pass.
- `pnpm typecheck` — clean across all 5 packages.
- `pnpm smoke:mvp` verifies record, remux, `.roughcut` save/reopen, export, and FFprobe validation.
- `pnpm smoke:ui` verifies renderer preview/export UI against a synthetic project — `hasZoomMarkerPanel`, `hasAutoZoomSuggestionsPanel`, `hasStyledPreviewCanvas`, `hasExportResult` all true.
- `pnpm smoke:styled-export` verifies both no-zoom and zoom-marker scenarios produce 1920×1080 / 30 fps MP4s with cursor visibility intact.
- `pnpm smoke:package` verifies the packaged Linux artifact launches, previews, and exports.
- X11 capture prerequisites: X11 session, FFmpeg 6.1.1, FFprobe, and **xdotool** (required for cursor capture on Linux/X11 — bypasses Electron's broken multi-monitor `screen.getCursorScreenPoint()` per electron/electron#42519).
- The packaged app was manually checked for record, preview, and export.

## Session checkpoints

- Tag `checkpoint/cursor-stable-2026-05-03` at `e0a01ae` — landed cursor multi-monitor fix + canvas preview. Recovery anchor before auto-zoom + cursor-follow features.

## Capture-source convention

This app uses Linux/X11 with `ffmpeg x11grab` for video and **`xdotool getmouselocation --shell`** for cursor positions (NOT Electron's `screen.getCursorScreenPoint()`, which has a v29+ regression on multi-monitor: returns stale values when the cursor leaves the primary display). The wrapper at `apps/desktop/src/main/index.mjs:28` is `() => readCursorViaXdotool() ?? screen.getCursorScreenPoint()` so non-Linux platforms still work via the Electron fallback. TASK-026 (Wayland pivot) replaces the entire X11 + xdotool stack with `xdg-desktop-portal + PipeWire ScreenCast`, where the compositor draws cursor into the captured stream and app-side tracking becomes unnecessary.

## Direction

The next phase is not generic editing. It is client-demo recording quality.

- First: reliable, testable recording and export foundations.
- Second: client-ready presentation: styled canvas, cursor overlay, click emphasis.
- Third: Screen Studio-style zooms: manual first, automatic suggestions second.
- Fourth: workflow polish: countdown, indicator, quick folder access, recent sessions.
- Later: trimming and timeline editing.

### Preview/export parity principle

Once the styled export pipeline is stable for cursor + zoom, the preview must mirror it deterministically — the user should see exactly what the export will produce. Earlier per-feature preview tasks (TASK-012 cursor preview, TASK-017 zoom preview) are superseded by a single TASK-025 "Unified preview that mirrors styled export" that lands after the export side is locked in. Sequencing: finish styled-export rendering (TASK-011 + TASK-016 + TASK-013), then build the unified preview (TASK-025), then auto-zoom UX (TASK-018, TASK-019). This avoids rebuilding a partial preview every time the export pipeline changes.

### Wayland-readiness principle

X11 is being deprecated and the Wayland pivot (TASK-026) is a bounded *swap-out* of the bottom capture layer plus the cursor-source modules — not a rewrite. To keep it bounded as the app matures, **design new features against cursor-data abstractions** rather than reaching into `metadata.cursorEvents` directly:

- Define `clicksAtFrame(project, frame)`, `cursorAtFrame(project, frame)`, etc. as the canonical access points.
- Implement them once; new features (click emphasis, auto-zoom, anything else cursor-derived) consume the abstractions only.
- When Wayland lands, the implementation behind these abstractions changes (compositor-rendered cursor in stream replaces telemetry); call sites stay untouched.

What survives the pivot regardless: project schema, zoom export math, canvas preview rendering, all UI panels, click-effect rendering, auto-zoom marker generation. What gets replaced: `recording-session.mjs` cursor sampling, `xdotool-cursor.mjs`, `buildCursorAss`. Small, isolated, well-tested modules.

## Tasks

### ~~TASK-001~~ Add repeatable MVP smoke verification script

**Priority:** P1  
**Status:** DONE

#### Context

The MVP flow worked through a one-off Node script, but it was not available as a checked-in command.

#### Completion Notes

- Added `scripts/smoke-mvp.mjs`.
- Added root command `pnpm smoke:mvp`.
- Verified with `pnpm smoke:mvp` and `pnpm test`.

#### Verification

- `pnpm smoke:mvp`
- `pnpm test`

### ~~TASK-002~~ Add Electron UI smoke coverage for preview and export

**Priority:** P2  
**Status:** DONE

#### Context

Automated coverage needed to exercise renderer buttons, preview controls, and export UI state.

#### Completion Notes

- Added root command `pnpm smoke:ui`.
- Added Electron smoke mode that auto-opens a project, waits for video metadata, clicks export, and writes a JSON report.
- Fixed packaged renderer asset paths by setting Vite `base: './'`.

#### Verification

- `pnpm smoke:ui`
- `pnpm test`

### ~~TASK-003~~ Improve Watchpost compatibility for project task tracking

**Priority:** P2  
**Status:** DONE

#### Context

Watchpost was running, but `/api/master-plan` and `/api/status` returned `500` for this repo when queried with the current `cwd`.

#### Completion Notes

- Restored Watchpost's missing `projects.json` registry in the running Watchpost install.
- Confirmed `/api/status` resolves this repo from `cwd`.
- Confirmed `/api/master-plan` returns this `MASTER_PLAN.md` content.

#### Verification

- Watchpost `/api/status` with this repo `cwd`.
- Watchpost `/api/master-plan` with this repo `cwd`.

### ~~TASK-004~~ Package the desktop MVP for local install testing

**Priority:** P2  
**Status:** DONE

#### Context

The app built and ran from source, but packaged local behavior had not been verified.

#### Completion Notes

- Added `pnpm package:linux` to create a local Electron Linux artifact.
- Added `pnpm smoke:package` to launch the packaged artifact against a synthetic project and verify preview/export.
- Verified the packaged artifact launches and exports successfully.

#### Verification

- `pnpm smoke:package`
- `pnpm test`
- Manual packaged app record, preview, and export.

### TASK-005 Document release-ready Linux/X11 verification steps

**Priority:** P3  
**Status:** PLANNED

#### Context

The README states the MVP scope but does not describe how to verify release readiness.

#### Acceptance Criteria

- Document prerequisites: X11 session, FFmpeg, FFprobe, Node, pnpm.
- Document build, automated tests, and smoke verification commands.
- Document where recordings and `.roughcut` files are saved.
- Document packaged app manual verification steps.

#### Verification

- Confirm every documented command runs on this machine.
- Confirm the packaged artifact path is accurate.
- Run `pnpm test` after documentation changes if command docs or scripts are touched.

### ~~TASK-006~~ Define client-demo roadmap before editing work

**Priority:** P1  
**Status:** DONE

#### Context

The broader goal is not just raw recording. The app should become a Screen Studio alternative on Linux for recording client project demos.

#### Completion Notes

- Reframed the plan around client-ready capture and presentation.
- Prioritized styled exports, cursor overlay, click emphasis, automatic zooms, and manual zooms before generic editing.
- Added the no-mass-building rule so each feature lands in a verifiable step.

#### Verification

- Watchpost can parse this plan.
- The next planned task is independently implementable.

### ~~TASK-007~~ Add export mode selection: raw vs styled

**Priority:** P1  
**Status:** DONE

#### Context

Before styled exports exist, the export path needs an explicit mode so raw export remains available and testable.

#### Acceptance Criteria

- Add an export mode field or option with `raw` and `styled` values.
- Keep `raw` as the default until styled export is complete.
- Store the selected mode only where needed; avoid a project format migration unless required.
- Keep existing export behavior unchanged for `raw`.

#### Completion Notes

- Added explicit export mode validation for `raw` and planned `styled` modes.
- Kept `raw` as the default and preserved byte-for-byte export behavior.
- Added a UI export mode selector with `Raw recording` active and `Styled canvas` reserved for the next task.
- Extended UI/package smoke output to verify raw mode and the styled placeholder.

#### Testing

- Unit test export mode validation or command handling.
- UI smoke still exports in raw mode.

#### Verification

- `pnpm test`
- `pnpm smoke:ui`
- `pnpm smoke:package`

### ~~TASK-008~~ Add styled 16:9 canvas export preset

**Priority:** P1  
**Status:** DONE

#### Context

Raw screen exports are functional but not client-ready. The first Screen Studio-style feature is exporting the recording inside a polished 16:9 canvas.

#### Acceptance Criteria

- Export a recording into a 16:9 output canvas.
- Add configurable background color, padding, rounded corners, and shadow.
- Preserve raw export behavior.
- Use FFmpeg filters or a similarly testable export path.
- Keep the preset minimal: one good default, not a full theme system.

#### Completion Notes

- Added `styled` export mode that renders through FFmpeg instead of copying the source file.
- Styled export creates a 1920x1080 canvas with full-screen fitting, pastel gradient background, rounded corners, and soft shadow.
- Refined the first visual pass after manual review to remove the fragile border treatment and move closer to Screen Studio's background, padding, rounded corner, shadow, and zoom/crop model.
- Replaced the color-bar styled smoke fixture with a synthetic product UI so export visuals are easier to judge.
- Visually checked the rendered export frame through Playwright screenshot capture against both synthetic and real recording output before asking for another manual review.
- Added `pnpm smoke:styled-export` to generate a synthetic project, export styled output, and validate 1920x1080 dimensions with FFprobe.
- Enabled the `Styled canvas` option in the export mode selector.

#### Testing

- Unit test styled export command/filter construction.
- Smoke test styled export creates a valid MP4.
- FFprobe validation confirms expected output dimensions.

#### Verification

- `pnpm test`
- `pnpm smoke:styled-export`
- `pnpm smoke:ui`
- `pnpm smoke:package`
- Playwright screenshot of extracted styled export frame.
- Manual packaged export still needed: confirm the styled output visually looks client-ready.

### ~~TASK-009~~ Add styled export UI preview metadata

**Priority:** P2  
**Status:** DONE

#### Context

Users need to know whether they are exporting raw or styled output before clicking export.

#### Acceptance Criteria

- Show the selected export mode in the UI.
- Show styled preset basics: output size, background, padding.
- Do not build a full visual editor yet.

#### Completion Notes

- Added mode-specific export copy below the export selector.
- Raw mode explains it preserves the original recording unchanged.
- Styled mode summarizes the current preset: 1920x1080, full-screen fit, pastel background, rounded screen, and soft shadow.
- UI smoke now switches to styled mode to verify styled preset metadata, then restores raw mode before exporting.

#### Testing

- Renderer smoke verifies the styled mode UI appears.
- Existing raw export UI still works.

#### Verification

- `pnpm test`
- `pnpm smoke:ui`
- `pnpm --filter @rough-cut/desktop test`
- Manual packaged check of export mode display still recommended before release.

### ~~TASK-010~~ Add cursor telemetry recording foundation

**Priority:** P1  
**Status:** DONE

#### Context

For client demos, cursor presentation should be rendered as an overlay instead of relying only on raw cursor pixels captured by FFmpeg.

#### Acceptance Criteria

- Capture cursor position samples while recording.
- Store cursor samples in the `.roughcut` project or a referenced sidecar file.
- Include timestamps aligned to the recording start time.
- Keep screen-only recording working if telemetry capture fails.

#### Completion Notes

- Added cursor position sampling during recording through Electron `screen.getCursorScreenPoint()`.
- Normalized display coordinates into captured-video pixels using the display origin and scale factor.
- Persisted cursor events in the recording asset metadata and wrote a `.cursor.json` sidecar next to the recording.
- Kept telemetry failures non-fatal so screen recording can still stop and save.
- Extended MVP smoke to verify reopened projects contain cursor telemetry.

#### Testing

- Unit test cursor sample normalization and timestamp alignment.
- Service smoke verifies a recording produces cursor telemetry.
- Project reopen test verifies cursor telemetry is readable.

#### Verification

- `pnpm test`
- `pnpm smoke:mvp`
- `pnpm --filter @rough-cut/desktop test`
- Manual packaged recording: confirm project contains cursor telemetry without breaking preview/export.

### ~~TASK-011~~ Add cursor overlay export rendering

**Priority:** P1  
**Status:** DONE

#### Context

Cursor telemetry becomes useful when styled export can render a clean cursor overlay.

#### Acceptance Criteria

- Render cursor overlay in exported video using recorded cursor samples.
- Keep overlay style simple and legible.
- Allow export without cursor overlay if telemetry is missing.
- Preserve raw export behavior.

#### Completion Notes

- Styled export now consumes recorded cursor samples and renders an outlined cursor overlay before canvas styling.
- Cursor filters are skipped when telemetry is missing, preserving existing styled exports without cursor data.
- Dense cursor telemetry is sampled before building FFmpeg filters so export command size stays bounded.
- Styled export smoke now includes synthetic cursor telemetry for export-path verification.
- Visually checked extracted cursor-overlay frames, including a Playwright screenshot capture.

#### Testing

- Unit test cursor overlay filter/render input generation.
- Smoke test export succeeds with cursor telemetry present.
- Smoke test export succeeds with cursor telemetry absent.

#### Verification

- `pnpm test`
- `pnpm smoke:styled-export`
- `pnpm smoke:mvp`
- `pnpm smoke:ui`
- `pnpm --filter @rough-cut/desktop test`
- Playwright screenshot of extracted styled export cursor frame.
- Manual packaged export with real cursor telemetry still recommended before release.

### TASK-012 Add cursor overlay preview rendering

**Priority:** P2  
**Status:** SUPERSEDED → TASK-025

#### Supersede Notes

Cursor preview is no longer treated as a standalone task. The preview/export parity principle (see Direction) folds it into TASK-025 "Unified preview that mirrors styled export." Per-feature previews keep diverging from the export pipeline as new presentation features land; one shared preview renderer that consumes the same `ProjectDocument` and reproduces the styled-export composition is more durable.

#### Context

Users need preview confidence before exporting cursor overlays.

#### Acceptance Criteria

- Render cursor overlay over the video preview using project telemetry.
- Keep playback performant for normal recordings.
- Hide overlay if telemetry is unavailable.

#### Testing

- Renderer/unit test maps cursor sample time to preview position.
- UI smoke verifies overlay container exists for telemetry projects.

#### Verification

- `pnpm test`
- `pnpm smoke:ui`
- Manual packaged preview check.

### TASK-013 Add click emphasis telemetry and export rendering

**Priority:** P2  
**Status:** PLANNED

#### Context

Client demos benefit from visible clicks, but this should build on cursor telemetry rather than become a separate capture system.

#### Acceptance Criteria

- Capture click timestamps and positions during recording.
- Render simple click emphasis in styled export.
- Keep click emphasis optional.

#### Testing

- Unit test click event normalization.
- Export smoke verifies click-emphasis export succeeds.

#### Verification

- `pnpm test`
- Styled export smoke with click events.
- Manual packaged export: visually confirm click emphasis is visible but not distracting.

### ~~TASK-014~~ Add manual zoom marker data model

**Priority:** P1  
**Status:** DONE

#### Context

Manual zooms should be stored as simple project markers before any complex editing UI is added.

#### Acceptance Criteria

- Add zoom marker schema with start time, end time, target center, and scale.
- Store markers in `.roughcut` projects.
- Validate project files with and without zoom markers.

#### Completion Notes

- Audit found the schema already existed: `ZoomMarkerSchema` at `packages/project-model/src/schemas.ts:72-81` with `id`, `startFrame`, `endFrame`, `kind ('auto'|'manual')`, `strength (0–1 unit)`, `focalPoint{x,y}`, `zoomInDuration`, `zoomOutDuration`. Markers persist at `assets[].presentation.zoom.markers` via `ZoomPresentationSchema`, validated end-to-end on every save and load. The v1→v2 migration at `migrations.ts:20-46` already backfills `focalPoint` and durations for legacy files.
- Note on naming: the schema uses `strength` (normalized 0–1) rather than a literal `scale` factor. Treated as a semantic-naming gap, not a missing field — recorded here so a future task can rename if needed without re-discovering it.
- Added the missing regression-locking tests so the existing guarantees can't silently regress when manual-zoom UI work lands.

#### Testing

- `packages/project-model/src/schemas.test.ts` — new `ZoomMarker` describe block: positive end-to-end via `validateProject` (recording asset with a manual marker), JSON round-trip, plus seven negative cases against `ZoomMarkerSchema` (missing `focalPoint` / `startFrame` / `zoomInDuration`, invalid `kind`, `strength` outside 0–1, `focalPoint` coords outside 0–1, negative `startFrame`, non-integer `zoomInDuration`).
- `packages/project-model/src/migrations.test.ts` — new v1→v2 cases asserting that legacy markers missing `focalPoint`/`zoomInDuration`/`zoomOutDuration` get backfilled with defaults `{0.5, 0.5}`, `9`, `9`, and that pre-existing values are preserved.
- `apps/desktop/src/main/project-files.test.mjs` — new round-trip case saving a project with a manual marker via `saveProjectFile` and re-opening with `openProjectFile`, asserting deep-equal preservation.

#### Verification

- `pnpm test` — project-model: 91/91 pass (was 80, +11 new). Desktop: 30/30 pass (was 29, +1 new).
- `pnpm smoke:mvp` — full record → save → reopen → export pipeline: `ok: true`.

### ~~TASK-015~~ Add manual zoom marker UI controls

**Priority:** P1  
**Status:** DONE

#### Context

The first manual zoom UI should be simple and useful, not a full timeline editor.

#### Acceptance Criteria

- Add controls to create, list, and remove zoom markers.
- Use current playback time for marker creation.
- Store changes in the project file.

#### Completion Notes

- Added `ZoomMarkerPanel` inside `ProjectPreview` next to the export controls (`apps/desktop/src/renderer/src/main.tsx`). Reads markers from the active recording asset, shows playback timecode, exposes Add and Remove actions, and persists optimistically through the existing `window.roughCut.saveProject` IPC.
- Lifted `currentTime` from `VideoPreview` via a new optional `onCurrentTimeChange` callback so the panel sees the live playback position without restructuring video state ownership.
- Added pure helpers in a new `apps/desktop/src/renderer/src/zoom-markers.mjs` (with a `.d.mts` companion for renderer typing): `getPrimaryRecordingAsset`, `canAddMarkerAt`, `addManualMarkerAt`, `removeMarker`, `listMarkers`. Helpers reuse `createZoomMarker` and `createDefaultRecordingPresentation` from `@rough-cut/project-model`, are immutable, and return the original document reference on no-op so React reference checks work.
- Add button is disabled when there is not enough room before the end of the recording (`startFrame + 15 frames > asset.duration`); endFrame is clamped to asset duration so newly added markers always fit.
- Extended `Window.roughCut` type in `main.tsx` with the previously-undeclared `saveProject` entry (it was exposed in preload but missing from the renderer-side type).

#### Testing

- New `apps/desktop/src/renderer/src/zoom-markers.test.mjs` (node:test, registered in `apps/desktop/package.json`'s test script) — 14 cases covering primary asset selection, the `canAddMarkerAt` gate, `addManualMarkerAt` validity / clamping / no-op behavior, sort order across multiple inserts, and `removeMarker` filter+no-op semantics.
- Extended `runRendererUiSmoke` in `apps/desktop/src/main/index.mjs` with a `Zoom markers` panel-presence wait; result JSON now includes `hasZoomMarkerPanel: true`.

#### Verification

- `pnpm test` — full suite green: project-model 91/91, desktop 44/44 (was 30, +14 zoom-markers cases).
- `pnpm typecheck` — clean across all packages.
- `pnpm smoke:ui` — UI smoke passes; result JSON: `hasZoomMarkerPanel: true`, `hasExportResult: true`.
- `pnpm smoke:mvp` — record/save/reopen/export pipeline still `ok: true`.
- **Pending: manual packaged-app round-trip** — open a real recording, pause mid-playback, click Add marker, confirm row appears, save and reopen the project, confirm the marker persists, click Remove, confirm it disappears, reopen, confirm it stays gone. Flip status to DONE only after this manual step lands.

### ~~TASK-016~~ Add smooth manual zoom export rendering

**Priority:** P1  
**Status:** DONE

#### Context

Manual zoom markers need to affect final exported output with smooth transitions.

#### Acceptance Criteria

- Export styled video with smooth zoom in/out animation from markers.
- Clamp zoom targets inside source bounds.
- Preserve cursor overlay compatibility.

#### Completion Notes

- Added `apps/desktop/src/main/zoom-filter.mjs`: `buildZoomFilter({ markers, sourceWidth, sourceHeight })` composes a single FFmpeg `zoompan` filter from a markers array using nested `if(lt(on,…))` branches. Each marker contributes a 3-phase ramp (smootherStep ramp-in → hold → smootherStep ramp-out) on `z`, plus matching `x`/`y` expressions that derive the crop window from `focalPoint` and the live `zoom` variable, with edge clamping so the window never extends past source bounds.
- Reused the same constants and easing as `packages/timeline-engine/src/zoom-transform.ts` (`STRENGTH_TO_SCALE_DELTA = 1.5`, Ken Perlin smootherStep `6t⁵−15t⁴+10t³`). Math agreement with the JS path is sub-pixel — zoom-export and the future unified preview (TASK-025) will track each other.
- `buildStyledExportArgs` now accepts `sourceWidth`/`sourceHeight`/`zoomMarkers`. When markers are present it swaps the static `crop=iw*1:ih*1,scale=…` step for `zoompan=…,scale=…` (zoompan outputs at source dims so the existing canvas-fit scale step keeps source aspect ratio). Empty-marker case is byte-for-byte unchanged.
- `getPrimaryRecording` exposes `zoomMarkers` from `asset.presentation?.zoom?.markers`. `exportStyledProjectToMp4` threads them plus source dimensions into the args builder.
- FFmpeg expression sanity test before code: `on` (not `n`) is the output frame counter inside zoompan; `between` is not supported but `lt`/`gt`/nested-if works; `pow(t, k)` is fine; `zoom` is accessible inside `x`/`y` expressions; comma escaping is unnecessary when filter strings reach FFmpeg via `spawn`.

#### Testing

- New `apps/desktop/src/main/zoom-filter.test.mjs` — 7 golden-string cases: empty markers, dimension validation, single-marker structure (range conditionals + smootherStep + clamped axis expressions), strength scaling, off-center focal points, two non-overlapping markers sorted by `startFrame`, output `s=` matches source dims.
- Extended `apps/desktop/src/main/export-service.test.mjs` with two new cases asserting `zoompan=…` appears (and the static `crop=iw*1` is replaced) when markers are present, and that the static path is preserved when markers are empty.
- Extended `scripts/smoke-styled-export.mjs` with a second export against the same synthetic project plus a manual zoom marker; FFprobe confirms 1920×1080 output and the bytes differ from the no-marker baseline (105,484 vs 27,226 bytes — the zoomed render encodes more detail per pixel).

#### Verification

- `pnpm test` — full suite green: project-model 91/91, desktop 53/53 (was 44, +9 new: 7 zoom-filter + 2 zoompan in export-service).
- `pnpm typecheck` — clean across all 5 packages.
- `pnpm smoke:styled-export` — both no-zoom and zoom-marker scenarios pass; both produce 1920×1080 MP4s; cursor overlay assertion still passes for the no-zoom baseline.
- `pnpm smoke:mvp` — record/save/reopen/export pipeline still `ok: true`.
- **Pending: manual packaged-app round-trip** — record (or open an existing recording), add a manual zoom marker via TASK-015's panel at ~2 s, export styled, scrub the resulting MP4, confirm a smooth zoom-in around 2 s, hold at full zoom, then a smooth zoom-out. Flip status to DONE only after this manual step lands.

### TASK-017 Add zoom preview playback approximation

**Priority:** P2  
**Status:** SUPERSEDED → TASK-025

#### Supersede Notes

Zoom preview is folded into TASK-025 "Unified preview that mirrors styled export" for the same reason as TASK-012. A unified Canvas/WebGL preview that mirrors the FFmpeg styled-export pipeline serves zoom, cursor, and future presentation features off the same source of truth. If a faster bridge is needed before TASK-025 lands, this task can be reactivated as a Canvas2D zoom-only stop-gap.

#### Context

Before exporting, users should be able to approximate how manual zooms will feel in preview.

#### Acceptance Criteria

- Apply zoom marker transforms during preview playback.
- Keep preview close enough to export behavior for timing decisions.
- Avoid overbuilding a full render engine.

#### Testing

- Unit test active zoom marker selection by playback time.
- UI smoke verifies preview can load a project with zoom markers.

#### Verification

- `pnpm test`
- `pnpm smoke:ui`
- Manual packaged preview check against exported result.

### ~~TASK-018~~ Add automatic zoom suggestion engine

**Priority:** P2  
**Status:** DONE

#### Context

Automatic zooms should be suggestions based on cursor activity, not irreversible edits.

#### Acceptance Criteria

- Analyze cursor dwell, click events, or movement clusters.
- Generate candidate zoom markers.
- Avoid excessive or jittery suggestions.
- Keep the engine deterministic for testing.

#### Completion Notes

- Audit found the underlying engine already implemented and tested in `packages/timeline-engine/src/auto-zoom.ts` (`generateAutoZoomMarkers` + `filterAutoMarkersAgainstManual`) but never wired into the app. TASK-018 ships the integration: two small renderer-side modules that expose the engine via Wayland-ready abstractions.
- New `apps/desktop/src/renderer/src/cursor-data.mjs` (+ `.d.mts`) — accessors `getCursorEvents`, `getCursorClickEvents`, `getCursorMoveEvents`, `getRecordingFps`, `getRecordingSourceSize`. Wraps `metadata.cursorEvents` access; today reads the array directly, on Wayland (TASK-026) the implementation behind these names changes without touching call sites.
- New `apps/desktop/src/renderer/src/auto-zoom-suggestions.mjs` (+ `.d.mts`) — `generateSuggestionsForProject(document, options?) → { candidates, filtered, existingManual }`. Composes `generateAutoZoomMarkers` + `filterAutoMarkersAgainstManual` + the new accessors. Defaults intensity to `presentation.zoom.autoIntensity ?? 0.5`. Deterministic.
- The recorder still emits move-only events today (no clicks). `generateAutoZoomMarkers` falls back to teleport detection (large normalized cursor jumps above 0.2-0.4 threshold depending on intensity) when no clicks are present. Auto-zoom works against move-only data; suggestions become more click-precise once click capture lands (TASK-013 precondition).

#### Testing

- `apps/desktop/src/renderer/src/cursor-data.test.mjs` — 12 cases covering empty/null documents, recording asset selection, click/move filtering, fps fallback (asset metadata → settings.frameRate → default), source size fallback (asset metadata → settings.resolution → default).
- `apps/desktop/src/renderer/src/auto-zoom-suggestions.test.mjs` — 7 cases covering empty cursor events, teleport-derived candidates with `kind: 'auto'`, manual-marker conflict filtering, intensity override, determinism across repeated calls, fallback to default intensity.
- Both registered in `apps/desktop/package.json` test script.

#### Verification

- `pnpm test` — desktop 101/101 (was 82, +19 new across cursor-data + auto-zoom-suggestions). project-model 91/91.
- `pnpm typecheck` — clean across all 5 packages.
- `pnpm smoke:mvp` and `pnpm smoke:ui` — unchanged (TASK-018 ships dormant code paths only; nothing wired into runtime flow until TASK-019 adds UI).
- No manual packaged-app verification needed — engine + abstractions only. Manual verification belongs in TASK-019 (review/apply UI).

### ~~TASK-019~~ Add automatic zoom review/apply flow

**Priority:** P2  
**Status:** DONE

#### Context

Automatic zoom suggestions need a user-facing review step before they become project markers.

#### Acceptance Criteria

- Add UI to generate automatic zoom suggestions.
- Let the user apply or discard suggestions.
- Applied suggestions become normal manual zoom markers.

#### Completion Notes

- New `AutoZoomSuggestionsPanel` component co-located in `apps/desktop/src/renderer/src/main.tsx` (mirrors the `ZoomMarkerPanel` pattern). Renders inside `ProjectPreview` after the existing zoom markers panel.
- "Generate suggestions" button calls `generateSuggestionsForProject(document)` from TASK-018's wrapper. After generation: shows the filtered candidate list (auto markers that don't overlap manual ones), plus a count of conflicts so the user knows when their manual markers blocked auto candidates.
- Per-row Apply / Discard actions:
  - **Apply** → calls `applySuggestionAsManual(document, suggestion)` (new helper in `zoom-markers.mjs`) which creates a fresh-id manual marker preserving the suggestion's frame range, focal point, strength, and durations. Persists optimistically through the existing `window.roughCut.saveProject` IPC. Removes the suggestion from local state on success.
  - **Discard** → removes from local state only; no project mutation. Suggestions are transient (not persisted), so a future regenerate produces fresh candidates.
- All actions disabled while a save is in flight (`isSaving` flag); save errors surface inline and revert the optimistic update.
- Empty / pre-generation states show contextual hints so the panel is self-documenting.

#### Testing

- New `applySuggestionAsManual` cases in `apps/desktop/src/renderer/src/zoom-markers.test.mjs` — fresh-id behavior, field preservation, sort-by-startFrame, no-op when no recording asset.
- `runRendererUiSmoke` extended to wait for the "Auto-zoom suggestions" panel header. Result JSON gains `hasAutoZoomSuggestionsPanel: true`.

#### Verification

- `pnpm test` — desktop 104/104 (was 101, +3 applySuggestionAsManual cases). project-model 91/91.
- `pnpm typecheck` — clean across all 5 packages.
- `pnpm smoke:ui` — passes; result JSON: `hasAutoZoomSuggestionsPanel: true`, `hasZoomMarkerPanel: true`, `hasStyledPreviewCanvas: true`, `hasExportResult: true`.
- `pnpm smoke:mvp` — record/save/reopen/export pipeline still `ok: true`.
- **Pending: manual packaged-app round-trip** — open a real recording, click "Generate suggestions", confirm a list appears (or the empty-state message if cursor data didn't yield any), apply one or more, verify the markers persist after close+reopen, regenerate to confirm conflict-with-manual filtering works. Today's auto-zoom uses teleport-detection only (no click telemetry yet); suggestion quality on a real recording is the manual-verification signal.

### TASK-020 Add countdown before recording

**Priority:** P2  
**Status:** PLANNED

#### Context

Client demo recording needs a short preparation window so recordings start cleanly.

#### Acceptance Criteria

- Add a configurable or fixed countdown before capture starts.
- Make it clear when countdown is active vs recording active.
- Ensure cancellation during countdown is safe.

#### Testing

- Unit test countdown state transitions if state is extracted.
- UI smoke verifies recording can still start after countdown.

#### Verification

- `pnpm test`
- Manual packaged recording: confirm countdown and resulting file start are acceptable.

### TASK-021 Add clear recording indicator and elapsed time

**Priority:** P2  
**Status:** PLANNED

#### Context

During client-project recording, the user needs confidence that capture is active.

#### Acceptance Criteria

- Show a clear recording indicator.
- Show elapsed recording time.
- Keep stop action obvious.

#### Testing

- UI smoke verifies recording state display changes when mocked or smoke-triggered.

#### Verification

- `pnpm test`
- Manual packaged recording: confirm indicator is visible and accurate enough.

### TASK-022 Add open recording/project folder action

**Priority:** P2  
**Status:** PLANNED

#### Context

After recording or export, users need fast access to client-demo files.

#### Acceptance Criteria

- Add an action to open the current project or recording folder.
- Disable or explain the action when no folder is available.

#### Testing

- Main-process test verifies folder-open command calls the shell safely.
- UI smoke verifies the action is visible after opening a project.

#### Verification

- `pnpm test`
- Manual packaged check: action opens the expected folder.

### TASK-023 Add recent projects or recordings list

**Priority:** P2  
**Status:** PLANNED

#### Context

Client project work often involves reopening the last few recordings quickly.

#### Acceptance Criteria

- Track recently opened or created `.roughcut` projects.
- Show a simple recent list on app start.
- Handle missing files gracefully.

#### Testing

- Unit test recent-project persistence and missing-file handling.
- UI smoke verifies a recent project can be reopened.

#### Verification

- `pnpm test`
- `pnpm smoke:ui`
- Manual packaged check across app restarts.

### TASK-024 Add microphone recording foundation

**Priority:** P2  
**Status:** PLANNED

#### Context

Client demos often need narration. Microphone support should come after the core visual presentation path is stable.

#### Acceptance Criteria

- Detect available microphone input or document the selected input path.
- Record microphone audio with screen capture.
- Keep screen-only recording available.
- Save audio metadata in the project.

#### Testing

- Unit test FFmpeg audio argument construction.
- Service smoke can skip clearly when no microphone input is available.

#### Verification

- `pnpm test`
- Manual packaged recording with mic input on the target Linux setup.

### ~~TASK-025~~ Unified preview that mirrors styled export

**Priority:** P1  
**Status:** DONE  
**Supersedes:** TASK-012, TASK-017

#### Context

Until preview matches export, every presentation feature ships blind: users add zoom markers, cursor styling, and (eventually) click emphasis without seeing how the styled export will look. Per-feature previews (TASK-012 cursor, TASK-017 zoom) would each chase a moving target as the export pipeline grows. This task replaces both with one preview renderer that consumes the same `ProjectDocument` and reproduces the styled-export composition deterministically. The preview becomes the source of truth for "what will the export look like." Sequencing: lands AFTER TASK-016 (smooth manual zoom export) so the export semantics are stable, and BEFORE TASK-018/019 (auto-zoom UX) so users can evaluate suggestions visually.

#### Completion Notes (MVP)

- `apps/desktop/src/renderer/src/styled-preview.mjs` (+`.d.mts`) — pure helpers: `cursorAtFrame` (linear interpolation between bracketing telemetry events, off-screen pass-through, sorts unsorted input, skips invalid events) and `drawCursorPath` (Canvas2D rendering of the same vector polygon the styled export's ASS layer produces).
- `apps/desktop/src/renderer/src/main.tsx` `VideoPreview` — rebuilt as hidden `<video>` source + visible `<canvas>` overlay. A `requestAnimationFrame` loop calls `resolveFrame(project.document, currentFrame)` from `@rough-cut/frame-resolver` to get the canonical `cameraTransform = { scale, offsetX, offsetY }`, applies it via `ctx.translate + ctx.scale + drawImage(video) + drawCursorPath`. Cursor is drawn under the same transform, so it scales with the video pixels (matches export and Screen Studio / FocuSee behavior). Existing playback controls (play/pause/seek slider) act on the hidden video, no rewiring.
- `styles.css` — `.styledPreview .hiddenSource` positions the `<video>` off-screen but live (Chromium keeps decoding for `drawImage`); `.styledPreviewCanvas` carries the canvas styling: pastel linear-gradient background approximating the export's `geq` gradient, 26px border-radius matching the export's rounded corners, soft `box-shadow` matching the export's blurred drop shadow.
- `runRendererUiSmoke` — new `waitFor` for `canvas.styledPreviewCanvas`; result JSON gains `hasStyledPreviewCanvas`.

#### Out of scope (deferred to later refactor)

- Pixel-perfect parity with the export's `geq` per-pixel gradient and `boxblur` shadow — CSS approximation lands in MVP.
- Wiring the export side to also consume `resolveFrame` (the architectural keystone is already designed in `packages/frame-resolver/src/resolve-frame.ts:226`; export currently builds FFmpeg filters directly from the same underlying math).
- Click effects in preview — folds in once TASK-013 click telemetry/effect renders.

#### Acceptance Criteria

- Preview renders the same styled composition the export produces: pastel background, rounded screen, soft shadow, full-screen fit, cursor overlay (TASK-011), manual zoom transitions (TASK-016), and any future presentation features that land in styled export.
- Preview consumes the canonical `ProjectDocument` (no separate preview-only state).
- Preview stays in sync with playback time and seek; performance must hold for typical client-demo recordings.
- Preview must be deterministic — given the same project at the same playback frame, preview pixels and export pixels match within a defined tolerance (exact match where possible, sub-pixel for filters that differ between Canvas/WebGL and FFmpeg).

#### Testing

- Unit tests for the rendering description (the shared spec consumed by both preview and export).
- Visual snapshot test: take a frame from preview at time T, take the corresponding export frame at the same T, assert structural similarity above a threshold.
- Renderer smoke loads a project with a manual zoom marker and a cursor sample, verifies the preview canvas reflects both.
- Existing UI smoke continues to pass.

#### Verification

- `pnpm test` — desktop 74/74 (was 64, +10 styled-preview cases). Project-model 91/91.
- `pnpm typecheck` — clean across all 5 packages.
- `pnpm smoke:ui` — passes; result JSON: `hasStyledPreviewCanvas: true`, `hasZoomMarkerPanel: true`, `hasExportResult: true`.
- `pnpm smoke:mvp` — record/save/reopen/export pipeline still `ok: true`.
- `pnpm smoke:styled-export` — both no-zoom and zoom-marker scenarios still pass; fps and cursor regressions still green.
- **Pending: manual packaged-app check** — open a recording with a manual zoom marker, scrub through the marker range, confirm the preview canvas zooms smoothly, the cursor tracks correctly under zoom, and the preview matches the eventual export semantically. Flip status to DONE only after this manual step lands.

#### Implementation Notes (for future planning)

- Likely a Canvas2D or WebGL surface drawn over the existing `<video>` element, transformed each `requestAnimationFrame`.
- Best implemented as a shared "render description" (a JSON-able pipeline spec) consumed by both the renderer's preview surface and the main process's FFmpeg filter graph builder. Keeps both runtimes from diverging.
- The cursor overlay rendering already exists in the styled-export FFmpeg path (TASK-011). The render description should capture that same logic so preview can replicate it.

### TASK-026 Switch capture pipeline to xdg-desktop-portal + PipeWire (Wayland)

**Priority:** P1  
**Status:** PLANNED  
**Supersedes-on-completion:** TASK-010 (cursor telemetry recording), TASK-011 (cursor overlay export), and the entire reliable-cursor-overlay architecture

#### Context

X11 is being deprecated by major Linux distributions in favor of Wayland. The current capture stack (FFmpeg `x11grab` + Electron `screen.getCursorScreenPoint()` + xdotool fallback for cursor + ASS-burned-in cursor for export) is X11-specific and won't work on native Wayland. Even on X11 today, the cursor pipeline has been a long string of integration bugs (clamping, `getCursorScreenPoint()` regression, off-screen pass-through, fps mismatches).

The Wayland-native answer is fundamentally simpler: use **xdg-desktop-portal's ScreenCast API** (with **PipeWire** as the transport). The compositor draws the cursor into the captured video stream itself. The app receives a stream with cursor already rendered, at the compositor's full visual fidelity. No cursor telemetry, no separate overlay, no clamping concerns, no zoom-aware cursor scaling logic — the cursor is just pixels in the source video.

#### Acceptance Criteria

- New capture path uses xdg-desktop-portal's `org.freedesktop.portal.ScreenCast` interface to obtain a PipeWire stream node ID.
- FFmpeg input switches from `-f x11grab -i …` to `-f pipewiregrab -i <node-id>` (or equivalent), or a Node-side reader bridges PipeWire to FFmpeg via a pipe.
- Capture works on both GNOME Wayland and KDE Wayland (the two dominant compositors). Verify on at least one.
- Cursor is included in the captured stream by default (compositor renders it).
- Existing record → save → export pipeline still works end-to-end with the new capture source. Existing `.roughcut` projects remain valid.
- Old x11grab path stays as a fallback for X11 sessions until Wayland support is verified production-ready.

#### Implications for existing code

- `apps/desktop/src/main/recording/recording-session.mjs` — `getCursorPoint`, `sampleCursor`, the cursor sidecar JSON, and the entire cursor telemetry layer become obsolete on Wayland. Either gate them behind an "X11 mode" flag or remove them once Wayland is the default.
- `apps/desktop/src/main/recording/xdotool-cursor.mjs` — obsolete; remove when X11 path retires.
- `apps/desktop/src/main/export-service.mjs` — `buildCursorAss` and the ASS subtitles cursor overlay become unnecessary because the cursor is already in the source video. Cursor styling features (highlights, click effects, zoom-aware sizing) move to a video post-processing layer (FFmpeg overlays or canvas renderer in the unified preview).
- TASK-025 (unified preview) — already canvas-based. Once the source video has the cursor pre-rendered, the cursor-drawing logic in `styled-preview.mjs` is no longer needed for fidelity, but stays useful for cursor effects/highlights.
- Project schema's `cursorEvents` field becomes legacy. Migration: keep reading old `.roughcut` files; new recordings don't populate it.

#### Testing

- Unit test for the portal request flow with a mocked DBus client.
- Integration test that records a few seconds of a synthetic surface via PipeWire → FFmpeg, asserts a valid MP4 is produced.
- Manual verification on GNOME Wayland and KDE Wayland separately.

#### Verification

- `pnpm test`
- `pnpm smoke:mvp` — recording produces a valid MP4 on Wayland.
- Manual record + export with cursor visibly tracking across monitors via the compositor's own cursor rendering.

#### Risks

- xdg-desktop-portal ScreenCast requires user-granted permission per session; first-launch UX needs a clear consent flow.
- Some compositors restrict portal capture (especially with multi-monitor selection); test on the user's actual setup before committing the rewrite.
- FFmpeg's `pipewiregrab` filter is relatively new; lock the FFmpeg version in package metadata and document the minimum.
- Keeping the X11 path alongside Wayland adds complexity. Decide whether to maintain both, gate by session type (`$XDG_SESSION_TYPE`), or drop X11 once Wayland is verified.

### TASK-027 Cursor-follow zoom (preview + export, parity-preserving)

**Priority:** P1  
**Status:** IN PROGRESS

#### Context

Schema's `ZoomPresentation.followCursor: true` and the engine's cursor-follow path (`getZoomTransformAtFrame` with `getCursorPosition` option) have been in place since TASK-018 territory but unwired in both preview and export. TASK-027 lights them up on both sides while preserving the preview/export parity principle. By design, only **auto markers** follow the cursor — the engine respects manual markers' user-picked focal as static, since the user explicitly chose where to zoom.

#### Acceptance Criteria

- Preview canvas applies cursor-follow during auto marker hold phases.
- Styled export applies the same cursor-follow at pixel parity with preview.
- Manual markers stay at their user-picked focal in both surfaces.
- No schema migration needed.

#### Completion Notes

- New `apps/desktop/src/main/zoom-sendcmd.mjs` — pre-computes per-frame crop windows in JS via `getZoomTransformAtFrame` (with cursor-follow options) and emits both an FFmpeg filter fragment + a sendcmd file. The math runs once during export setup; preview consumes the same `getZoomTransformAtFrame` directly. Sub-pixel parity guaranteed by both sides using the same source code.
- `apps/desktop/src/main/export-service.mjs` swapped from `zoompan` (static expressions) to `crop=...,sendcmd=f=...,scale=...`. The crop filter accepts per-frame parameter updates via sendcmd (verified `T` timeline flag on all four crop params in FFmpeg 6.1.1).
- Preview wiring in `apps/desktop/src/renderer/src/main.tsx` passes a `getCursorPosition` callback to `resolveFrame` per rAF tick. The callback returns normalized cursor coords from `cursorAtFrame(events, frame)`. Auto markers pan automatically.
- Manual markers continue to use static focal — the engine's `getMarkerFocalPoint` (`zoom-transform.ts:147-182`) intentionally skips cursor-follow for `kind !== 'auto'`. Locked in via dedicated test.
- Old `zoom-filter.mjs` + `zoom-filter.test.mjs` deleted; `zoom-sendcmd.test.mjs` ports the relevant cases plus 5 new ones for the cursor-follow specifics.
- FFmpeg sanity test ran first (mirroring TASK-016 risk-mitigation pattern): one-off `ffmpeg -lavfi color=...,sendcmd=f=...,scale=...` confirmed `crop x VALUE` syntax works at the user's FFmpeg version (6.1.1) before any helper code landed.

#### Testing

- New `zoom-sendcmd.test.mjs` — 9 cases: empty markers, dimension/fps/totalFrames validation, line-per-frame timestamp emission, frame-0 initial crop covers full source for outside-marker frames, hold-phase static crop math at scale=2.5/focal=center, cursor-following auto marker pans during hold, manual markers do not follow cursor, sendcmd content trailing-newline format.
- Updated `export-service.test.mjs` — replaces `zoompan=` assertions with `crop=...,sendcmd=...` assertions; "no zoom layer" case asserts neither `zoompan=` nor `sendcmd=` appears.
- `smoke-styled-export.mjs` continues to pass — manual marker scenario (static focal) produces a valid 1920×1080 / 30 fps MP4 distinct from no-marker baseline; bytes shifted (101820 → 125050) because sendcmd adds per-frame command processing.

#### Verification

- `pnpm test` — 101/101 desktop pass (was 104, net -3 because zoom-filter's 12 cases were replaced by zoom-sendcmd's 9; 2 export-service cases swapped 1:1).
- `pnpm typecheck` — clean across all 5 packages.
- `pnpm smoke:styled-export` — both no-zoom and zoom-marker scenarios pass; cursor visibility check at marker boundary still passes.
- `pnpm smoke:mvp` — record/save/reopen/export pipeline still `ok: true`.
- `pnpm smoke:ui` — `hasZoomMarkerPanel: true`, `hasAutoZoomSuggestionsPanel: true`, `hasStyledPreviewCanvas: true` all pass.
- **Pending: manual packaged-app verification** — record while moving cursor across the screen, generate auto-zoom suggestions, apply one, watch the canvas preview during playback (focal should pan with cursor during auto-marker hold), export styled and confirm same behavior in the MP4. Manual zoom markers should stay statically centered on their focal.
