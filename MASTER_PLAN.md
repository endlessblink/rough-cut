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
| TASK-005 | Document release-ready Linux/X11 verification steps | P3 | DONE |
| TASK-006 | Define client-demo roadmap before editing work | P1 | DONE |
| TASK-007 | Add export mode selection: raw vs styled | P1 | DONE |
| TASK-008 | Add styled 16:9 canvas export preset | P1 | DONE |
| TASK-009 | Add styled export UI preview metadata | P2 | DONE |
| TASK-010 | Add cursor telemetry recording foundation | P1 | DONE |
| TASK-011 | Add cursor overlay export rendering | P1 | DONE |
| ~~TASK-012~~ | Add cursor overlay preview rendering | P2 | SUPERSEDED → TASK-025 |
| TASK-013 | Add click emphasis telemetry and export rendering | P2 | DONE |
| TASK-014 | Add manual zoom marker data model | P1 | DONE |
| TASK-015 | Add manual zoom marker UI controls | P1 | DONE |
| TASK-016 | Add smooth manual zoom export rendering | P1 | DONE |
| ~~TASK-017~~ | Add zoom preview playback approximation | P2 | SUPERSEDED → TASK-025 |
| TASK-018 | Add automatic zoom suggestion engine | P2 | DONE |
| TASK-019 | Add automatic zoom review/apply flow | P2 | DONE |
| TASK-020 | Add countdown before recording | P2 | DONE |
| TASK-021 | Add clear recording indicator and elapsed time | P2 | DONE |
| TASK-022 | Add open recording/project folder action | P2 | DONE |
| TASK-023 | Add recent projects or recordings list | P2 | DONE |
| TASK-024 | Add microphone recording foundation | P2 | DONE |
| TASK-025 | Unified preview that mirrors styled export | P1 | DONE |
| TASK-026 | Switch capture pipeline to xdg-desktop-portal + PipeWire (Wayland) | P1 | PLANNED |
| ~~TASK-027~~ | Cursor-follow zoom (preview + export, parity-preserving) | P1 | DONE (2026-05-06) |
| TASK-028 | Add aspect ratio presets for styled exports | P1 | DONE |
| TASK-029 | Build editor shell and screen presentation controls | P1 | DONE |
| TASK-030 | Add cursor-follow zoom regression fixtures | P1 | DONE |
| TASK-031 | Add preview/export parity regression snapshots | P1 | DONE |
| TASK-032 | Add packaged-app visual regression smoke | P2 | DONE |
| TASK-033 | Define recording-flow solidity checklist | P1 | DONE |
| TASK-034 | Add real-recording regression harness | P1 | DONE |
| TASK-035 | Add recording health diagnostics report | P1 | DONE |
| TASK-036 | Add long-recording stability smoke | P1 | DONE |
| TASK-037 | Add packaged recording acceptance runbook | P1 | DONE |
| TASK-038 | Add system audio capture controls | P1 | DONE |
| TASK-039 | Add capture target picker | P1 | DONE |
| TASK-040 | Add pause, resume, and cancel recording | P1 | DONE |
| TASK-041 | Add post-recording next-action flow | P1 | DONE |
| TASK-042 | Render click emphasis in preview and export | P1 | DONE |
| TASK-043 | Add webcam PiP presentation controls | P1 | DONE |
| TASK-044 | Add cursor style controls | P2 | DONE |
| TASK-045 | Add background style presets | P2 | DONE |
| TASK-046 | Add trim start and end controls | P1 | DONE |
| TASK-047 | Add simple cut removal flow | P2 | DONE |
| TASK-048 | Add optional webcam PiP recording and export | P1 | DONE |
| TASK-049 | Build Screen Studio-style editor UI foundation | P1 | DONE |
| TASK-050 | Add Screen Studio-style pre-record panel | P1 | EXTERNAL |
| TASK-051 | Add post-recording review workspace | P1 | DONE |
| TASK-052 | Add timeline-first playback and edit rail | P1 | DONE |
| TASK-053 | Add extensible properties inspector system | P1 | DONE |
| TASK-054 | Add thumbnail source picker for recording targets | P1 | EXTERNAL |
| TASK-055 | Add audio and camera preflight controls | P1 | EXTERNAL |
| TASK-056 | Add pre-record smoke and packaged checks | P1 | EXTERNAL |
| TASK-057 | Add timeline interaction visual regression suite | P1 | DONE |
| TASK-058 | Add non-destructive edit recovery affordances | P2 | DONE |
| TASK-059 | Add preflight checklist and session-risk warnings | P1 | DONE |
| TASK-060 | Debug long-smoke post-save failure | P1 | DONE |
| TASK-061 | Fix choppy camera playback via canvas frame dedup | P1 | DONE |
| TASK-062 | Add real window and region selection UI | P2 | DONE |

## Recently Verified

- `pnpm --filter @rough-cut/desktop test` — desktop 160/160 pass.
- `pnpm --filter @rough-cut/timeline-engine test` — timeline-engine 184/184 pass.
- `pnpm typecheck` — clean across all 5 packages.
- `pnpm smoke:mvp` verifies record, remux, `.roughcut` save/reopen, export, and FFprobe validation.
- `pnpm smoke:ui` verifies renderer preview/export UI against a synthetic project — `hasZoomMarkerPanel`, `hasAutoZoomSuggestionsPanel`, `hasStyledPreviewCanvas`, `hasExportResult` all true.
- `pnpm smoke:recording-flow-ui` verifies the live Record -> Stop recording -> saved project -> video metadata -> styled preview canvas transition.
- `pnpm smoke:styled-export` verifies both no-zoom and zoom-marker scenarios produce 1920×1080 / 30 fps MP4s with cursor visibility intact.
- `pnpm smoke:package` verifies the packaged Linux artifact launches, previews, and exports.
- X11 capture prerequisites: X11 session, FFmpeg 6.1.1, FFprobe, and **xdotool** (required for cursor capture on Linux/X11 — bypasses Electron's broken multi-monitor `screen.getCursorScreenPoint()` per electron/electron#42519).
- The packaged app was manually checked for record, preview, and export.

## Session checkpoints

- Tag `checkpoint/cursor-stable-2026-05-03` at `e0a01ae` — landed cursor multi-monitor fix + canvas preview. Recovery anchor before auto-zoom + cursor-follow features.
- Tag `checkpoint/cursor-follow-hold-containment-2026-05-06` — stabilizes professional cursor-follow zoom behavior: action-focused ramp-in, contained hold, and cursor-independent zoom-out reveal.

## Capture-source convention

This app uses Linux/X11 with `ffmpeg x11grab` for video and **`xdotool getmouselocation --shell`** for cursor positions (NOT Electron's `screen.getCursorScreenPoint()`, which has a v29+ regression on multi-monitor: returns stale values when the cursor leaves the primary display). The wrapper at `apps/desktop/src/main/index.mjs:28` is `() => readCursorViaXdotool() ?? screen.getCursorScreenPoint()` so non-Linux platforms still work via the Electron fallback. TASK-026 (Wayland pivot) replaces the entire X11 + xdotool stack with `xdg-desktop-portal + PipeWire ScreenCast`, where the compositor draws cursor into the captured stream and app-side tracking becomes unnecessary.

## Direction

The next phase is not generic editing. It is client-demo recording quality.

- First: reliable, testable recording and export foundations.
- Second: client-ready presentation: styled canvas, cursor overlay, click emphasis.
- Third: Screen Studio-style zooms: manual first, automatic suggestions second.
- Fourth: workflow polish: countdown, indicator, quick folder access, recent sessions.
- Later: trimming and timeline editing.

### UI reference direction

Recordly and Screen Studio both converge on the same workflow shape: a focused recording setup, a large central styled preview, a bottom timeline for time-based edits, and an inspector/actions area for presentation/export settings. The app should follow that product model without copying either product verbatim.

Reference notes from Recordly:

- Recording starts from a dedicated setup surface: screen/window choice, microphone, system audio, camera, then record.
- Editing centers on a large styled preview, not a form-first control panel.
- The timeline is the home for zooms, trims, speed regions, annotations, audio, and crop-aware edits.
- Presentation settings are grouped by concern: cursor, webcam overlay, frame/background, aspect ratio, and export.
- Project files preserve source media plus editor state, so reopening returns the user to the same editor workspace.

Reference notes from Screen Studio:

- The app is opinionated: good defaults for canvas, zooms, cursor smoothing, spacing, shadows, and export presets.
- Recording setup supports screen, webcam, microphone, and system audio without making screen-only recording feel secondary.
- The editor lets users adjust zooms and style after recording while the preview remains the primary artifact.
- Output format and aspect ratio choices are treated as export presets, not raw encoder settings.
- The UI should make the next action obvious after every state: record, stop, review, retake, export, or open folder.

Implications for this app:

- Move away from the crowded MVP strip toward a stable shell: top command bar, central stage, bottom timeline, right inspector, and clear export/next-action area.
- Keep recording resilient: camera/audio failures degrade visibly but never hide the saved screen preview.
- Treat the preview as the product surface; controls explain and modify the current preview instead of competing with it.
- Build UI primitives once so camera, cursor, background, zoom, trim, and export controls do not each invent their own layout.

### Preview/export parity principle

Once the styled export pipeline is stable for cursor + zoom, the preview must mirror it deterministically — the user should see exactly what the export will produce. Earlier per-feature preview tasks (TASK-012 cursor preview, TASK-017 zoom preview) are superseded by a single TASK-025 "Unified preview that mirrors styled export" that lands after the export side is locked in. Sequencing: finish styled-export rendering (TASK-011 + TASK-016 + TASK-013), then build the unified preview (TASK-025), then auto-zoom UX (TASK-018, TASK-019). This avoids rebuilding a partial preview every time the export pipeline changes.

### Wayland-readiness principle

X11 is being deprecated and the Wayland pivot (TASK-026) is a bounded *swap-out* of the bottom capture layer plus the cursor-source modules — not a rewrite. To keep it bounded as the app matures, **design new features against cursor-data abstractions** rather than reaching into `metadata.cursorEvents` directly:

- Define `clicksAtFrame(project, frame)`, `cursorAtFrame(project, frame)`, etc. as the canonical access points.
- Implement them once; new features (click emphasis, auto-zoom, anything else cursor-derived) consume the abstractions only.
- When Wayland lands, the implementation behind these abstractions changes (compositor-rendered cursor in stream replaces telemetry); call sites stay untouched.

What survives the pivot regardless: project schema, zoom export math, canvas preview rendering, all UI panels, click-effect rendering, auto-zoom marker generation. What gets replaced: `recording-session.mjs` cursor sampling, `xdotool-cursor.mjs`, `buildCursorAss`. Small, isolated, well-tested modules.

### Delivery Lines

Drives the Watchpost flow view (`flow/index.html` parses this block via `parseDeliveryLines`). One sequential lane: tasks are worked top-to-bottom in declared order. Done/superseded tasks are skipped automatically. Tasks not listed stay in the unassigned backlog. Update this block whenever sprint priorities shift — it is the source of truth for "what should I work on next?"

Order follows the Direction section: finish in-flight presentation polish → recording-flow UX polish → long-tail / deferred.

1. **LINE A — Client tutorial recording sprint**:
Sequence: TASK-013, TASK-048, TASK-041, TASK-020, TASK-021, TASK-022, TASK-023, TASK-047, TASK-005, TASK-026

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
**Status:** DONE

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

### ~~TASK-012~~ Add cursor overlay preview rendering

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
**Status:** DONE

#### Context

Client demos benefit from visible clicks, but this should build on cursor telemetry rather than become a separate capture system. Capture also unlocks click-precise auto-zoom suggestions instead of teleport-only.

#### Acceptance Criteria

- Capture click timestamps and positions during recording.
- Render simple click emphasis in styled export.
- Keep click emphasis optional/data-driven when click telemetry is unavailable.

#### Completion Notes

- New `apps/desktop/src/main/recording/xinput-button-listener.mjs` (X11): spawns `xinput test-xi2 --root`, parses cooked `ButtonPress` (type 4) / `ButtonRelease` (type 5) blocks, maps X11 button numbers (1=left, 2=middle, 3=right; scrolls dropped) to schema `MouseButton` (0/1/2). Emits via callback. Graceful no-op when xinput is missing — logs once and recording continues with position-only events.
- `apps/desktop/src/main/recording/recording-session.mjs` wires the listener into start/stop, normalizes coords through the existing `normalizeCursorPoint`, computes wall-clock frame from `Date.now() - startedAt`.
- Auto-zoom now uses real `down`/`up` events instead of falling through to the teleport heuristic. `extractTriggerEvents` in `packages/timeline-engine/src/auto-zoom.ts` extended with `extractDragTriggers` — pairs each `down` with the matching `up`, emits a synthetic trigger at the drag midpoint when duration > 6 frames AND displacement > teleport threshold. Highlights and window-drags share input shape, so one detector covers both.
- xinput is X11-only; TASK-026 (Wayland pivot) will swap the listener with a portal/libinput equivalent. Encapsulated in one file for that swap.
- TASK-042 completed the remaining visual emphasis work: preview renders click rings from recorded `type: down` telemetry, styled export emits matching ASS click emphasis, and click-only telemetry still creates a subtitle layer so clicks render even when move samples are absent.

#### Testing

- Unit tests in `packages/timeline-engine/src/auto-zoom.test.ts` cover three drag scenarios: long click-and-drag produces marker shifted toward midpoint; short click does not double-emit; long-hold-without-movement does not emit a drag trigger.
- `recording-session.test.mjs` 7/7 pass with the new `buttonListenerFactory` injection point.

#### Verification

- `pnpm test` — all packages green.
- `pnpm smoke:mvp` / `smoke:ui` / `smoke:styled-export` — all pass.
- `apps/desktop/src/renderer/src/styled-preview.test.mjs` covers active click rings and canvas draw calls.
- `apps/desktop/src/main/export-service.test.mjs` covers ASS click emphasis generation without move telemetry.
- `pnpm --filter @rough-cut/desktop test` — 170/170 pass on 2026-05-08.
- `pnpm smoke:package-recording-flow` — pass on 2026-05-08 as part of the webcam PiP polish verification.

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

### ~~TASK-017~~ Add zoom preview playback approximation

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
**Status:** DONE

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
**Status:** DONE

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
**Status:** DONE

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
**Status:** DONE

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
**Status:** DONE

#### Context

Client demos often need narration. Microphone support should come after the core visual presentation path is stable.

#### Acceptance Criteria

- Detect available microphone input or document the selected input path.
- Record microphone audio with screen capture.
- Keep screen-only recording available.
- Save audio metadata in the project.

#### Completion Notes (foundation)

- Added PulseAudio microphone source enumeration via `pactl list sources short`, filtering monitor sources out of the mic picker.
- Added renderer controls for optional microphone capture: screen-only remains the default, and selected mic source is passed through renderer → preload → main → recording session.
- Threaded `micSource` into the existing FFmpeg PulseAudio input path and persisted audio metadata on the saved recording asset.
- Extended `smoke:mvp` with opt-in `ROUGH_CUT_SMOKE_MIC=1` audio verification that skips cleanly when no mic source exists and asserts an audio stream when one is recorded.

#### Testing

- Unit test FFmpeg audio argument construction.
- Service smoke can skip clearly when no microphone input is available.

#### Verification Notes

- `pnpm typecheck` — clean across 5 packages.
- `pnpm test` — project-model 91/91, effect-registry 57/57, timeline-engine 172/172, frame-resolver 20/20, desktop 109/109.
- `pnpm smoke:mvp` — default screen-only path still passes.
- `ROUGH_CUT_SMOKE_MIC=1 pnpm smoke:mvp` — recorded with `alsa_input.usb-Samson_Technologies_Samson_Q2U_Microphone-00.analog-stereo`, persisted mic metadata, and FFprobe found an audio stream in the MP4.
- `pnpm smoke:ui` and `pnpm smoke:styled-export` — pass.
- Manual app verification: mic recording works on the target Linux setup.

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

**Priority update (2026-05-04)**: this task was investigated as the fix for an intermittent captured-tear artifact in recordings. Empirically, **disabling NVIDIA "Allow Flipping" in `nvidia-settings`** fully eliminated the tear on the user's hardware (X11 + KDE Plasma + NVIDIA). The Wayland migration is therefore no longer urgent for capture-quality reasons. Remaining motivation: future-proofing against X11 deprecation. Treat as P1 long-term but not blocking current recording quality.

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
**Status:** DONE

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
- **Follow-up fix (during manual verification)**: cursor-follow was unreachable through the UI because `applySuggestionAsManual` was rewriting applied auto-suggestions to `kind: 'manual'`, and the engine only follows cursors on `kind: 'auto'` markers. Renamed to `applySuggestion` and now preserves `kind: 'auto'` so cursor-follow fires. The original dedup-on-re-suggest behavior is preserved by widening `filterAutoMarkersAgainstManual` → `filterAutoMarkersAgainstExisting` to consider all kinds, not just manual.
- **Follow-up fix (2026-05-06)**: cursor-follow zoom now follows the professional phase model. Ramp-in targets the marker/action focal instead of live cursor drift, hold keeps smoothing but applies final visible-window containment through `holdEnd - 1`, and zoom-out starts from the final contained hold focal before easing back toward center while ignoring later cursor movement.

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
- `pnpm test` — full workspace suite passes after the 2026-05-06 ramp-in/hold continuity fix.
- `node scripts/analyze-zoom-jumpcuts.mjs "/home/endlessblink/Documents/Rough Cut MVP/recordings/rough-cut-2026-05-06T04-42-01-002Z.roughcut"` — extracted all three zoom sections and reported no visual jump flags or transform discontinuity flags after the fix.
- `pnpm --filter @rough-cut/timeline-engine test` — 184/184 pass after the final hold-containment and zoom-out reveal fix.
- `pnpm --filter @rough-cut/timeline-engine build` — clean.
- `pnpm --filter @rough-cut/desktop test` — 160/160 pass, including export crop containment at the hold/zoom-out boundary.
- **Pending: manual packaged-app verification** — record while moving cursor across the screen, generate auto-zoom suggestions, apply one, watch the canvas preview during playback (focal should pan with cursor during auto-marker hold), export styled and confirm same behavior in the MP4. Manual zoom markers should stay statically centered on their focal.

### ~~TASK-028~~ Add aspect ratio presets for styled exports

**Priority:** P1  
**Status:** DONE

#### Context

Screen Studio, FocuSee, and Recordly all treat social aspect ratios as first-class export settings. Rough Cut's styled export was locked to a 1920×1080 canvas, making vertical or square client-demo outputs impossible without downstream transcoding.

#### Acceptance Criteria

- Project settings persist an aspect ratio preset with `auto` as the default.
- Styled preview offers the same preset choices used by export.
- Styled export outputs the selected canvas ratio while fitting source video safely inside it.
- Raw export remains unchanged.
- Cursor and video continue to share the same source-to-canvas transform; no clamping or independent cursor crop logic.

#### Completion Notes

- Added `ProjectSettings.aspectRatio` with presets: `auto`, `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, `4:5`.
- Added shared helpers in `packages/project-model/src/aspect-ratio.ts` to compute even styled canvas dimensions from the selected ratio and source dimensions.
- Bumped schema to v11 and added a v10→v11 migration that backfills `aspectRatio: 'auto'`.
- Styled export now computes its canvas dimensions from project settings before building the FFmpeg filter graph.
- Renderer preview now has an aspect ratio selector, persists changes, sizes the canvas to the selected ratio, and fits the source recording into that canvas using the same transform order as export.
- Manual app verification confirmed styled export completes successfully after changing the export flow default away from the source file name.

#### Verification

- `pnpm --filter @rough-cut/project-model test`
- `pnpm --filter @rough-cut/project-model build`
- `pnpm --filter @rough-cut/desktop test`
- `pnpm typecheck`
- `pnpm test`
- `pnpm smoke:styled-export`
- `pnpm smoke:ui`
- Manual app verification: open/create a recording, adjust aspect ratio/styled export flow, and confirm styled MP4 export completes.

### ~~TASK-029~~ Build editor shell and screen presentation controls

**Priority:** P1  
**Status:** DONE

#### Context

The one-page MVP UI stopped scaling once mic capture, aspect ratios, zoom controls, styled export, and screen presentation settings coexisted. Users also expected rounded screen/card styling and a camera area after seeing the styled canvas controls.

#### Acceptance Criteria

- Replace the stacked MVP page with a real editor shell: top recording bar, central preview stage, right inspector, lower zoom/review area.
- Move aspect ratio into the inspector rather than the export row.
- Add screen presentation controls for padding, corner radius, and shadow.
- Preview clips the screen recording to rounded corners and reflects padding/shadow controls.
- Styled export consumes the same presentation values for padding, corner radius, and shadow.
- Explicitly defer webcam PiP with a clear disabled/coming-next section.

#### Completion Notes

- Added a studio-style editor shell with top record/open controls, mic strip, centered preview stage, right-side inspector, and timeline/review dock.
- Added inspector controls for canvas aspect ratio, screen padding, corner radius, and shadow size/toggle.
- Reused existing `RecordingPresentation.background` fields for persistence; new recording defaults now start with padded rounded screen styling.
- Preview now draws the styled canvas background, screen shadow, rounded screen clip, zoomed source video, and cursor inside the same transform.
- Styled export now uses project presentation values instead of hardcoded 90% scale / 26px corner radius / fixed shadow.
- Camera/webcam remains intentionally deferred and labeled as coming next.
- Export flow now defaults to a distinct `-export.mp4` output name, rejects source-overwrite attempts early, and streams FFmpeg progress into the existing export status display.
- Cursor-follow zoom was stabilized with calmer default smoothing, a target deadband for tiny cursor jitter, and fixed zoom-in targeting.

#### Verification

- `pnpm typecheck`
- `pnpm --filter @rough-cut/project-model test`
- `pnpm --filter @rough-cut/desktop test`
- `pnpm smoke:ui`
- `pnpm smoke:styled-export`
- Manual app verification: export flow completes; preview/export controls are usable enough to move to regression hardening.

### ~~TASK-030~~ Add cursor-follow zoom regression fixtures

**Priority:** P1  
**Status:** DONE

#### Context

Cursor-follow zoom is sensitive to fast cursor movement, edge positions, zoom-out timing, and preview/export math drift. Recent fixes improved this with edge-snap focus and zoom-out freeze, but coverage is still mostly unit-level and synthetic.

#### Acceptance Criteria

- Add deterministic cursor telemetry fixtures that cover fast horizontal movement, fast diagonal movement, near-edge movement, pause/resume, and off-screen multi-monitor pass-through.
- Assert the cursor remains inside the zoomed viewport during hold phases when it is inside the source frame.
- Assert zoom-out freezes the focal point instead of chasing late cursor movement.
- Assert generated FFmpeg `sendcmd` crop windows stay finite, bounded, and free of sudden frame-to-frame jumps above an explicit threshold.
- Include at least one regression that fails with the old hard visibility-guard snapping behavior.

#### Completion Notes

- Added deterministic cursor-follow fixture coverage in `packages/timeline-engine/src/zoom-transform.test.ts` for fast horizontal movement, fast diagonal movement, near-edge movement, pause/resume, and off-screen multi-monitor coordinates.
- Added a viewport-containment helper so fixtures assert in-source cursor positions remain visible during hold phases once the camera has had time to follow.
- Kept the existing zoom-out freeze regression and added coverage that off-screen cursor coordinates produce finite, source-bounded focal points rather than clamping raw cursor positions.
- Added `apps/desktop/src/main/zoom-sendcmd.test.mjs` crop-window parsing and a regression fixture that asserts generated FFmpeg `sendcmd` windows remain finite, bounded by source dimensions, and smooth frame-to-frame under continuous cursor movement with pause/resume.

#### Verification

- `pnpm --filter @rough-cut/timeline-engine test` — 178/178 pass.
- `pnpm --filter @rough-cut/desktop test` — 117/117 pass.

### TASK-031 Add preview/export parity regression snapshots

**Priority:** P1  
**Status:** DONE

#### Context

The renderer preview and styled export both consume shared zoom math, but they still have separate drawing/export pipelines. Regressions can appear as cursor/zoom mismatch even when unit tests pass.

#### Acceptance Criteria

- Add a small deterministic project fixture with source dimensions, cursor telemetry, zoom markers, aspect ratio, and screen presentation values.
- Capture expected per-frame render descriptions from the shared resolver at representative frames: before zoom, ramp-in, hold, fast cursor pan, zoom-out, and after zoom.
- Assert renderer preview transform inputs and export crop/sendcmd generation use equivalent source-to-canvas geometry for those frames.
- Store snapshots as readable JSON, not binary screenshots, unless screenshot parity becomes necessary later.

#### Verification

- `pnpm --filter @rough-cut/frame-resolver test -- -u` — updated the preview render-description inline snapshot.
- `pnpm --filter @rough-cut/frame-resolver test` — 21/21 pass.
- `pnpm --filter @rough-cut/desktop test` — 118/118 pass.
- `pnpm typecheck` — pass.

### ~~TASK-032~~ Add packaged-app visual regression smoke

**Priority:** P2  
**Status:** DONE

#### Context

Editor shell, aspect ratio controls, screen padding/radius/shadow controls, and open-project behavior are user-visible and currently rely on manual packaged-app checks. A lightweight packaged visual smoke would catch broken UI wiring earlier.

#### Acceptance Criteria

- Extend packaged smoke coverage to launch the app, open a synthetic `.roughcut` project from the recordings directory, and capture a visual smoke screenshot.
- Exercise aspect ratio, screen padding, corner radius, and shadow controls through the packaged app path.
- Assert the open-project dialog defaults to the recordings/project directory where feasible, or add a test seam for that default path.
- Keep the smoke deterministic and headless-safe; do not require interactive desktop input in CI-style runs.

#### Verification

- `pnpm smoke:ui` — pass; opens a synthetic project, exercises presentation controls, exports raw, and captures `ui-smoke.png`.
- `pnpm smoke:package` — pass; builds the Linux package, verifies packaged module resolution, exercises the same controls, exports raw, and captures `ui-smoke.png`.

#### Completion Notes

- Extended the existing renderer smoke hook to drive aspect ratio, screen padding, corner radius, and shadow size controls, then report their final values.
- Added screenshot capture to UI/package smoke runs via `ROUGH_CUT_UI_SMOKE_SCREENSHOT_PATH`, with byte-size assertions so the visual artifact is actually written.
- Fixed the ad-hoc Linux package layout by installing workspace package entries for `@rough-cut/project-model` and `@rough-cut/timeline-engine`; the packaged app now resolves the same bare imports used by export and zoom code.

### ~~TASK-033~~ Define recording-flow solidity checklist

**Priority:** P1  
**Status:** DONE

#### Context

Before adding more Screen Studio-style features, define what "solid recording flow" means in observable terms. This prevents vague confidence claims and gives every later recording change a fixed acceptance gate.

#### Acceptance Criteria

- Document the canonical record -> stop -> remux -> save -> reopen -> preview -> export flow.
- Define pass/fail checks for video duration, fps, audio presence when enabled, cursor sync, click events, project metadata, and export validity.
- Split checks into automated, packaged-app manual, and environment/setup checks.
- Add known machine prerequisites, including X11, xdotool, FFmpeg/FFprobe, PulseAudio/PipeWire, and NVIDIA Allow Flipping guidance.

#### Verification

- Added `docs/recording-flow-solidity.md` as the recording-flow release-candidate gate.
- Reviewed the checklist against current smoke scripts and project setup notes.

#### Completion Notes

- Defined the canonical record -> stop -> remux -> save -> reopen -> preview -> export flow.
- Split solidity checks into environment, automated, artifact, manual packaged-app, failure triage, and final decision gates.
- Explicitly scoped out Wayland, system audio, capture target picker, pause/resume/cancel, trimming, and cut editing so they do not block judging the current Linux/X11 MVP flow.

### ~~TASK-034~~ Add real-recording regression harness

**Priority:** P1  
**Status:** DONE

#### Context

Current smoke coverage records short synthetic captures, but confidence in the real flow needs repeatable validation against actual desktop interaction: cursor motion, clicks, optional mic, preview, and styled export.

#### Acceptance Criteria

- Add a harness that records a fresh desktop session with scripted cursor/click activity where feasible.
- Verify the saved `.roughcut` contains usable video metadata, cursor move events, click events, and optional mic metadata.
- Reopen the project, render preview smoke state, export styled MP4, and FFprobe the output.
- Keep the harness safe to skip clearly when required system tools or audio devices are unavailable.

#### Verification

- `pnpm smoke:real-recording` — pass on the target Linux/X11 machine.
- Real recording produced 82 cursor events, including 76 move events and 6 button events from scripted cursor/click activity.
- The harness reopened the saved `.roughcut`, exported raw MP4, exported styled MP4, ran renderer smoke against the real project, and captured a UI screenshot.

#### Completion Notes

- Added `scripts/smoke-real-recording.mjs` and root command `pnpm smoke:real-recording`.
- The harness records a real X11 desktop slice, drives the cursor with `xdotool`, captures click/drag events through the existing `xinput` listener when available, then validates project metadata and exports.
- The renderer smoke path is enabled by default and can be skipped with `ROUGH_CUT_REAL_SMOKE_UI=0` for faster diagnosis.
- The command is opt-in and not part of normal `pnpm test`, because it moves the real cursor and depends on a live X11 desktop.

### ~~TASK-035~~ Add recording health diagnostics report

**Priority:** P1  
**Status:** DONE

#### Context

When recording issues happen, the app currently logs details but does not summarize capture health. A solid flow needs a clear report for dropped frames, fps drift, audio stream presence, remux success, cursor sample cadence, and FFmpeg warnings.

#### Acceptance Criteria

- Produce a structured diagnostics report after each recording.
- Include FFmpeg warnings, frame-drop indicators, measured duration, expected vs actual fps, audio stream status, cursor event counts, click event counts, and remux/export paths.
- Surface the report in logs and save it next to the recording for later inspection.
- Keep recording success independent from diagnostics generation failures.

#### Verification

- `pnpm --filter @rough-cut/desktop test` — 126/126 pass.
- `pnpm smoke:mvp` — pass; asserts diagnostics report is written and reports healthy video/cursor data.
- `pnpm smoke:real-recording` — pass; asserts diagnostics report is written for a real X11 recording with cursor/click activity.

#### Completion Notes

- Added `apps/desktop/src/main/recording-diagnostics.mjs` to write a `.diagnostics.json` sidecar next to each MP4.
- Diagnostics include recording paths, expected vs probed duration, video/audio stream status, cursor event counts, button event counts, remux warning lines, frame-drop markers, and queue-backpressure markers.
- `stopRecordingAndCreateProject` now captures remux logs and writes diagnostics after project save; diagnostics failures are logged but do not block a valid recording.
- `pnpm smoke:mvp` and `pnpm smoke:real-recording` now fail if the diagnostics report is missing or does not contain healthy video/cursor data.

### TASK-036 Add long-recording stability smoke

**Priority:** P1  
**Status:** DONE

#### Context

Short smokes catch wiring failures, but a client demo recorder must stay stable beyond a few seconds. Long-running capture is where audio drift, frame drops, cursor lag, and finalization problems usually appear.

#### Acceptance Criteria

- Add an opt-in long smoke that records for a configurable duration, defaulting to a practical local value.
- Probe the output for duration, fps, audio stream consistency when enabled, and successful MP4 remux/finalization.
- Reopen the resulting project and run styled export on it.
- Make the command opt-in so normal test runs stay fast.

#### Verification

- `pnpm test`
- Long smoke passes on the target machine for an agreed duration before calling recording flow solid.

#### Completion Notes

- Added `scripts/smoke-long-recording.mjs` and root command `pnpm smoke:long-recording`.
- The long smoke reuses the real X11 recording harness, defaults to 60 seconds, disables UI smoke by default, and keeps duration configurable with `ROUGH_CUT_LONG_SMOKE_DURATION_MS`.
- Added stricter diagnostics assertions to `scripts/smoke-real-recording.mjs` for minimum media duration, expected FPS, and optional audio stream presence via `ROUGH_CUT_REAL_SMOKE_EXPECT_AUDIO=1`.

### TASK-037 Add packaged recording acceptance runbook

**Priority:** P1  
**Status:** DONE

#### Context

Automated checks are necessary but not enough for user-visible capture quality. The packaged app needs a small, repeatable acceptance runbook that confirms the same flow a real user will perform.

#### Acceptance Criteria

- Add a documented packaged-app acceptance script for record, stop, preview, generate zoom suggestions, export raw, export styled, reopen, and inspect folder outputs.
- Include expected visual checks for cursor sync, click alignment, zoom behavior, mic audio, and export playback.
- Record environment details for each acceptance run.
- Mark remaining risks explicitly when a check is not automated.

#### Verification

- `pnpm smoke:package`
- Manual packaged-app acceptance run completed and documented.

#### Completion Notes

- Added `docs/packaged-recording-acceptance.md` with packaged-app preconditions, automated warm-up commands, manual record/stop/preview/export/reopen steps, visual checks, environment record fields, and failure handling guidance.
- Linked the runbook from `docs/recording-flow-solidity.md` so the solidity gate has a single manual packaged-app reference.
- The runbook records residual risks explicitly instead of treating automated smoke coverage as sufficient for user-visible capture quality.

### TASK-038 Add system audio capture controls

**Priority:** P1  
**Status:** DONE

#### Context

Screen Studio-style demos often need browser/app audio in addition to microphone narration. FFmpeg already has partial system-audio plumbing; the app needs source enumeration, UI, session wiring, metadata, and verification.

#### Acceptance Criteria

- Enumerate available monitor/system audio sources separately from microphones.
- Add UI controls to enable system audio and choose its source.
- Thread selected system audio into recording session capture.
- Persist audio metadata so reopened projects show what was captured.
- Keep screen-only and mic-only recording unchanged.

#### Verification

- Unit tests for audio source parsing and FFmpeg argument construction.
- Opt-in smoke verifies an audio stream exists when system audio is enabled.
- Manual packaged-app recording with system audio.

#### Completion Notes

- Added PulseAudio monitor-source enumeration via `listPulseAudioSystemAudioSources`, exposed through main/preload IPC and renderer controls.
- Recording start now accepts `systemAudioSource`, passes it into the existing FFmpeg PulseAudio monitor input path, and persists `audio.systemAudioSource` metadata on saved projects.
- System audio can be recorded alone or mixed with microphone audio through the existing FFmpeg `amix` path.
- Added opt-in smoke support with `ROUGH_CUT_SMOKE_SYSTEM_AUDIO=1 pnpm smoke:mvp`; the run records a monitor source, asserts persisted metadata, and verifies an audio stream exists.
- Added system-audio coverage for source filtering, FFmpeg args, recording session capture options, and mixed mic/system metadata.

#### Verification Notes

- `pnpm --filter @rough-cut/desktop typecheck` — pass.
- `pnpm --filter @rough-cut/desktop test` — 135/135 pass.
- `ROUGH_CUT_SMOKE_SYSTEM_AUDIO=1 pnpm smoke:mvp` — pass; recorded `alsa_output.usb-Samson_Technologies_Samson_Q2U_Microphone-00.analog-stereo.monitor`, persisted `audio.systemAudioSource`, and FFprobe found an audio stream.

### TASK-039 Add capture target picker

**Priority:** P1  
**Status:** DONE

#### Context

The current flow records the primary X11 display. Screen Studio users expect to choose screen, window, or region before recording.

#### Acceptance Criteria

- Add a capture-target selection model for display, window, and region.
- Start with full-display and region support if window capture is too platform-specific.
- Persist selected capture geometry in recording metadata.
- Keep cursor coordinates and export transforms aligned with the chosen source region.

#### Verification

- Unit tests for geometry normalization.
- Smoke test records a bounded region and verifies output dimensions.
- Manual packaged-app check on the target multi-monitor setup.

#### Completion Notes

- Added full-display vs region capture selection in the renderer recording strip.
- Added `captureRegion` support to recording start options; region coordinates are normalized relative to the selected display, converted to absolute X11 grab geometry, and passed to FFmpeg as the capture size/display offset.
- Persisted resolved display/capture metadata on saved recording assets so reopened projects retain the bounded-source geometry used at capture time.
- Added MVP smoke support with `ROUGH_CUT_SMOKE_REGION=1`; the smoke asserts project metadata and FFprobe output dimensions match the requested bounded region.
- Window capture remains intentionally deferred because X11/Wayland window capture behavior is platform-specific; this task ships full-display plus region support.

#### Verification Notes

- `pnpm --filter @rough-cut/desktop typecheck` — pass.
- `pnpm --filter @rough-cut/desktop test` — 139/139 pass.
- `ROUGH_CUT_SMOKE_REGION=1 ROUGH_CUT_SMOKE_REGION_WIDTH=240 ROUGH_CUT_SMOKE_REGION_HEIGHT=180 pnpm smoke:mvp` — pass; FFmpeg captured `240x180`, metadata persisted region details, and export succeeded.

### TASK-040 Add pause, resume, and cancel recording

**Priority:** P1  
**Status:** DONE

#### Context

The current recording flow supports start and stop. A Screen Studio-like flow needs safe cancellation for bad takes and pause/resume for demos with setup gaps.

#### Acceptance Criteria

- Add cancel during recording that stops capture and removes incomplete project outputs safely.
- Add pause/resume behavior or an explicit scoped alternative if FFmpeg pause is not viable.
- Preserve cursor/audio/video synchronization across the chosen behavior.
- Make interrupted sessions recoverable and avoid corrupt project files.

#### Verification

- Unit tests for session state transitions.
- Smoke test cancel leaves no misleading saved project.
- Manual packaged-app check for pause/resume or approved alternative.

#### Verification Notes

- `pnpm --filter @rough-cut/desktop typecheck` — pass.
- `pnpm --filter @rough-cut/desktop test` — 168/168 pass.
- `pnpm smoke:recording-flow-ui` — pass; save/review path still opens the post-recording workspace.
- `pnpm smoke:recording-flow-cancel` — pass; cancel returns to idle with no saved message, review workspace, or video.
- `pnpm smoke:package-recording-flow-cancel` — pass; packaged Linux app starts recording, cancels, returns idle, and does not preserve a review/output state.
- `pnpm smoke:package-recording-flow` — pass; packaged save/review path still persists camera-warning metadata and opens review.
- Pause/resume remains an explicit scoped alternative: segment pause is pending, and the user-visible safe behavior is cancel-and-discard for bad takes.

### TASK-041 Add post-recording next-action flow

**Priority:** P1  
**Status:** DONE

#### Context

After stop, users should not wonder what happened or where the file is. The app should guide them to preview, export, retake, or open the output folder.

#### Acceptance Criteria

- Show a clear post-recording success state.
- Offer primary actions: preview/edit, export styled, export raw, open folder, and retake.
- Reuse or complete TASK-022 folder opening and TASK-023 recent project foundations.
- Avoid hiding errors when remux/save/project creation fails.

#### Verification

- UI smoke verifies post-recording actions are visible after a saved project.
- Manual packaged-app flow from stop to exported file.

### TASK-042 Render click emphasis in preview and export

**Priority:** P1  
**Status:** DONE  
**Related:** TASK-013

#### Context

Click telemetry is already captured. The missing user-visible piece is a tasteful click emphasis effect that appears in both preview and styled export with parity.

#### Acceptance Criteria

- Render click rings or ripples in canvas preview using recorded click events.
- Render the same effect in styled export.
- Keep the effect optional and styleable later.
- Preserve preview/export parity and cursor sync.

#### Verification

- 2026-05-06: Added canvas preview click rings from recorded `type: down` telemetry and matching styled-export ASS click emphasis in the cursor subtitle layer. Click-only telemetry now still creates a subtitle layer, so click emphasis exports even when there are no move samples.
- `pnpm --filter @rough-cut/desktop typecheck`
- `node --test apps/desktop/src/renderer/src/styled-preview.test.mjs apps/desktop/src/main/export-service.test.mjs`
- `pnpm --filter @rough-cut/desktop test`
- `pnpm smoke:styled-export`
- Unit tests for click effect timing and frame selection.
- Styled export smoke includes synthetic click events and asserts export succeeds.
- Manual packaged-app recording with visible clicks.

### TASK-043 Add webcam PiP presentation controls

**Priority:** P1  
**Status:** DONE

#### Context

Camera capture and export paths have started, but the UI still treats webcam PiP as unfinished. Screen Studio-style demos need controllable camera placement and styling.

#### Acceptance Criteria

- Show camera preview/setup before recording when a camera is selected.
- Add PiP controls for position, size, shape, and roundness.
- Persist camera presentation settings in the project.
- Apply settings consistently in preview and styled export.

#### Verification

- 2026-05-06: Added main-editor Inspector controls for linked-camera projects: show/hide, position, shape, size, and roundness. Controls persist to `recordingAsset.presentation.camera`, which is already consumed by canvas preview and styled export.
- 2026-05-06: Extended `smoke:ui` assertions to exercise camera PiP controls on a synthetic linked-camera project, but the run is currently blocked by the separate pre-record instance changes forcing `mode=recorder` even for project-path UI smoke.
- 2026-05-07: Added a pre-record Camera PiP setup preview card that appears when a camera source is selected, explaining that the webcam is recorded as an editable separate track. Packaged recording-flow smoke now selects the simulated camera device and asserts the setup card appears before recording starts.
- 2026-05-07: `pnpm --filter @rough-cut/desktop typecheck` — pass.
- 2026-05-07: `pnpm --filter @rough-cut/desktop test` — 168/168 pass.
- 2026-05-07: `pnpm smoke:ui` — pass; exercises persisted camera position, shape, and size controls on a synthetic linked-camera project.
- 2026-05-07: `pnpm smoke:styled-export` — pass; includes synthetic linked-camera styled export.
- 2026-05-07: `pnpm smoke:package-recording-flow` — pass; packaged app shows the camera setup card, preserves screen recording when the simulated camera is busy, and surfaces the camera warning in review.
- 2026-05-07: Real webcam PiP manual verification is blocked on this machine because `/dev/video*` devices are unavailable; the packaged gate uses `ROUGH_CUT_SMOKE_CAMERA_DEVICE_PATH=/dev/video9999` to verify the selected-camera setup and degraded screen-only path.
- 2026-05-08: Replaced the static setup thumbnail with a real `getUserMedia` webcam preview in the pre-record Camera PiP card, added Electron media permission handling, and close the setup panel before starting capture so the preview stream releases the webcam before FFmpeg opens it.
- 2026-05-08: Re-verified `pnpm --filter @rough-cut/desktop typecheck`, `pnpm --filter @rough-cut/desktop test`, and `pnpm smoke:package-recording-flow` — pass.
- 2026-05-08: Pre-record mic, system audio, and camera selections now persist in local storage and are restored when the saved device is still available. Dropdown labels are shortened, metadata-only V4L2 camera nodes are filtered out, and the Camera PiP setup copy is reduced to concise preview/editability text.
- 2026-05-08: Re-verified `pnpm --filter @rough-cut/desktop typecheck` and `pnpm smoke:package-recording-flow` — pass.
- Unit tests for camera frame geometry.
- UI smoke verifies controls exist when camera metadata is present.
- Manual packaged-app recording with webcam PiP.

### TASK-044 Add cursor style controls

**Priority:** P2  
**Status:** DONE

#### Context

The cursor overlay works, but Screen Studio users expect presentation controls such as cursor size, outline/shadow, and click style.

#### Acceptance Criteria

- Add cursor presentation settings to the project model.
- Add UI controls for cursor size and basic visual style.
- Apply settings in preview and styled export.
- Preserve defaults for old projects.

#### Verification

- Project migration/schema tests.
- Preview/export smoke with non-default cursor settings.

### TASK-045 Add background style presets

**Priority:** P2  
**Status:** DONE

#### Context

Current background controls are numeric. Presets make polished outputs faster and closer to Screen Studio's one-click style flow.

#### Acceptance Criteria

- Add named background presets for common demo looks.
- Let users apply a preset without losing the ability to tune padding, radius, and shadow.
- Persist the resulting presentation values in the existing project format where possible.
- Keep preview and export visually aligned.

#### Verification

- 2026-05-06: Added reusable dark background presets, wired the Background board swatches to persist full presentation styles, and made preview/export use the preset colors instead of a hardcoded light gradient.
- Unit tests for preset-to-style conversion.
- UI smoke applies a preset and exports styled output.

### TASK-046 Add trim start and end controls

**Priority:** P1  
**Status:** DONE

#### Context

Most demo recordings need at least head/tail cleanup. This should land before a broader timeline editor.

#### Acceptance Criteria

- Add start and end trim values to the project/timeline model.
- Add simple UI controls to set trim start/end from playback time.
- Apply trims in preview, raw export where feasible, and styled export.
- Keep original source recording untouched.

#### Verification

- 2026-05-08: Existing implementation verified as complete. The editor exposes start/end trim controls in the Recording inspector, draggable timeline trim handles, hidden start/end restore actions, preview playback bounded to the visible range, raw trim export support, styled trim export support, and linked-camera trim alignment.
- `apps/desktop/src/renderer/src/timeline-rail.test.mjs` covers lane placement relative to trimmed clips.
- `apps/desktop/src/main/export-service.test.mjs` covers raw/styled trim export behavior and export eligibility.
- `apps/desktop/src/main/project-files.test.mjs` covers persisted head/tail trim metadata from primary clips.
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm --filter @rough-cut/desktop test`
- `pnpm smoke:ui`

### TASK-047 Add simple cut removal flow

**Priority:** P2  
**Status:** DONE

#### Context

After head/tail trim, the next editing primitive is removing a dead section from the middle without building a full timeline editor.

#### Acceptance Criteria

- Add a minimal cut-range data model.
- Add UI to mark a range and remove it from playback/export.
- Apply cuts in preview and styled export.
- Keep cut operations non-destructive and reversible at the project level.

#### Verification

- 2026-05-08: Added non-destructive recording `cutRanges` to the project model, schema validation, renderer helpers, Recording inspector controls to mark/remove/clear middle cuts, preview playback that skips removed ranges, and styled-export video/camera cut filtering. Raw export is intentionally disabled for cut projects so it cannot silently copy the uncut source.
- `apps/desktop/src/renderer/src/cut-ranges.test.mjs` covers cut creation, restore, visible duration, and source-frame mapping.
- `apps/desktop/src/main/export-service.test.mjs` covers styled export filter args for removed middle ranges.
- `apps/desktop/src/main/project-files.test.mjs` covers persisted cut ranges and visible duration.
- `pnpm --filter @rough-cut/project-model test`
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm --filter @rough-cut/desktop test`
- `pnpm smoke:ui`

### TASK-048 Add optional webcam PiP recording and export

**Priority:** P1  
**Status:** DONE

#### Context

The project model and frame resolver already support linked camera assets and camera PiP presentation metadata, but the desktop app did not capture webcam media, link it into saved recordings, draw it in preview, or include it in styled exports.

#### Acceptance Criteria

- Enumerate Linux V4L2 camera devices and expose them in the recording strip.
- Capture the selected webcam alongside screen recording as a separate media file.
- Remux and validate camera media on stop, then link it via `cameraAssetId`.
- Draw camera PiP in the styled preview using existing camera presentation defaults.
- Include camera PiP in styled exports for unedited linked-camera projects.
- Preserve screen-only recording as the default path when no camera is selected.

#### Verification

- `pnpm --filter @rough-cut/desktop test` — 171/171 pass.
- `pnpm --filter @rough-cut/desktop typecheck` — pass.
- `pnpm smoke:package-recording-flow` — pass.
- `ROUGH_CUT_REAL_SMOKE_CAMERA_DEVICE_PATH=/dev/video0 ROUGH_CUT_REAL_SMOKE_DURATION_MS=2500 ROUGH_CUT_REAL_SMOKE_UI=0 pnpm smoke:real-recording` — pass on 2026-05-08; verified real screen+webcam capture, linked camera asset metadata, saved project reopen, and styled export.

#### Implementation Notes

- Added V4L2 camera source enumeration and optional Camera recording controls.
- Added a separate FFmpeg V4L2 capture process that writes camera video alongside the screen recording.
- Saved camera recordings as linked `video` assets with `metadata.isCamera = true` and `recording.cameraAssetId`.
- Preview now loads the linked camera media and draws it as a rounded PiP over the styled canvas.
- Styled export now accepts unedited linked-camera projects, adds the camera as a second FFmpeg input, rounds it, and overlays it on the final canvas.
- Real camera recordings include camera preroll offset metadata; styled export eligibility now accepts full-length camera clips aligned by `metadata.sourceInFrames`.

### TASK-049 Build Screen Studio-style editor UI foundation

**Priority:** P1  
**Status:** IN PROGRESS

#### Context

The current UI grew from MVP controls: one top strip, one preview panel, and a dense inspector. It is now limiting product development because recording setup, post-recording review, timeline edits, presentation styling, exports, camera PiP, cursor effects, and future cuts all compete for the same space. Before adding more controls, the app needs a Screen Studio-like foundation that separates capture, review, timeline, and styling workflows.

#### Acceptance Criteria

- Replace the MVP shell with a durable editor layout: capture bar, central stage, timeline/review rail, right inspector, and export/actions area.
- Keep record/stop/open/export flows available during the migration.
- Make primary state obvious: idle, starting, recording, stopping, saved, error, camera degraded.
- Avoid hiding preview when a secondary feature like camera capture fails.
- Preserve responsive behavior for laptop-sized screens.

#### Breakdown

- Inventory current renderer state and split it into stable layout regions: app shell, capture command area, stage, bottom rail, inspector, and status/toast area.
- Build the shell skeleton first with existing controls moved into their future regions, without changing recording/export behavior.
- Promote the styled preview canvas to the central stage and keep it visible for saved/degraded projects.
- Add a state banner model for idle, starting, recording, stopping, saved, camera degraded, audio degraded, and fatal error.
- Move export/open-folder/retake-style actions into a consistent actions area instead of leaving them scattered in panels.
- Add responsive rules for narrower laptop windows: inspector can stack/collapse, stage remains primary, and recording controls remain reachable.
- Keep visual language close to Screen Studio/Recordly: calm dark shell, large preview, compact controls, readable labels, and opinionated defaults.
- Defer new editing features; this task is layout migration and state clarity only.

#### Verification

- 2026-05-05: Implemented dark Recordly-informed editor shell with capture bar, left tool rail, central styled preview, visual timeline rail, export-only right sidebar, state banner, and sidebar-owned background/timeline/inspector boards. Verified with `pnpm --filter @rough-cut/desktop typecheck`, `pnpm smoke:ui`, and earlier `pnpm smoke:recording-flow-ui`.
- UI smoke covers idle, recording, stopping, saved preview, and error/degraded states.
- Manual packaged-app check records, stops, previews, and exports from the new shell.
- `pnpm --filter @rough-cut/desktop test`
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm smoke:recording-flow-ui`
- `pnpm smoke:recording-flow-double-stop`

### TASK-050 Add Screen Studio-style pre-record panel

**Priority:** P1  
**Status:** EXTERNAL

**Ownership:** Pre-record work is being developed in another instance. Do not pick up or modify this task from the main-app session unless explicitly reassigned.

#### Context

Recording options are currently inline and crowded. Screen Studio and Recordly both separate pre-record setup from the editor: a focused surface appears before capture starts, lets the user choose what to record, checks inputs, and then transitions into the compact in-recording HUD. Rough Cut needs the same product shape before adding more capture options.

#### Acceptance Criteria

- Add a recording setup modal/panel launched from the capture bar before recording starts.
- Group the first version around the capture decision, input summary, countdown, and primary Record action.
- Show source availability and clear degraded states, e.g. camera busy or no system audio source.
- Keep screen-only recording as the safe default.
- Persist recent source choices where appropriate.
- Start recording from the setup surface without blocking the editor shell.

#### Breakdown

- Create a setup entry point from the capture bar: `New recording` opens the setup surface, while quick record can reuse the last valid setup later.
- Model the setup surface after Screen Studio's new recording modal and Recordly's launch HUD: compact, modal/floating, and focused on starting a capture rather than editing presentation.
- Show the currently selected capture target summary, audio summary, camera summary, countdown value, and save destination.
- Keep deeper target picking, audio/camera preflight detail, and smoke hardening split into TASK-054 through TASK-056 so this foundation stays small.
- Add preflight copy for countdown, save destination, and expected degraded behavior before pressing Record.
- Persist safe recent choices only when the selected source still exists; missing devices should fall back to screen-only/no-camera.
- Keep the setup surface non-blocking: cancel returns to editor, start transitions to recording state, failures return with inline diagnostics.
- Avoid advanced camera PiP styling here; the setup surface chooses inputs, not presentation layout.

#### Verification

- 2026-05-05: Added first pre-record panel foundation. Top Record now opens a modal setup surface with capture/audio/camera summaries, target selection, input toggles/selectors, cancel, and Start recording. The existing capture internals are unchanged; Start recording calls the same `startRecording` IPC path. Updated recording-flow UI smoke to start through `[data-ui-region="pre-record-panel"]` and `[data-recording-start="pre-record"]`.
- `pnpm --filter @rough-cut/desktop typecheck` — pass.
- `pnpm --filter @rough-cut/desktop test` — 151/151 pass.
- `pnpm smoke:recording-flow-ui` — pass; report includes `hasPreRecordPanel: true` and saved recording state.
- 2026-05-06: Pivoted the pre-record surface to the standalone compact launcher window. App launch now starts in recorder mode, `Open editor` activates the full editor window, `Start recording` transitions to a compact active-recording HUD, and stopping opens the saved project in editor mode after the saved state renders.
- 2026-05-06: Removed the oversized capture cards from the launcher in favor of a compact capture dropdown row, matching the smaller Screen Studio/Recordly-style direction.
- 2026-05-06: Verification pass: `pnpm --filter @rough-cut/desktop typecheck`, `pnpm --filter @rough-cut/desktop test`, and `pnpm smoke:recording-flow-ui` all pass.
- 2026-05-06: For Linux/X11 `x11grab`, normal visible Electron controls are captured as pixels. Updated recorder mode to hide the launcher before starting FFmpeg, wait briefly for the compositor/X server to repaint, and expose recording status/control through tray menu plus global shortcuts instead of a captured floating HUD.
- 2026-05-06: Current controls: Stop recording via tray or `CommandOrControl+Shift+R`; Restart recording via tray or `CommandOrControl+Shift+N`. True pause/resume remains pending because it should be implemented as segment-based recording/stitching, not by freezing the FFmpeg process.
- Pending manual packaged-app verification before marking DONE.
- UI smoke verifies setup controls, disabled/unavailable messaging, and successful start.
- Manual check with camera unavailable confirms screen-only fallback is visible and usable.
- `pnpm --filter @rough-cut/desktop test`
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm smoke:recording-flow-ui`

### TASK-054 Add thumbnail source picker for recording targets

**Priority:** P1  
**Status:** EXTERNAL

**Ownership:** Pre-record/source-picker work is being developed in another instance. Do not pick up or modify this task from the main-app session unless explicitly reassigned.

#### Context

Screen Studio exposes entire display, window, and area choices from the pre-record flow. Recordly's source picker shows screen/window tabs with thumbnail cards, selected-state checkmarks, and a confirm action. Rough Cut already has capture target support; the missing piece is a polished source picker inside the new pre-record panel.

#### Acceptance Criteria

- Show capture target choices inside the pre-record panel: full display, region, and window when supported.
- Present screen/window targets with readable names and thumbnails/previews where available.
- Preserve the existing Linux-safe full-display and region paths.
- Make unsupported target modes visibly disabled instead of silently hidden.
- Persist the last valid target selection only when the target still exists.

#### Verification

- 2026-05-05: Started by making the pre-record panel the default first screen on app launch. Added visible capture target cards for Full display, Region, and disabled Window support. Added an explicit `Open editor` secondary action so users can skip recording and go to the editor, while `Start recording` keeps the record -> edit flow. Updated recording-flow smoke to assert the pre-record panel, editor shortcut, and selected capture card exist before starting capture.
- 2026-05-06: User feedback rejected the big target-card treatment for the standalone launcher. Replaced target cards with a compact `Capture` dropdown that supports Full display and Region; smoke now toggles the dropdown to region and back before recording.
- Unit tests for target option normalization and stale selection fallback.
- UI smoke selects full display and region targets through the pre-record panel.
- `pnpm --filter @rough-cut/desktop test`
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm smoke:recording-flow-ui`

### TASK-055 Add audio and camera preflight controls

**Priority:** P1  
**Status:** EXTERNAL

**Ownership:** Pre-record audio/camera preflight work is being developed in another instance. Do not pick up or modify this task from the main-app session unless explicitly reassigned.

#### Context

Screen Studio's pre-record flow lets users choose webcam, microphone, and system audio before recording; microphone includes visible input activity, and camera selection shows a preview. Recordly has the same pattern in its launch HUD with microphone level rows, system audio toggle, webcam device list, and a small live preview.

#### Acceptance Criteria

- Add microphone selection to the pre-record panel with an input level indicator.
- Add system audio selection/toggle with unavailable-source messaging.
- Add camera selection with a live preview when a camera is selected.
- Keep `No microphone`, `No system audio`, and `No camera` as safe explicit choices.
- Start screen-only recording successfully even when camera/audio permissions fail.

#### Verification

- Unit tests for input availability/degraded-state mapping.
- UI smoke covers no-camera/no-system-audio fallbacks and mic-enabled state.
- Manual packaged-app check with camera unavailable and with microphone selected.
- `pnpm --filter @rough-cut/desktop test`
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm smoke:recording-flow-ui`

### TASK-056 Add pre-record smoke and packaged checks

**Priority:** P1  
**Status:** EXTERNAL

**Ownership:** Pre-record smoke/packaged checks are being developed in another instance. Do not pick up or modify this task from the main-app session unless explicitly reassigned.

#### Context

The pre-record panel becomes the front door for every capture. It needs direct regression coverage so future editor or recording changes do not strand users before recording starts.

#### Acceptance Criteria

- Add UI smoke coverage for opening/canceling the pre-record panel.
- Smoke verifies target, audio, camera, countdown, and Record action visibility.
- Smoke starts a recording from the pre-record panel and reaches saved review/editor state.
- Packaged smoke exercises the pre-record panel path, not only legacy quick record.
- Manual packaged-app runbook includes the new pre-record path.

#### Verification

- 2026-05-06: Updated `pnpm smoke:recording-flow-ui` to cover the standalone pre-record launcher, compact capture dropdown, region-control reveal, start recording, stop recording, and saved state. Added a spawn timeout so Electron smoke hangs fail with artifacts instead of stalling the whole command.
- 2026-05-06: Current verification pass: `pnpm --filter @rough-cut/desktop typecheck`, `pnpm --filter @rough-cut/desktop test`, and `pnpm smoke:recording-flow-ui` all pass. Packaged smoke/manual packaged run remain pending.
- `pnpm --filter @rough-cut/desktop test`
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm smoke:recording-flow-ui`
- `pnpm smoke:package`
- Manual packaged-app record from the pre-record panel.

### TASK-057 Add timeline interaction visual regression suite

**Priority:** P1  
**Status:** DONE

#### Context

Timeline trim/scrub bugs showed up as UI movement, tool switching, wheel-driven state changes, and canvas flicker. These are user-visible interaction regressions that unit tests and static screenshots do not catch reliably.

#### Acceptance Criteria

- Add a dedicated Playwright interaction regression script for timeline scrub, trim start/end drag, wheel scrolling, focus stability, and active tool stability.
- Assert the left tool/panel does not switch while stretching trim handles.
- Assert wheel scrolling does not change the timeline scrubber or focused range inputs.
- Assert playhead, ruler, and lanes share one coordinate space after trims.
- Keep frame-by-frame canvas monitoring for every drag interaction and fail on blank/gray frames.

#### Verification

- 2026-05-08: Verified existing `scripts/visual-timeline-interactions-playwright.mjs` covers timeline scrub, trim start/end drag, wheel stability, active-tool stability, coordinate alignment, hidden-trim restore, and per-frame canvas RAF monitoring that fails on gray/blank frames. `scripts/visual-scrub-playwright.mjs` provides the focused scrub/trim visual regression gate.
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm visual:scrub`
- `pnpm visual:timeline`

### TASK-058 Add non-destructive edit recovery affordances

**Priority:** P2  
**Status:** DONE

#### Context

Trim and future cut actions should never feel like they delete source media. Users need clear recovery affordances when hidden ranges still exist but are not currently exported.

#### Acceptance Criteria

- Show hidden head/tail source ranges as recoverable context instead of making media feel deleted.
- Let users restore full source or expand trims back from the timeline without switching tools.
- Keep raw/styled export scoped to the visible edit range while preserving original media and project clip source ranges.
- Add copy that explains trims are non-destructive.

#### Verification

- 2026-05-08: Added compact non-destructive edit copy in the Recording inspector and timeline-level Restore cut affordances for hidden middle ranges, alongside the existing hidden head/tail restore controls.
- `node --test apps/desktop/src/renderer/src/cut-ranges.test.mjs apps/desktop/src/renderer/src/timeline-rail.test.mjs`
- `pnpm --filter @rough-cut/desktop typecheck`

### TASK-059 Add preflight checklist and session-risk warnings

**Priority:** P1
**Status:** DONE

#### Context

Long client tutorials fail expensively when a missing tool, wrong session type, unavailable optional source, or low disk space is discovered after recording starts. The pre-record launcher now needs a visible readiness surface before capture begins.

#### Acceptance Criteria

- Show session status, capture target, save destination/disk budget, FFmpeg/FFprobe availability, xdotool/xinput availability, selected mic, selected system audio source, camera state, resolution, and FPS before recording.
- Warn clearly when disk space is below 30-minute or 60-minute recording budgets.
- Keep screen-only recording as the safe default when optional mic, system audio, or camera sources are off or unavailable.
- Do not block recording for optional degraded states, but make the risk visible.
- Make preflight status available from the pre-record launcher without adding a captured HUD to the X11 recording.

#### Implementation Notes

- Added main-process preflight classification in `apps/desktop/src/main/recording/preflight.mjs`.
- Added `recording:get-preflight-status` IPC exposure and renderer preflight summary UI.
- Enlarged the recorder launcher window so the preflight surface is visible before capture.
- Added smoke assertions for the preflight panel in `scripts/smoke-recording-flow-ui.mjs`.

#### Verification

- `pnpm --filter @rough-cut/desktop test`
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm smoke:recording-flow-ui`

### TASK-060 Debug long-smoke post-save failure

**Priority:** P1
**Status:** DONE

#### Context

The 10-minute long-recording smoke produced a readable saved recording, diagnostics status `ok`, expected duration, near-30 FPS, cursor telemetry, and zero drop/queue warnings, but the wrapper still exited with `ELIFECYCLE` immediately after `recording:stop` returned the saved recording. This needs a dedicated follow-up so the long gate distinguishes capture safety failures from post-save export or harness failures.

Resolved by adding phase-specific smoke logging/artifact reporting and making styled export explicit for the long-recording gate. The default long gate now validates capture/save/reopen/raw export without blocking on long styled exports; set `ROUGH_CUT_LONG_SMOKE_STYLED_EXPORT=1` to include styled export coverage.

Re-verified with `ROUGH_CUT_LONG_SMOKE_DURATION_MS=600000 pnpm smoke:long-recording`: passed with `mediaDurationMs=600033`, near-30 FPS, cursor telemetry, readable saved recording, diagnostics, project reopen, and raw export.

#### Acceptance Criteria

- Reproduce the failure with the existing 10-minute long-smoke artifact path or a shorter targeted variant.
- Identify whether the failure occurs during raw export, styled export, UI smoke handoff, process teardown, or package-script timeout/exit handling.
- Log the failing phase explicitly in `scripts/smoke-real-recording.mjs` or the long-smoke wrapper.
- Preserve the current capture-safety assertions: diagnostics `ok`, duration budget, FPS budget, cursor telemetry, and drop/queue warnings.
- Ensure post-save/export failure reporting includes artifact paths for the recording, project, diagnostics, raw export, and styled export when available.
- Re-run the 10-minute long smoke after the fix and document the result.

#### Verification

- Targeted unit or script-level test for phase-specific failure reporting where practical.
- `pnpm --filter @rough-cut/desktop test`
- `pnpm --filter @rough-cut/desktop typecheck`
- `ROUGH_CUT_LONG_SMOKE_DURATION_MS=600000 pnpm smoke:long-recording`
- `pnpm visual:timeline`
- `pnpm visual:scrub`

### ~~TASK-051~~ Add post-recording review workspace

**Priority:** P1  
**Status:** DONE

#### Context

After stop, the user should land in a clear review state rather than hunting for a preview. The workspace should answer: did it save, what failed, what can I do next, and how do I export or retake?

#### Acceptance Criteria

- After stop, show a review state with preview, save path, warnings, and primary next actions.
- Include actions for export styled, export raw, retake, open folder, and inspect diagnostics.
- Keep camera/audio degradation visible without blocking screen preview.
- Prevent duplicate stop/save state overwrites.

#### Breakdown

- Define a saved-recording review state that is separate from idle and recording states.
- On stop success, route to review with central preview loaded, project title/path visible, and saved status confirmed.
- Show warnings as non-blocking cards: camera failed, mic missing, system audio unavailable, export diagnostics, or partial save.
- Add primary actions: Export styled, Export raw, Open folder, Retake, Save project, and View diagnostics.
- Add retake safety copy so users do not accidentally lose the saved recording.
- Keep duplicate stop protection visible: once Stop is pressed, show `Stopping...` and lock recording actions until the saved result returns.
- Preserve preview even if camera/audio finalization fails; screen asset remains the anchor of review.
- Make review workspace reusable for opened projects, not only freshly recorded projects.

#### Verification

- UI smoke covers Record -> double Stop -> saved review workspace -> preview canvas.
- Manual check confirms warnings and next actions are visible after camera-busy recording.
- `pnpm --filter @rough-cut/desktop test`
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm smoke:recording-flow-ui`
- `pnpm smoke:ui`
- `pnpm visual:export`
- `ROUGH_CUT_LONG_SMOKE_DURATION_MS=600000 pnpm smoke:long-recording`
- `pnpm smoke:package`
- `pnpm smoke:recording-flow-double-stop`
- `pnpm smoke:package-recording-flow`

**Completed (2026-05-07):** Post-recording review is now the single next-action workspace for export styled, export raw, folder, diagnostics, project, and retake actions; the duplicate lower Export MP4 CTA was removed and the inspector now reports export status/details only. Camera failure warnings are persisted into the saved project and shown again after reopening the packaged app. Automated coverage now includes the regular recording-flow UI smoke, packaged fixture smoke, and a packaged pre-record -> camera warning -> stop -> save -> review smoke.

### TASK-052 Add timeline-first playback and edit rail

**Priority:** P1  
**Status:** DONE

#### Context

Zoom markers, trims, cuts, clicks, and camera/audio tracks need a timeline surface. The current preview controls are too small and disconnected from upcoming edit operations.

#### Acceptance Criteria

- Add a bottom timeline rail with playhead, time ruler, source duration, and track lanes.
- Show zoom markers, future trim handles, camera presence, and click events in the rail.
- Keep playback state synchronized with the central preview.
- Make the rail extensible for trim/cut tasks without another layout rewrite.

#### Breakdown

- Extract playback time state so the stage and timeline share one source of truth.
- Add time-to-pixel and pixel-to-time helpers with deterministic tests.
- Render a bottom rail with ruler ticks, current playhead, duration, and a draggable/scrubbable track area.
- Add lanes for screen video, zoom markers, click events, camera presence, and future trim/cut regions.
- Show existing manual/auto zoom markers as timeline regions with start/end positions and selected/hover states.
- Show click telemetry as small event markers, but keep click editing out of scope.
- Show camera/audio tracks as presence lanes first; full PiP/audio editing is out of scope.
- Wire timeline scrubbing to the central styled preview without disrupting existing play/pause controls.
- Leave trim/cut mutation for TASK-046/TASK-047; this task creates the rail and read-only marker visualization.

#### Verification

- 2026-05-05: Added renderer timeline model helpers, deterministic timeline unit coverage, shared preview/timeline scrub state, visible playhead/ruler/duration, screen/zoom/click/camera/audio lanes, non-mutating trim handles, and metadata-backed UI smoke coverage. Fixed scrub flicker by keeping the default background object stable so drag re-renders do not restart and clear the preview canvas render loop. Verified with `pnpm --filter @rough-cut/desktop typecheck`, `node --test apps/desktop/src/renderer/src/timeline-rail.test.mjs`, `pnpm --filter @rough-cut/desktop test`, `pnpm smoke:ui`, and `pnpm visual:scrub`.
- Unit tests for time-to-pixel mapping and marker placement.
- UI smoke loads a project with zoom/click/camera metadata and verifies timeline elements render.
- `pnpm --filter @rough-cut/desktop test`
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm smoke:ui`
- `pnpm visual:scrub`

### TASK-053 Add extensible properties inspector system

**Priority:** P1  
**Status:** DONE

#### Context

The right inspector is already mixing canvas, export, zoom, background, camera, and future cursor controls. It needs a real section/component system before adding cursor styling, camera PiP controls, background presets, and trim/cut settings.

#### Acceptance Criteria

- Create reusable inspector section/components for fields, sliders, presets, toggles, and action rows.
- Group controls by selected context: canvas, recording, cursor, camera, zoom marker, export.
- Support disabled/degraded states with clear copy.
- Keep project persistence explicit and recoverable when saves fail.

#### Breakdown

- Define inspector primitives: section, field row, segmented control, slider, select, toggle, preset grid, warning row, and action row.
- Move existing canvas/export/zoom controls into the primitives without changing their behavior.
- Add context groups: Canvas, Export, Recording, Zoom, Cursor, Camera, and Diagnostics.
- Add selection plumbing so clicking a timeline zoom marker can focus the Zoom inspector group later.
- Add disabled/degraded copy patterns for unavailable camera, missing telemetry, no audio stream, and unsupported export mode.
- Make save behavior explicit: pending, saved, failed, retry available, and no hidden project mutations on failed save.
- Keep inspector narrow and scannable: labels, current values, and short helper copy; avoid long paragraphs.
- Defer new controls like cursor style sliders or background preset grids to TASK-044/TASK-045 after the inspector system exists.

#### Verification

- 2026-05-05: Added reusable inspector primitives for sections, selects, sliders, toggles, preset grids, action rows, notices, and selected-context summaries. Moved existing canvas/screen/background/export controls onto the primitives without changing persistence behavior. Added timeline selection plumbing so screen, zoom, click, camera, and audio regions can focus a future inspector context. UI smoke now asserts inspector groups and zoom context focus. Verified with `pnpm --filter @rough-cut/desktop typecheck`, `pnpm --filter @rough-cut/desktop test`, `pnpm smoke:ui`, and `pnpm visual:scrub`.
- Component/unit coverage for inspector state and value normalization.
- UI smoke changes one canvas setting and one presentation setting, saves, and keeps preview/export available.
- `pnpm --filter @rough-cut/desktop test`
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm smoke:ui`

### TASK-061 Fix choppy camera playback via canvas frame dedup

**Priority:** P1  
**Status:** DONE

#### Context

The canvas RAF loop ran at 60fps on a 30fps source, drawing each video frame twice. Each redundant draw included an expensive `ctx.shadowBlur` pass and a 1920×1080 `drawImage` call, competing with the video decoder and causing dropped frames and choppy playback.

#### Fix

Added frame deduplication in the `tick()` function (`apps/desktop/src/renderer/src/main.tsx`). Before drawing, compute `currentFrame = Math.round(video.currentTime * fps)` and skip the draw if it matches `lastDrawnFrame`. This halves canvas work for 30fps sources without changing draw quality or requiring `requestVideoFrameCallback`.

Also added `window.__roughCutCanvasDrawCount` instrumentation to the smoke test to measure real canvas render rate during playback.

#### Verification

- 2026-05-07: Smoke test measured `canvasRenderFps: 33` (≈30fps native rate) confirming frame dedup eliminates double-draws. All 167 unit tests pass. `pnpm smoke:ui` passes.
- `pnpm --filter @rough-cut/desktop test`
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm smoke:ui`

### TASK-062 Add real window and region selection UI

**Priority:** P2  
**Status:** DONE

#### Context

The current capture target control is still a basic full-display/region dropdown. Users need an actual source-picking experience for display, window, and region capture instead of manually trusting a rough selector.

#### Acceptance Criteria

- Add a proper pre-record source picker UI for display, window, and region selection.
- Let users choose a capture region visually, with clear bounds before recording starts.
- Show available windows with readable names and selected-state feedback when platform support is available.
- Preserve the existing safe full-display path and disable unsupported modes with clear copy.
- Keep cursor telemetry, recording metadata, preview, and export transforms aligned with the selected window or region.

#### Verification

- 2026-05-08: Added pre-record source picker cards for full display, region, and disabled window capture; added an in-panel visual region picker with clear bounds, cancel/apply actions, and safe presets. Window capture remains visibly disabled pending platform-specific capture support.
- UI smoke covers selecting full display and opening/canceling the region picker.
- Add automated coverage for region geometry normalization and persisted metadata.
- Manual packaged-app verification records a selected region and, when supported, a selected window.
- `pnpm --filter @rough-cut/desktop typecheck`
- `pnpm smoke:recording-flow-ui`
- `ROUGH_CUT_SMOKE_REGION=1 ROUGH_CUT_SMOKE_REGION_WIDTH=240 ROUGH_CUT_SMOKE_REGION_HEIGHT=180 pnpm smoke:mvp`
