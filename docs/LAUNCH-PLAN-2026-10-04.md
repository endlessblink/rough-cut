# Launch plan A to Z — target: publish Sunday 2026-10-04

Written Saturday 2026-10-03 ~16:00. Nothing is pushed, tagged on the remote, released or posted until Noam says so (gates marked **NOAM**).
The GitHub repo `endlessblink/rough-cut` is already PUBLIC (0 stars, `master` last updated 2026-08-02), so "publish" = move master forward + tag + release page + posts.

## Where we stand (evidence, 2026-10-03)

- Code: branch `fix/freecut-timeline-sync-foundation`, 75 commits ahead of `origin/master`, 1 behind (a 2026-08-02 commit on master to be reconciled).
- Tests: desktop 1008, project-model 274, repo 41, typecheck clean. Packaged recording flow, cancel flow, and a new real-app Recording-tab lifecycle check pass (screenshots looked at).
- Fixed today: stale tray light after a take, duplicate controls on the Recording tab, 52 s finish delay after a 2 min take (now ~0.5 s).
- Secrets: pattern scan of tracked files and the two commits that mention `sk-ant` found only UI placeholders. (gitleaks is installed but blocked by the shell allow-list; run it once Noam allows it.)
- No live Claude/cloud call was ever made by agents. Claude graphics need Noam's own login/session to try for real.

## What is still NOT proven (the honest list)

1. A real recording with mic + camera into the current build (the only real take Noam did since the fixes had no mic, no camera).
2. Real-hardware dock/tray light after a take (xvfb has no tray).
3. A 2+ min export of that take reviewed by eye: sound level + sync, camera sync, zoom framing, graphics, length.
4. Fresh-machine install: nothing has ever run outside Noam's PC (no AppImage, no clean-user test).
5. Claude graphics on a clean profile (first-run: what does the user see if Claude CLI is missing?).
6. CI has never run on GitHub (desktop tests may need ffmpeg/xvfb there).
7. Non-KDE desktops, Wayland, non-NVIDIA: untested. README must say "Linux/X11, tested on KDE + NVIDIA" plainly.

## The plan

### Phase 1 — Tonight (Sat), about 2 h

| # | Step | Owner | Done when |
|---|------|-------|-----------|
| 1 | Record one 2–3 min take: mic ON, camera ON, talk, move the mouse, click things, one pause/resume. Don't touch the screen during the later export check. | NOAM | folder exists with audio + camera files |
| 2 | Check the take: audio stream present, camera present, finish time under 5 s, editor opens with camera in sync, tray light gone | Agent | numbers + screenshots reported |
| 3 | Export it through the review tool (~10 min, takes over the screen) and look at every sheet; check sound level and sync by ear/numbers | Agent | review says "looks right" and I looked |
| 4 | Fix anything real found, each with a regression test, commit | Agent | tests green |
| 5 | Noam watches the tray/dock light once on a real take (start, pause, stop) | NOAM | "light behaves" |

### Phase 2 — Tonight/Sunday morning: make the repo safe to show

| # | Step | Owner |
|---|------|-------|
| 6 | Reconcile with `origin/master` (diff stat first; one commit only) on a fresh `release/launch-2026-10-04` branch cut from the tested HEAD. Never merge the old branch blindly. | Agent |
| 7 | The other agent's uncommitted work (graphics panel rewrite, styles hunk, CLAUDE.md, MASTER_PLAN) — **decision**: ship without it (default, safest) or wait for its owner to commit and test it | NOAM |
| 8 | Clean the public tree: stop shipping internal agent files (HANDOFF.md 50 KB, MASTER_PLAN.md 650 KB, PERPLEXITY_QUERIES.md, AI_CREATIVE_STUDIO_DIRECTION.md, `.kiro`, `.agents`, `.codex`, `.claude/…`, `docs/handoffs`, hard-coded `/home/endlessblink` paths in docs/tests). Move them to a private notes folder, keep README, LICENSE, SECURITY, CONTRIBUTING, docs that help users. | Agent (list for Noam to approve) |
| 9 | Full secrets/privacy scan (gitleaks after Noam allows it + grep for emails, tokens, personal paths, recordings, faces in assets) | Agent |
| 10 | README rewrite for users: what it is, 3–4 feature GIFs, install (below), requirements (Linux X11, ffmpeg, xdotool, xinput, NVIDIA "Allow Flipping" note), known limits, AGPL, "a paid Pro may come later", waitlist for Mac/Windows. Move developer smoke commands to CONTRIBUTING. | Agent, **NOAM approves wording** |

### Phase 3 — Sunday morning: the thing people download

| # | Step | Owner |
|---|------|-------|
| 11 | Pick the artifact. **Recommended: AppImage** (one file, no install) built with electron-builder from the existing packaged folder; fallback: `.tar.gz` of the packaged folder + `run.sh`. Needs adding one dev dependency (no cloud account). | Agent; **NOAM chooses** |
| 12 | Clean-machine test: new empty Linux user (or container with Xvfb) → run the artifact → app opens, first-run sees missing-tool messages that make sense (no ffmpeg / no xdotool), a short recording works, export works | Agent |
| 13 | CI: let the lean workflow run once on a branch push (cost-safe: one push), fix only real failures | Agent |
| 14 | Version bump 0.1.0 → 0.1.0-beta (say "beta" honestly), CHANGELOG with the real fixes, release notes draft | Agent |

### Phase 4 — Feature GIFs (can run parallel to phase 3)

Capture from the packaged app (xvfb or screen), ≤3 MB each, 8–12 s, no face unless Noam OKs it (the current demo.gif shows his face and terminal text — **NOAM must OK or I re-capture with a neutral clip**).

| GIF | Shows | Why it sells |
|-----|-------|--------------|
| 1 Record | Start → live panel (timer, sources) → Stop → editor opens in under a second | "one click, nothing lost" |
| 2 Auto-zoom + cursor | click-driven zoom following the cursor, styled cursor | the Screen Studio-style hook |
| 3 Cut and trim | select a range, delete, playback jumps cleanly | shared timeline |
| 4 Look | background / grid / rounded frame / camera bubble switching | pretty by default |
| 5 Claude graphics | prompt → animated graphic over the video (uses a stand-in recording, **Noam runs the one live call**, I never do) | the differentiator |
| 6 Export | export panel → progress → "picture, sound, animations and length look right" check | trust |

### Phase 5 — Publish (only on Noam's word)

| # | Step | Gate |
|---|------|------|
| 15 | Final check: all tests, packaged smokes, lifecycle check, export review on the final commit | Agent |
| 16 | Push the release branch, open PR into `master` (diff stat shows no deletions of files master has), merge | **NOAM "push"** |
| 17 | Tag `v0.1.0-beta`, create the GitHub release with the artifact, GIFs, notes | **NOAM "release"** |
| 18 | Drafts only (files): launch post(s), short demo clip caption, Show-HN-style text, r/linux-style post. Posting is **NOAM**. | **NOAM "post"** |
| 19 | After launch: watch issues for 48 h; keep a hotfix branch ready | Agent |

## Risks that could slip the date

- Mic/camera real-hardware bugs found in step 3 (fixing takes hours, not minutes). Mitigation: step 1 tonight.
- AppImage build with Electron + native deps (ffmpeg is a system tool, not bundled): if it fights back, ship the tar.gz and promise AppImage in 0.1.1.
- First-run on a machine without ffmpeg/xdotool/xinput: needs a clear in-app message, otherwise the first user sees a broken recorder.
- Claude graphics depend on the user's own Claude login; the README must say so, and the app must fail kindly without it.
- Other agent's graphics-panel work: unreviewed; shipping it untested would break the "reliable" promise.

## Decisions needed from Noam (in this order)

1. Record the take tonight (step 1).
2. Ship without the other agent's uncommitted graphics-panel work? (recommended: yes)
3. AppImage or tar.gz first?
4. Is the face/terminal demo GIF OK, or re-capture neutral?
5. README wording + "beta" label OK?
6. Later, separately: "push", "release", "post".
