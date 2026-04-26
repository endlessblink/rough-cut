# Rough Cut — Assistant Notes

Desktop screen recording + editing studio. Electron + React + TypeScript + PixiJS. Monorepo (pnpm workspaces + Turbo).

**Source of truth for work:** `docs/MASTER_PLAN.md`
**Architecture:** `docs/ARCHITECTURE.md`

---

## Current Priority Lock — Client Tutorial Readiness

Until `TASK-251` is done, the only product goal is: **make Rough Cut safe enough to record the user's client tutorial on Linux without rebooting to Windows.**

- Do not start AI, Motion, broad Edit work, or general sidebar breadth before the client-tutorial readiness gate is green.
- Do not optimize for feature count. Optimize for recording-flow parity with Focusee for the user's immediate tutorial needs.
- The readiness gate must prove the exact flow: record screen + camera + mic/system audio + cursor/zoom, review playback, reopen the project, export MP4, and verify the exported artifact.
- If a change does not directly improve that gate, defer it unless the user explicitly overrides this priority lock.

---

## MANDATORY: Third-Party License Compliance

These obligations are **easy to forget and costly to miss**. Check this list any time you touch transcription, AI analysis, FFmpeg bundling, install flows, About screens, landing pages, or release artifacts.

### WhisperX — BSD-4-Clause (advertising clause)

Applies if/when WhisperX is integrated (FEATURE-078, TASK-080).

- ✅ Commercial use, modify, bundle in closed-source — all allowed
- ⚠️ **Advertising acknowledgement required.** Any promotional material (README, landing page, App Store description, release notes that market a WhisperX-powered feature) must contain an attribution line. Example wording:
  > "This product includes software developed by Max Bain and WhisperX contributors."
- ⚠️ **Carry the LICENSE text** in source + binary distributions (ship `THIRD_PARTY_LICENSES.md` or equivalent).
- Tracked as **TASK-083**. Do not ship a release that markets AI transcription features without completing it.

### FFmpeg — LGPL by default, GPL if configured wrong

**Current usage:** rough-cut calls the `ffmpeg` binary as a subprocess (see `apps/desktop/src/main/recording/ffmpeg-capture.mjs`). This pattern has **no code-side obligations** — not a derivative work.

**When you must act:**

| Scenario | Obligation |
|----------|------------|
| User installs FFmpeg themselves (current behavior) | None. |
| You bundle an FFmpeg binary in the installer | Include LGPL text, link to ffmpeg.org source, don't prevent user replacement. |
| You statically link FFmpeg libraries | Painful for closed-source — avoid. |
| You use `--enable-gpl` / `--enable-nonfree` build (x264, x265, libfdk-aac) | **Entire app must be GPL.** Forbidden unless the app is intentionally GPL-licensed. |

**Rule for this repo:** if bundling FFmpeg is ever added, use an LGPL-only build. Never ship GPL-configured FFmpeg binaries alongside proprietary code.

### ButterCut (barefootford/buttercut) — MIT

Any code, patterns, or prompt templates ported from ButterCut must preserve its copyright notice (`Copyright (c) 2025 Andrew Ford`) in derived files.

---

## Quick Command Reference

```bash
pnpm install          # bootstrap
pnpm dev              # Electron dev (apps/desktop)
pnpm build            # production build
pnpm test             # unit tests
pnpm lint
```

## Runtime Logs

- Terminal-equivalent app runtime output is mirrored to `.logs/app-runtime.log`
- Agents should check `.logs/app-runtime.log` first when debugging runtime issues
- Prefer reading/tailing that file directly over asking the user to paste logs from the terminal
- This log reflects the Electron app runtime stream (main process output plus renderer console forwarded through main)

## E2E Display Mode

- Default to `pnpm test:e2e:headless:serial` for full Electron/Playwright runs.
- Use `pnpm test:e2e:headless` for faster background runs when parallelism is acceptable.
- For single Electron/Playwright specs, stay headless by using the named headless scripts or wrapping the command with `xvfb-run`.
- Do not run headed Electron/Playwright tests unless the user explicitly asks for a visible run in that moment.
- Avoid `pnpm exec playwright test` directly for Electron E2E unless you intentionally need custom flags and still keep the run headless.

## Task Workflow

Follow the MASTER_PLAN format in `docs/MASTER_PLAN.md`:
- Get next ID from the summary tables (TASK-083 is the current highest as of 2026-04-12)
- Add to the appropriate Tier section's summary table
- Write a detailed `###` section under "Active Work" once started
- Mark done in **both** places: strikethrough the ID + update status to `✅ DONE`

## Watchpost

This project is registered with Watchpost on `localhost:6010`. Prefer `GET /api/master-plan` and `GET /api/outlook` over reading markdown directly when you need task state.

### Watchpost Kanban Gotcha

- Do not claim a Watchpost board fix from markdown edits alone.
- The kanban page is project-context-sensitive: verify against the live board with the `rough-cut` project selected, not the dashboard's default active project.
- For visual verification, the parent page sends a `switch-project` message; a raw `/kanban/` load can show another project's data.
- The `FEATURE-078` / `PLANNED` mismatch was caused by Watchpost kanban logic, not `MASTER_PLAN.md`:
  - it wrongly auto-promoted todo/planned cards with non-zero progress into `In Progress`
  - it also failed to parse inline mixed meta lines like `**Priority:** P1 | **Status:** PLANNED (...)`
- What worked:
  - patch `devops/watchpost/kanban/index.html` so column placement follows explicit parsed status, not progress
  - normalize explicit `Status:` from task text before bucketing/rendering
  - then verify live with the `rough-cut` project context and confirm the card's actual column + badge
