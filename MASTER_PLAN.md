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
| TASK-009 | Add styled export UI preview metadata | P2 | PLANNED |
| TASK-010 | Add cursor telemetry recording foundation | P1 | PLANNED |
| TASK-011 | Add cursor overlay export rendering | P1 | PLANNED |
| TASK-012 | Add cursor overlay preview rendering | P2 | PLANNED |
| TASK-013 | Add click emphasis telemetry and export rendering | P2 | PLANNED |
| TASK-014 | Add manual zoom marker data model | P1 | PLANNED |
| TASK-015 | Add manual zoom marker UI controls | P1 | PLANNED |
| TASK-016 | Add smooth manual zoom export rendering | P1 | PLANNED |
| TASK-017 | Add zoom preview playback approximation | P2 | PLANNED |
| TASK-018 | Add automatic zoom suggestion engine | P2 | PLANNED |
| TASK-019 | Add automatic zoom review/apply flow | P2 | PLANNED |
| TASK-020 | Add countdown before recording | P2 | PLANNED |
| TASK-021 | Add clear recording indicator and elapsed time | P2 | PLANNED |
| TASK-022 | Add open recording/project folder action | P2 | PLANNED |
| TASK-023 | Add recent projects or recordings list | P2 | PLANNED |
| TASK-024 | Add microphone recording foundation | P2 | PLANNED |

## Recently Verified

- Full repository build and tests pass with `pnpm test`.
- X11 capture prerequisites are available on this machine: X11 session, FFmpeg, and FFprobe.
- `pnpm smoke:mvp` verifies record, remux, `.roughcut` save/reopen, export, and FFprobe validation.
- `pnpm smoke:ui` verifies renderer preview/export UI against a synthetic project.
- `pnpm smoke:package` verifies the packaged Linux artifact launches, previews, and exports.
- The packaged app was manually checked for record, preview, and export.

## Direction

The next phase is not generic editing. It is client-demo recording quality.

- First: reliable, testable recording and export foundations.
- Second: client-ready presentation: styled canvas, cursor overlay, click emphasis.
- Third: Screen Studio-style zooms: manual first, automatic suggestions second.
- Fourth: workflow polish: countdown, indicator, quick folder access, recent sessions.
- Later: trimming and timeline editing.

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
- Styled export creates a 1920x1080 canvas with an opinionated center crop, larger screen framing, pastel gradient background, rounded corners, and soft shadow.
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

### TASK-009 Add styled export UI preview metadata

**Priority:** P2  
**Status:** PLANNED

#### Context

Users need to know whether they are exporting raw or styled output before clicking export.

#### Acceptance Criteria

- Show the selected export mode in the UI.
- Show styled preset basics: output size, background, padding.
- Do not build a full visual editor yet.

#### Testing

- Renderer smoke verifies the styled mode UI appears.
- Existing raw export UI still works.

#### Verification

- `pnpm test`
- `pnpm smoke:ui`
- Manual packaged check of export mode display.

### TASK-010 Add cursor telemetry recording foundation

**Priority:** P1  
**Status:** PLANNED

#### Context

For client demos, cursor presentation should be rendered as an overlay instead of relying only on raw cursor pixels captured by FFmpeg.

#### Acceptance Criteria

- Capture cursor position samples while recording.
- Store cursor samples in the `.roughcut` project or a referenced sidecar file.
- Include timestamps aligned to the recording start time.
- Keep screen-only recording working if telemetry capture fails.

#### Testing

- Unit test cursor sample normalization and timestamp alignment.
- Service smoke verifies a recording produces cursor telemetry.
- Project reopen test verifies cursor telemetry is readable.

#### Verification

- `pnpm test`
- `pnpm smoke:mvp`
- Manual packaged recording: confirm project contains cursor telemetry without breaking preview/export.

### TASK-011 Add cursor overlay export rendering

**Priority:** P1  
**Status:** PLANNED

#### Context

Cursor telemetry becomes useful when styled export can render a clean cursor overlay.

#### Acceptance Criteria

- Render cursor overlay in exported video using recorded cursor samples.
- Keep overlay style simple and legible.
- Allow export without cursor overlay if telemetry is missing.
- Preserve raw export behavior.

#### Testing

- Unit test cursor overlay filter/render input generation.
- Smoke test export succeeds with cursor telemetry present.
- Smoke test export succeeds with cursor telemetry absent.

#### Verification

- `pnpm test`
- Styled export smoke with cursor overlay.
- Manual packaged export: visually confirm cursor overlay appears in the right place.

### TASK-012 Add cursor overlay preview rendering

**Priority:** P2  
**Status:** PLANNED

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

### TASK-014 Add manual zoom marker data model

**Priority:** P1  
**Status:** PLANNED

#### Context

Manual zooms should be stored as simple project markers before any complex editing UI is added.

#### Acceptance Criteria

- Add zoom marker schema with start time, end time, target center, and scale.
- Store markers in `.roughcut` projects.
- Validate project files with and without zoom markers.

#### Testing

- Schema tests for valid and invalid zoom markers.
- Migration or compatibility tests if the project schema changes.

#### Verification

- `pnpm test`
- Open existing `.roughcut` files without zoom markers.

### TASK-015 Add manual zoom marker UI controls

**Priority:** P1  
**Status:** PLANNED

#### Context

The first manual zoom UI should be simple and useful, not a full timeline editor.

#### Acceptance Criteria

- Add controls to create, list, and remove zoom markers.
- Use current playback time for marker creation.
- Store changes in the project file.

#### Testing

- Renderer smoke creates a zoom marker on a synthetic project.
- Project save/reopen test confirms marker persistence.

#### Verification

- `pnpm test`
- `pnpm smoke:ui`
- Manual packaged flow: create marker, save/reopen, confirm marker remains.

### TASK-016 Add smooth manual zoom export rendering

**Priority:** P1  
**Status:** PLANNED

#### Context

Manual zoom markers need to affect final exported output with smooth transitions.

#### Acceptance Criteria

- Export styled video with smooth zoom in/out animation from markers.
- Clamp zoom targets inside source bounds.
- Preserve cursor overlay compatibility.

#### Testing

- Unit test zoom transform calculation.
- Styled export smoke validates a zoomed MP4 is produced.
- FFprobe validates output dimensions and duration.

#### Verification

- `pnpm test`
- Styled zoom export smoke.
- Manual packaged export: visually confirm zoom timing and smoothness.

### TASK-017 Add zoom preview playback approximation

**Priority:** P2  
**Status:** PLANNED

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

### TASK-018 Add automatic zoom suggestion engine

**Priority:** P2  
**Status:** PLANNED

#### Context

Automatic zooms should be suggestions based on cursor activity, not irreversible edits.

#### Acceptance Criteria

- Analyze cursor dwell, click events, or movement clusters.
- Generate candidate zoom markers.
- Avoid excessive or jittery suggestions.
- Keep the engine deterministic for testing.

#### Testing

- Unit tests for dwell/click clustering.
- Fixture tests for expected suggestions from sample telemetry.

#### Verification

- `pnpm test`
- Run suggestion generation on a real recorded project and inspect generated markers.

### TASK-019 Add automatic zoom review/apply flow

**Priority:** P2  
**Status:** PLANNED

#### Context

Automatic zoom suggestions need a user-facing review step before they become project markers.

#### Acceptance Criteria

- Add UI to generate automatic zoom suggestions.
- Let the user apply or discard suggestions.
- Applied suggestions become normal manual zoom markers.

#### Testing

- UI smoke verifies suggestions can be generated from fixture telemetry.
- Project save/reopen confirms applied suggestions persist as markers.

#### Verification

- `pnpm test`
- `pnpm smoke:ui`
- Manual packaged check on a real recording.

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
