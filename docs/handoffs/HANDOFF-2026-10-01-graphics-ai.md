# Handoff — Graphics tool + AI edit (2026-10-01)

Branch: `fix/freecut-timeline-sync-foundation`. Previous session ran out of context; this file is the complete state.
Repo: `/media/endlessblink/data/my-projects/ai-development/content-creation/rough-cut-mvp`.

## FIRST: the open request you are picking up

Noam (verbatim): **"maybe the graphics tab should have more sub sections so it wont be such a long scroll? use impcable design and keep the style of the current app"**

- The Graphics panel (right side, `apps/desktop/src/renderer/src/graphics-panel.tsx`) is now one very long scroll: Make a graphic (request box, 15-tile Style grid, Lock style, Length slider, Creativity, Generate + progress bar), On the timeline (list), Selected graphic (To front / To back / Delete, Animate, When the length changes Hold/Stretch, Entrance, Entrance length, Size, Left/right, Up/down, Opacity, Reset size & motion, editable fields, Change with Claude), House style.
- Goal: split it into sub-sections (e.g. tabs or a segmented sub-nav like "Create · Edit · Style" or collapsible groups) so there is far less scrolling, in the CURRENT app style (Studio makeover: dark, compact, `segmentedPicker`/`segmentedOption`, `inspectorSection`, `rangeField`, tokens in `styles.css :root`). Follow DESIGN.md "Rarely used controls go under a 'More …' disclosure, never deleted" and PRODUCT.md principle 2 "Stable layout over animated reveals — prefer disabled controls over disappearing ones".
- Project HARD RULE (CLAUDE.md): any UI/CSS task must load a design skill first — Noam asked for `impeccable`. Run its context script (`node /home/endlessblink/.claude/skills/impeccable/scripts/context.mjs --target apps/desktop/src/renderer/src/graphics-panel.tsx`), load its craft-floor before editing, then verify visually with real screenshots of the packaged app (see Verification).
- Suggested direction (not yet approved): a sticky segmented sub-nav at the top of the Graphics pane: **Create** (request, style, lock, length, creativity, generate) · **Graphics** (list + selected-graphic controls; auto-switch here when a graphic is selected on the viewer/timeline) · **House style**. Inside "Graphics", group the selected-graphic controls into compact clusters: Layer (front/back/delete/animate), Motion (entrance, entrance length, length behaviour), Placement (size/position/opacity/reset), Content (fields + Change with Claude). Keep `data-graphics-*` test hooks intact (probes and tests use them).
- Selecting a graphic (viewer click or timeline) calls `selectGraphic` in main.tsx → `onActiveToolChange('graphics')`; when you add sub-tabs, a selection should open the sub-tab that shows the selected graphic.

## Golden rules (Noam's, enforced by memory + CLAUDE.md)

- Only Noam's verbal confirmation proves something works. Never say "fixed"/"done" without it; report as "built + verified by me, waiting for your check".
- Final user-facing replies: 1–4 short plain sentences + "Next steps" as things to click (no paths/commands/test counts). Noam runs the app from the dock.
- Never make live cloud LLM calls (Claude/OpenAI). Use the stand-in Claude (see below). Noam runs real generations himself.
- Image generation: only GPT Image 2 or Seedream 5 (never other models).
- ffmpeg via Bash is blocked by the render-guard hook; ask Noam before any ffmpeg run (he approved one read-only silence calibration this session).
- Do not commit other sessions' files (see "Not mine" below). Don't push unless asked; CI cost rules apply.
- After a rebuild, Noam's open app keeps running OLD code until he fully quits and reopens. Tell him to quit fully. (Dock launch uses a per-renderer-bundle profile dir; same-bundle relaunch now restarts into the newer build — see index.mjs second-instance handler.)

## What was built this session (all packaged; tests 952/952; typecheck clean)

Graphics (Claude-made HTML layers; `apps/desktop/src/shared/motion-graphics.mjs` runtime + `graphics-overlay.tsx` preview + `main/graphics-export.mjs`/`graphics-frame-renderer.mjs` export):
1. Guaranteed entrance/exit for every graphic (layout.entrance none/fade/rise/pop/slide + entranceSec), applied by the page runtime (`graphicLayerStateAt`, stringified into the page so preview = export).
2. Per-graphic layout: size/x/y/opacity (`normalizeGraphicLayout`, `setGraphicLayout`), panel sliders (live preview, one undo step on release), and drag/resize on the viewer: 8 handles (edges + corners) pinning the opposite side (`resizeGraphicLayout`). Clicking a graphic on the viewer selects it from ANY tool and opens Graphics (regression-tested).
3. Sharpness: page drawn at the shown pixel size (`rc-viewport` viewScale), sized by CSS `zoom` not a scale transform, wrapper `#rc-root` carries RTL + layout (body/html stay LTR — an RTL viewport pushed scaled pages out of view), overlay + translate snapped to whole pixels (fractional x=269.34 caused blur). Verified crisp at 0.4×/1×/1.8×/2.6×. Noam said "not sure it is 100% crisp yet" — if he reports a specific soft spot, investigate (ideas: devicePixelRatio>1 displays, composited animated layers inside Claude's HTML).
4. Seamless looping strips: `data-rc-marquee` runtime (unit repeated, bidi-isolated, loops at any length); repaired Noam's "מה זה סקיל?" tape in his real project (backup `…roughcut.before-tape-fix`).
5. Generation: style = LOOK only (light influence by default; "Lock style" switch makes it strict); 10 random design directions (`pickDesignDirection`, avoids ones already used + told what's already in the video); originality rules (video/words are references, never copy slides); no copyable examples in rules; graphics must have finished edges (no edge-glued panels / overflow:hidden on wrapper). 6 new styles (Hand Drawn, Chalkboard, Blueprint, Comic Pop, Paper Cut, Isometric 3D) + embedded hand-lettering fonts (Amatic SC & Karantina with Hebrew, Caveat, Permanent Marker; OFL/Apache) in `shared/graphics-fonts.generated.mjs` built by `scripts/build-graphics-fonts.mjs`.
6. Reliability: SVG namespace URLs no longer falsely rejected (was doubling generation time); generation survives tab switches (`renderer/src/graphics-job.ts` store; finish handlers registered from main.tsx each render); progress bar tied to real stages (writing/checking/second try) paced by median past answer time (`typicalClaudeAnswerMs` from `~/.config/rough-cut-mvp/claude-log`).
7. Timeline: delete via Delete key (editor-wide `handleEditorKeyDown`, focus on grab), × badge on short blocks, overlapping graphics stack in rows (`graphicLaneRows`), To front/To back (`reorderGraphic`).
8. Length (TASK-271): Length slider (Auto, 2–60 s) for new graphics (long = multi-beat brief; result forced to chosen length); "When the length changes" Hold/Stretch per graphic (`timing`, `designedSec`, runtime `stretchFactor`). Re-time with Claude = "Change with Claude".
9. Earlier today: camera lip-sync (restore kept camera head offset + playback camera lock), grid visible during playback, audio muted fix (app now named "Rough Cut" to PulseAudio; Noam's system had "Chromium muted").

AI edit tab (TASK-272):
- `main/silence-detect.mjs`: ffmpeg silencedetect (-38 dB, ≥1.5 s, 0.25 s padding) → dead-air cut suggestions always offered; Claude told they exist. On Noam's skill video: 12 silences / 31 s.
- Panel redesign (`ai/ai-shell.tsx` + `.ai*` CSS): map strip, grouped rows (Dead air / Cuts / Zooms / Title), Show (jumps to Recording edit), Cut / Cut all (one undo step), working indicator.
- Fixed real bug: AI applies were never saved nor undoable → now `AI_EDIT_CHANGE` (history + persist). Applied state for cuts derives from the project, so Undo flips rows back.
- Still open in TASK-272: transcript and screen-change inputs, Claude still can't see/hear; "Show" uses source time (approximate if earlier cuts exist).

Plan docs: `docs/ai-animator-plan.md` (AI animator TASK-253..262 + 271/272 notes). MASTER_PLAN rows TASK-253..262, 271, 272 added (271/272 = "IN PROGRESS — built, awaiting Noam's check").

## Verification method (do the same)

- Build: `pnpm package:linux` (from repo root) → `dist/rough-cut-mvp-linux-x64`.
- Probes (Playwright `_electron`, packaged app, copies of the real project) live in the old session scratchpad: `/media/endlessblink/data/.dev-tmp/endlessblink/claude-1000/-media-endlessblink-data-my-projects-ai-development-content-creation-rough-cut-mvp/4df27894-3d4f-45b0-b64f-9f836c5f5932/scratchpad/` — e.g. `probe-tiles.mjs` (panel screenshot), `probe-job.mjs` (generate with stand-in, tab switch, stacking, delete), `probe-len.mjs`, `probe-ai2.mjs`, `probe-sel.mjs`, `probe-resize.mjs`. Copy them to your own scratchpad. Stand-in Claude: `fake-claude.mjs` there (set env `ROUGH_CUT_CLAUDE_BIN=<path>` and `FAKE_CLAUDE_MS`).
- Real project: `~/Documents/Rough Cut MVP/recordings/rough-cut-2026-06-02T15-49-33-067Z.roughcut` (never edit while Noam's app is open; always probe on copies).
- Required by CLAUDE.md for renderer changes: `pnpm visual:real-editor <project>` (needs app frontmost; capture is a 3840-wide two-monitor shot — the app is on the left half).
- `convert`, `node -e`, python heredocs are blocked by the shell allowlist: write script files.

## Files touched (uncommitted before the handoff commit)

Mine (committed in the handoff commit): apps/desktop/package.json (test list += silence-detect), main/{ai-service(.test),claude-cli,claude-graphics-service(.test),graphics-export,graphics-frame-renderer,graphics-style-store(.test),index,silence-detect(.test)}.mjs, preload/index.cjs, renderer/src/{ai/ai-shell.tsx,graphics-overlay.tsx,graphics-panel.tsx,graphics-job.ts,main.tsx,styled-video-preview.test.mjs,styles.css}, shared/{graphics-styles.mjs,ipc-channels.mjs,motion-graphics.mjs,motion-graphics.d.mts,motion-graphics.test.mjs,graphics-fonts.generated.mjs}, scripts/build-graphics-fonts.mjs, docs/ai-animator-plan.md, this handoff.

Not mine — left uncommitted, do NOT commit or revert: CLAUDE.md, MASTER_PLAN.md (mixed: my rows 253–262/271/272 + another session's 263–270), apps/desktop/src/main/recording/{camera-sources(.test),ffmpeg-capture,ffmpeg-capture-args.test}.mjs, docs/DECISION-go-free-2026-09-30.md. Another session works on release readiness (TASK-264/269) in parallel.

## Next steps after the Graphics sub-sections

1. Ask Noam to check: AI tab (dead air, Cut all, Undo), Length slider + Hold/Stretch, styles (Hand Drawn), sharpness.
2. Then from the plan: TASK-254 transcript, TASK-253 loose style reference, TASK-255 2D/3D toolkit spike, TASK-256 "Illustrate this".

## First command

`cd /media/endlessblink/data/my-projects/ai-development/content-creation/rough-cut-mvp && git log --oneline -3 && node /home/endlessblink/.claude/skills/impeccable/scripts/context.mjs --target apps/desktop/src/renderer/src/graphics-panel.tsx`
