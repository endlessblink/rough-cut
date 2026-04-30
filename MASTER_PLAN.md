# Rough Cut MVP Master Plan

This repo is focused on a reliable Linux/X11 screen-recording MVP.

## Status Summary

| ID | Title | Priority | Status |
| --- | --- | --- | --- |
| TASK-001 | Add repeatable MVP smoke verification script | P1 | DONE |
| TASK-002 | Add Electron UI smoke coverage for preview and export | P2 | DONE |
| TASK-003 | Improve Watchpost compatibility for project task tracking | P2 | PLANNED |
| TASK-004 | Package the desktop MVP for local install testing | P2 | PLANNED |
| TASK-005 | Document release-ready Linux/X11 verification steps | P3 | PLANNED |

## Recently Verified

- Full repository build and tests pass with `pnpm test`.
- X11 capture prerequisites are available on this machine: X11 session, FFmpeg, and FFprobe.
- A scripted service-level MVP smoke passed: record screen, remux to MP4, create `.roughcut`, reopen project, export MP4, and validate the exported file.
- Working tree was clean after verification.

## Tasks

### ~~TASK-001~~ Add repeatable MVP smoke verification script

**Priority:** P1  
**Status:** DONE

#### Context

The MVP flow works through a one-off Node script, but it is not yet available as a checked-in command.

#### Completion Notes

- Added `scripts/smoke-mvp.mjs`.
- Added root command `pnpm smoke:mvp`.
- Verified with `pnpm smoke:mvp` and `pnpm test`.

#### Acceptance Criteria

- Add a repo script such as `pnpm smoke:mvp`.
- The script records a short X11 capture, remuxes it, saves and reopens a `.roughcut`, exports MP4, and validates the result with FFprobe.
- The script skips or fails clearly when X11 or FFmpeg prerequisites are missing.
- The script leaves generated files in a clear temp or artifact location.

### ~~TASK-002~~ Add Electron UI smoke coverage for preview and export

**Priority:** P2  
**Status:** DONE

#### Progress Notes

- Added root command `pnpm smoke:ui`.
- Added an Electron smoke mode that auto-opens a project, waits for video metadata, clicks export, and writes a JSON report.
- Fixed packaged renderer asset paths by setting Vite `base: './'`.
- Verified with `pnpm smoke:ui` and `pnpm test`.

#### Context

Current automated coverage exercises main-process services well, but it does not verify the renderer buttons, preview playback controls, or export UI state end-to-end.

#### Acceptance Criteria

- Add a headless-friendly smoke path for launching the renderer.
- Verify the main screen renders without preload/runtime errors.
- Verify an opened project shows metadata, playback controls, and export controls.

### TASK-003 Improve Watchpost compatibility for project task tracking

**Priority:** P2  
**Status:** PLANNED

#### Context

Watchpost was running, but `/api/master-plan` and `/api/status` returned `500` for this repo when queried with the current `cwd`.

#### Acceptance Criteria

- Confirm whether Watchpost can parse this `MASTER_PLAN.md` shape.
- Fix any formatting issue in the plan if needed.
- If the server error is external to this repo, capture the error details for Watchpost debugging.

### TASK-004 Package the desktop MVP for local install testing

**Priority:** P2  
**Status:** PLANNED

#### Context

The app builds and runs from source, but local packaged install behavior has not been verified.

#### Acceptance Criteria

- Add or document a packaging command for the Electron desktop app.
- Produce a local Linux artifact.
- Install or launch the packaged artifact and verify the MVP record/open/export flow still works.

### TASK-005 Document release-ready Linux/X11 verification steps

**Priority:** P3  
**Status:** PLANNED

#### Context

The README states the MVP scope but does not describe how to verify release readiness.

#### Acceptance Criteria

- Document prerequisites: X11 session, FFmpeg, FFprobe, Node, pnpm.
- Document build, automated tests, and smoke verification commands.
- Document where recordings and `.roughcut` files are saved.
