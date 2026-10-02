# Release readiness — 2026-10-02

Branch `release/prep-2026-10-02` (checkpoint `checkpoint/export-trustworthy-2026-10-02` + 12 fixes from `fix/e2e-prelaunch` + licence files).
Nothing here has been pushed, tagged on the remote, published or posted.

## Verdict

**NO-GO for a public release today. GO to use this build for real work and to treat it as a release candidate.**
A public release needs the decisions and the three real-world checks listed under "Before a public release".

## Verified (evidence)

| What | How | Result |
|---|---|---|
| Automated tests | desktop 990, project model 274, repository checks 41, typecheck | all pass |
| Real export of the 5:55 walkthrough project (real media) | `scripts/export-review` through the packaged app, then every contact sheet opened and looked at | background grid, animated graphics, zooms, camera, sound all present; 349.0 s as expected; sound in sync (20 ms); no black frames, no frozen camera, no frozen tail; the app's own check line says "picture, sound, animations and length look right" |
| Half-built export never visible under its final name | real export with the output folder polled every 2 s | final name appeared only after the app said done; 0 early appearances |
| Real Recording edit screen | `pnpm visual:real-editor` on the packaged build, screenshot reviewed | full layout, viewer bounds, grid, camera, Background panel with Grid lines, timeline lanes all intact |
| Real X11 recording | `pnpm smoke:mvp` | recorded, wrote everything into one `<date_time> Recording/` folder, reopened, exported |
| Export panel, Projects folder line | real screenshots reviewed | "Save to" row with Choose… and Open folder before exporting; KDE's own file dialog opens; Projects folder line aligned |

## Not verified

- A recording **with camera and microphone** into the new dated-folder layout (unit-tested only; the camera is not available to the automated runs).
- The **organizer** on the 463 real files (dry run only: 79 folders planned, nothing moved). Needs the app closed and Noam's go.
- **Raw** export mode, vertical / other aspect ratios, and the `smoke:package*` flows.
- A **live Claude graphics generation** (by policy only Noam runs live calls).
- Behaviour on a desktop other than KDE/X11 (the KDE file dialog falls back to the standard one; untested there).

## Known gaps

- **No installer.** `pnpm package:linux` makes a local folder only (no AppImage/.deb, no signing, no update path). A release needs a decided artifact.
- **README wording is a draft** for Noam to approve (it now describes the product and carries the AGPL statement and "a paid Pro edition with new features may come later").
- Linux/X11 only; NVIDIA needs "Allow Flipping" disabled for clean captures (documented in CLAUDE.md, not in the README).
- Other agents' unfinished graphics-panel work is uncommitted in the main working tree and is **not** part of this branch.
- Research done on 2026-10-02 suggested moving transparent graphics rendering out of Electron's hidden window; not needed now (the export is verified), worth revisiting if animations ever fail again. A failure is now reported in red with its reason.

## Before a public release (needs Noam)

1. Approve the README wording and the licence (AGPL-3.0 text added as `LICENSE`).
2. Decide what gets published (artifact type) and where (remote: `github.com/endlessblink/rough-cut`).
3. One real recording with camera + mic, then one export, using the dock app.
4. Decide on running the organizer on the existing recordings.
5. Say "push" / "release" explicitly. Nothing is published without it.

## Rolling back

Everything is local and reversible: the checkpoint tag `checkpoint/export-trustworthy-2026-10-02` is the state before the 12 fixes and licence files. In the main working tree use `git reset --keep checkpoint/export-trustworthy-2026-10-02` (keeps other people's uncommitted files).
