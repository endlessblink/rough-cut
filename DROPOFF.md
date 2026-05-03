# Session Dropoff — 2026-05-03

This is a handoff to the next Claude/Codex instance working on this repo. Read it end-to-end before doing anything substantive. Order of priority: top sections first.

---

## TL;DR — current state in one paragraph

Repo is on `master` at commit `1042966` (cursor-follow zoom). Working tree is clean. Tests: desktop 101/101, project-model 91/91, all smokes (`mvp`, `ui`, `styled-export`) green, typecheck clean. Twelve commits landed this session shipping the manual zoom chain (TASK-014/015/016), canvas preview (TASK-025), auto-zoom suggestions and review/apply UI (TASK-018/019), cursor-follow zoom (TASK-027), plus a multi-monitor cursor fix that replaced Electron's broken `getCursorScreenPoint()` with xdotool. **TASK-027 is IN PROGRESS** in MASTER_PLAN — pending the user's manual packaged-app verification of cursor-follow on real recordings. Recovery tag at `e0a01ae` is `checkpoint/cursor-stable-2026-05-03`.

---

## Where the user left off

The user just confirmed all the recent features work in `pnpm dev` and asked for a detailed dropoff before stepping away. Their next testing step is **manual verification of TASK-027 cursor-follow zoom in the packaged app**:

```
pnpm dev
```

1. Record while moving the cursor across the screen.
2. Click "Generate suggestions" in the **Auto-zoom suggestions** panel below the manual zoom marker panel.
3. Apply one suggestion (this becomes a manual marker).
4. Use the **Zoom markers** panel to add a manual marker at a different time.
5. Watch playback. **Auto markers should pan with the cursor during the hold phase. Manual markers should stay anchored at their picked focal.** This asymmetry is intentional — the engine's `getMarkerFocalPoint` (`packages/timeline-engine/src/zoom-transform.ts:147-182`) skips cursor-follow when `marker.kind !== 'auto'` because manual markers carry user intent.
6. Export styled and confirm same behavior in the MP4.

If verification passes: the next instance should flip TASK-027's status row + body in `MASTER_PLAN.md` from `IN PROGRESS` to `DONE` and commit (~`mark TASK-027 done after manual verification`). If something looks off (cursor follows too tight / too loose / jittery), the relevant tunable is `followPadding` (default 0.18 = 18% leash) on `ZoomPresentation`.

---

## What shipped this session, in order

| Commit | What |
|---|---|
| `963de41` | TASK-014 lock zoom marker schema with regression tests (12 cases) |
| `6cd4400` | TASK-015 manual zoom marker UI panel + 14 helper tests |
| `5f4bab9` | TASK-011 cursor overlay export + TASK-016 zoom export rendering + nullsrc/zoompan fps fix + recorder off-screen cursor pass-through |
| `6fd7464` | regression tests for cursor + zoom |
| `08651d2` | TASK-015 + TASK-016 status flips to DONE |
| `e0a01ae` | TASK-025 canvas preview that mirrors styled export + xdotool cursor source bypassing Electron #42519 |
| `47e8d69` | TASK-025 status flip to DONE |
| `c3e949b` | Direction: added Wayland-readiness principle |
| `006c0b5` | TASK-018 auto-zoom suggestion engine wrapper + cursor-data abstractions (19 cases) |
| `2c77f63` | TASK-019 auto-zoom review/apply UI panel + 3 helper cases |
| `b38c535` | TASK-019 status flip to DONE |
| `1042966` | TASK-027 cursor-follow zoom: zoompan→sendcmd refactor + preview wire-up (9 cases) |

Tag `checkpoint/cursor-stable-2026-05-03` anchors `e0a01ae` as a known-good recovery point before the auto-zoom and cursor-follow work.

---

## Critical conventions and gotchas the next instance MUST know

### 1. Cursor source is xdotool, not Electron
`apps/desktop/src/main/index.mjs:28` reads cursor via `readCursorViaXdotool() ?? screen.getCursorScreenPoint()`. Electron's `screen.getCursorScreenPoint()` has a documented Linux/X11 multi-monitor regression in v29+ ([electron/electron#42519](https://github.com/electron/electron/issues/42519), [#41496](https://github.com/electron/electron/issues/41496)) — it returns stale values when the cursor leaves the primary display. This app uses Electron `^35`. **Do not "simplify" the wrapper back to direct Electron calls.** The xdotool fallback is essential.

### 2. Cursor coordinates are NEVER clamped at the recorder
`apps/desktop/src/main/recording/recording-session.mjs:124-129` `normalizeCursorPoint` only rounds — it does NOT clamp to screen bounds. Off-screen positions (cursor on a second monitor) pass through to the project file, then ASS rendering and Canvas2D both clip naturally past their bounds. **Adding any `clamp(x, 0, width-1)` at any cursor layer will reintroduce the multi-monitor "stuck on a vertical line" regression.** Tests at `recording-session.test.mjs` lock this in.

### 3. `nullsrc` and `zoompan` default to 25 fps — pin them
Both filters default to 25 fps regardless of source rate. With a 30 fps recording, the entire styled export was being emitted at 25 fps causing time-stretch + cursor drift. Fixed at `apps/desktop/src/main/export-service.mjs` (nullsrc `:r=${fps}`) and now in `zoom-sendcmd.mjs` (sendcmd timestamps computed from source fps). Test at `export-service.test.mjs` asserts `nullsrc=s=1920x1080:r=60`. **If you ever introduce another lavfi source (e.g., `sine`, `color`), pin its rate.**

### 4. zoompan expression syntax quirks (historical — now superseded)
The previous zoom-export pipeline (zoom-filter.mjs, deleted in TASK-027) used zoompan with composed expressions. Quirks worth knowing if you ever revisit zoompan:
- Use `on` (output frame counter), NOT `n`. `n` is undefined inside zoompan.
- `between(x, a, b)` is NOT supported. Use nested `if(lt(on, X), ..., if(lt(on, Y), ..., ...))`.
- `pow(t, k)` works.
- `zoom` variable is accessible in `x`/`y` expressions.
- Comma escaping: `crop x V, crop y V` inside sendcmd files works without backslash escapes when the file is read by FFmpeg directly. `\,` is only needed at the shell-CLI layer.

### 5. Cursor-follow only applies to AUTO markers
`packages/timeline-engine/src/zoom-transform.ts:153-159` `getMarkerFocalPoint`:
```ts
if (
  marker.kind !== 'auto' ||
  options?.followCursor !== true ||
  options.getCursorPosition === undefined
) {
  return marker.focalPoint;
}
```
Intentional design: manual markers respect the user's chosen focal. Don't "fix" this without user approval — it's a UX decision the user explicitly chose.

### 6. Preview/export parity is a hard requirement
Stated in `MASTER_PLAN.md` Direction. Every cursor-derived feature must produce the same visual output in canvas preview AND styled export. The current implementation achieves this by both sides consuming the same `getZoomTransformAtFrame` math:
- Preview: `resolveFrame(document, frame, { getCursorPosition })` per rAF tick.
- Export: `buildZoomSendcmd` pre-computes per-frame transforms in JS using the same function, writes a sendcmd file, FFmpeg's crop+sendcmd applies them.

Don't enable a feature on one side without the other.

### 7. Wayland-readiness principle
Stated in `MASTER_PLAN.md` Direction. Cursor-derived features consume cursor data via the abstractions in `apps/desktop/src/renderer/src/cursor-data.mjs` (`getCursorEvents`, `getCursorClickEvents`, `getCursorMoveEvents`, `getRecordingFps`, `getRecordingSourceSize`). When TASK-026 (Wayland pivot) lands, the implementation behind these names changes (compositor delivers cursor via PipeWire, or a separate input hook captures it) but call sites stay untouched. **New cursor-derived features should consume these accessors, not reach into `metadata.cursorEvents` directly.**

### 8. Schema invariants (don't break)
- `ZoomMarker` has `kind: 'auto' | 'manual'`. Auto markers are functionally identical to manual in storage, distinguished only at filter/follow time.
- `ZoomPresentation.followCursor` defaults to `true`. Honored by engine but only takes effect for `kind: 'auto'` (per #5).
- `cursorEvents` are stored at `assets[0].metadata.cursorEvents` as a plain array of `{ frame, timeMs, x, y, type, button }`. Schema is permissive (`z.record(z.unknown())` for metadata) — no per-event validation. Be careful not to add fields that other layers can't parse.
- Project schema migration is at `packages/project-model/src/migrations.ts`. Current `CURRENT_SCHEMA_VERSION = 10`. Backfill defaults for missing fields rather than failing.

### 9. Surgical commits when the user has unrelated WIP
Earlier in the session the user had pre-existing uncommitted work (TASK-011 cursor overlay) that I needed to NOT include in my TASK-014 / TASK-015 commits. The pattern that worked:
- `git show HEAD:path > /tmp/file.head` to get HEAD blob
- `cp /tmp/file.head /tmp/file.target`
- Apply only my edits to `/tmp/file.target` via Read + Edit
- `git hash-object -w /tmp/file.target` → blob hash
- `git update-index --add --cacheinfo 100644,$HASH,path` to stage that blob
- `git add` mine-only files
- Commit (working tree never touched)

User has a hard rule against `git checkout HEAD -- file` (denied at the permission layer) because it discards user-visible work. The plumbing trick avoids that.

When the user says "commit everything we have because we are in a stable state" they're explicitly opting in to bundle commits.

---

## Architecture map (for grounding)

```
packages/
├── project-model/          # ZoomMarker, CursorEvent, ProjectDocument schemas + Zod validation + migrations
├── timeline-engine/        # getZoomTransformAtFrame, smootherStep, strengthToScale, generateAutoZoomMarkers, filterAutoMarkersAgainstManual
├── frame-resolver/         # resolveFrame(project, frame, options) — the architectural keystone (preview consumes; export only consumes the math, not the full RenderFrame)
├── effect-registry/        # keyframe interpolation (used by frame-resolver, not directly by zoom code)

apps/desktop/src/
├── main/                                    # Electron main process
│   ├── recording/
│   │   ├── recording-session.mjs            # Cursor sampling loop (100ms interval, NO clamping)
│   │   ├── xdotool-cursor.mjs               # readCursorViaXdotool — bypasses Electron's regression
│   │   └── ffmpeg-capture.mjs               # x11grab spawning
│   ├── export-service.mjs                   # exportProjectToMp4, buildStyledExportArgs, buildCursorAss
│   ├── zoom-sendcmd.mjs                     # buildZoomSendcmd / createZoomSendcmdLayer (TASK-027)
│   ├── project-files.mjs                    # save/open .roughcut, getPrimaryRecording
│   └── index.mjs                            # Electron app entry, IPC handlers, runRendererUiSmoke
└── renderer/src/
    ├── main.tsx                             # Single-file React app: App, ProjectPreview, VideoPreview (canvas+hidden video), ZoomMarkerPanel, AutoZoomSuggestionsPanel, ExportPresetDetails
    ├── styled-preview.mjs                   # cursorAtFrame (interpolating lookup), drawCursorPath (vector cursor polygon)
    ├── zoom-markers.mjs                     # addManualMarkerAt, removeMarker, listMarkers, applySuggestionAsManual, getPrimaryRecordingAsset, canAddMarkerAt
    ├── cursor-data.mjs                      # Wayland-ready cursor accessors (TASK-018)
    ├── auto-zoom-suggestions.mjs            # generateSuggestionsForProject (wraps timeline-engine)
    └── styles.css                           # Single-file styling

scripts/
├── smoke-mvp.mjs                            # Records / saves / reopens / exports a synthetic project
├── smoke-ui.mjs                             # Drives the renderer through runRendererUiSmoke
├── smoke-styled-export.mjs                  # FFprobe assertions on styled exports + cursor visibility
└── smoke-packaged-app.mjs                   # Launches the packaged artifact end-to-end
```

---

## What's next — ordered queue

The user has been deciding next-task per session. Here's what's PLANNED in `MASTER_PLAN.md` ordered by my read of strategic value:

| Task | Priority | Why next? |
|---|---|---|
| TASK-013 click emphasis | P2 | Needs **click capture in the recorder** as a precondition — that capture also makes auto-zoom suggestions click-precise instead of teleport-only. Could split into TASK-013a (click capture) + TASK-013b (click effect rendering). |
| TASK-018/019 quality polish | (folded) | If the user hits the auto-zoom MVP and finds suggestion quality lacking on real recordings, click capture is the unlock. |
| TASK-026 Wayland pivot | P1 | Eventually mandatory (X11 deprecation). Big task: replaces x11grab + cursor-overlay stack with xdg-desktop-portal/PipeWire. Compositor renders cursor into the captured stream. The user said "I won't test wayland now" — defer until ready. |
| TASK-005 release docs | P3 | Low priority, but worth doing before the app gets shared. |
| TASK-020 countdown before recording | P2 | Workflow polish. |
| TASK-021 recording indicator + elapsed time | P2 | Workflow polish. |
| TASK-022 open recording/project folder action | P2 | Workflow polish. |
| TASK-023 recent projects/recordings list | P2 | Workflow polish. |
| TASK-024 microphone recording foundation | P2 | Audio. Bigger task. |

Tasks SUPERSEDED (don't re-plan): TASK-012 cursor preview, TASK-017 zoom preview — both folded into TASK-025 which is DONE.

---

## User preferences and patterns observed

- **Response style**: short, plain language, no jargon, no headers for routine answers, options not implementation plans. Per `~/.claude/CLAUDE.md`. Save the deep-technical for "details" / "show me" / "go deeper" requests.
- **`/sure?` is a confidence gate**: the user invokes this skill before approving any substantive change. It expects 5 numbered points (Root Cause / Confidence / What to read / The Fix / Side Effects). HIGH confidence requires direct file reads, not Explore agent summaries — the user has caught me overconfident on agent-only data multiple times.
- **Plan mode workflow**: user often pre-empts `ExitPlanMode` with `/sure` to challenge confidence. Read 4-5 critical files myself, update the plan with verified facts, re-run `/sure` honestly, then re-request approval. The user re-enters plan mode when I try to act in ways they perceive as risky.
- **Auto mode + plan mode interplay**: Auto mode says "prefer action over planning." The user STILL wants `EnterPlanMode` for substantial features (e.g., TASK-027's export refactor). Read the situation: small/clear change → just do it. Substantive UI work or pipeline refactor → enter plan mode and work the 5-phase workflow. The user will tell you if they want it differently for a given task.
- **`make high` / `make high all`**: shorthand for "do the verification reads necessary to upgrade confidence to HIGH and re-rate." Always do real file reads, then update plan + re-rate.
- **Surgical commits**: when working tree has unrelated WIP, the user wants only my changes committed. Use the plumbing trick (above). When the user says "stable state" or "commit everything", bundle commits are fine.
- **Test discipline**: run `pnpm test`, `pnpm typecheck`, and the relevant smokes after every substantial change. Numbers in commit messages help (e.g., "104/104 desktop, was 101, +3 new").
- **Manual packaged-app verification is the project rule** for user-visible changes. Per `CLAUDE.md` in repo root and the project's Development Rule. After automated checks pass, set status to IN PROGRESS, ask the user to verify in `pnpm dev` (or packaged), flip to DONE in a tiny follow-up commit.
- **The user's CLAUDE.md** (project-local) lists the cursor overlay rules and the source-coordinate principle. Keep aligned.

---

## Common verification flow (steady state)

```bash
pnpm typecheck                   # clean across 5 packages
pnpm test                        # 101 desktop + 91 project-model
pnpm smoke:mvp                   # record/save/reopen/export
pnpm smoke:ui                    # canvas + panels + export click flow
pnpm smoke:styled-export         # cursor + zoom export quality
# pnpm smoke:package             # only when packaging matters
```

`pnpm smoke:package` requires `pnpm package:linux` first (slow). Skip unless touching packaging.

---

## Things I almost forgot

- `~/.codex/skills/reliable-cursor-overlay/SKILL.md` was updated this session with the Electron Linux regression, the xdotool/PipeWire alternatives, the Wayland fundamentals, the `nullsrc`/`zoompan` fps trap, and the cursor-scales-with-zoom decision. **It's outside the repo** but is the canonical reference for this project's cursor overlay work. Keep it updated when conventions change.
- The `AGENTS.md` and `CLAUDE.md` files in repo root are project conventions, both committed. The project's `CLAUDE.md` is short and references the global skill.
- TaskCreate / TaskUpdate are used for in-session progress tracking. Don't carry tasks across instances — each session starts fresh.
- Plan files live at `/home/endlessblink/.claude/plans/quiet-beaming-sunset.md`. Each new plan-mode session overwrites the file. Don't treat it as persistent state.

---

## If you're stuck

- Most "weird FFmpeg behavior" answers are in `apps/desktop/src/main/export-service.mjs` and `zoom-sendcmd.mjs`. Read both.
- Most "weird cursor behavior" answers are the Electron regression (use xdotool) or the engine's `kind === 'auto'` constraint (manual markers stay static).
- Most "preview doesn't match export" issues mean a cursor-data feature was wired into preview but not export, or vice versa. Both must consume `getZoomTransformAtFrame` from the same source.
- The `/sure` skill is at `~/.claude/skills/sure/SKILL.md`. The `/next` skill is the natural starting point of a fresh session if the user doesn't direct.

Hand-off complete.
