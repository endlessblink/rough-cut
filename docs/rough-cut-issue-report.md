# Rough Cut issue report

Updated: 2026-08-08T19:01:14.673Z

Passed means the current automated check passed. Unverified means the required runtime or visual boundary has not been exercised yet.

Summary: 15 passed, 0 failed, 0 unverified.

- **PASSED — pane-switch-preserves-canonical-recording**: Switching away from the Editor preserves recording and camera clips
- **PASSED — editor-layer-round-trip-preserves-content**: Editor-added overlapping layers survive a canonical round trip
- **PASSED — layer-order-is-explicit**: Overlapping layers have deterministic above/below ordering
- **PASSED — export-contract-uses-canonical-document**: Export contract retains the edited canonical timeline
- **PASSED — cross-pane-save-order**: Overlapping saves are serialized per project
- **PASSED — boot-deep-link-honours-requested-view**: A deep link that names a view keeps it after the project opens
- **PASSED — editor-regression-harness-targets-shipped-editor**: The editor regression harness drives the editor the app actually ships
- **PASSED — nle-source-guards-match-the-shipped-shell**: Source guards assert against the editor main.tsx actually mounts
- **PASSED — export-entrypoints-share-canonical-exporter**: Raw and styled export actions use the same canonical exporter
- **PASSED — packaged-runtime-gate**: The freshly packaged app boots the embedded editor on the requested view
- **PASSED — real-editor-renders-real-media**: The packaged Editor renders a real project with real media inside the viewer
- **PASSED — editor-pane-switch-e2e**: Switching between Recording edit and the Editor keeps the same live editor session
- **PASSED — editor-recording-edit-sync**: Real edits in Recording edit and FreeCut synchronize through the canonical project and survive reload/undo
- **PASSED — export-page-ui-e2e**: Packaged raw and styled export actions complete from the same project
- **PASSED — preview-export-frame-parity**: Preview and Rough Cut export frames match at a known timeline position

## Evidence

Artifacts are only accepted when they are newer than the packaged renderer. An
older artifact describes a build that is no longer shipping, so it is rejected
rather than reported as proof.

- **packaged-runtime-gate** — report: `/media/endlessblink/data/.dev-tmp/endlessblink/rough-cut-package-smoke-JKZDqQ/runtime-report.json`
- **real-editor-renders-real-media** — report: `/tmp/rc-real-editor-latest/real-editor-report.json` — screenshot: `/tmp/rc-real-editor-latest/real-editor.png` — sha256: `47e11a3cbd13619bd7a4d68f25d5f1e0387d0de4434798ecda0e298b24e1319a` — project: `/home/endlessblink/Documents/Rough Cut MVP/recordings/herdr_1.roughcut`
- **editor-pane-switch-e2e** — report: `/tmp/rough-cut-pane-switch-1786215580987/pane-switch-report.json` — screenshot: `/tmp/rough-cut-pane-switch-1786215580987/pane-switch-final.png` — sha256: `9488d2ffa394578c30a07ecd011202cee6e7feb68c92918d233ba7a7b01b3379` — project: `/home/endlessblink/Documents/Rough Cut MVP/recordings/herdr_1.roughcut`
- **editor-recording-edit-sync** — report: `/tmp/rc-edit-sync-final-latest/editor-recording-edit-sync-report.json` — project: `/home/endlessblink/Documents/Rough Cut MVP/recordings/herdr_1.roughcut`
- **export-page-ui-e2e** — report: `/tmp/rc-export-latest/export-entrypoints-report.json`
- **preview-export-frame-parity** — report: `/tmp/rc-parity-latest/preview-export-parity-report.json` — screenshot: `/tmp/rc-parity-latest/preview-frame.png`

## How to reproduce this run

```
ROUGH_CUT_EXPORT_ENTRYPOINT_REPORT=<export-dir>/export-entrypoints-report.json \\
ROUGH_CUT_PREVIEW_PARITY_REPORT=<parity-dir>/preview-export-parity-report.json \\
pnpm report:regression
./scripts/host-readiness-runner.sh --once smoke-package
./scripts/host-readiness-runner.sh --once editor-regression
./scripts/host-readiness-runner.sh --once edit-sync
node scripts/visual-real-editor-playwright.mjs <real-project.roughcut>
./scripts/host-readiness-runner.sh --once pane-switch
./scripts/host-readiness-runner.sh --once export-entrypoints
./scripts/host-readiness-runner.sh --once preview-export-parity
```

Point the lab at the artifacts those gates write so the GUI findings can be judged:

```
ROUGH_CUT_PACKAGED_RUNTIME_REPORT=<smoke-dir>/runtime-report.json \
ROUGH_CUT_REAL_EDITOR_REPORT=<real-editor-dir>/real-editor-report.json \
ROUGH_CUT_PANE_SWITCH_REPORT=<pane-switch-dir>/pane-switch-report.json \
ROUGH_CUT_EDIT_SYNC_REPORT=<edit-sync-dir>/editor-recording-edit-sync-report.json \\
pnpm report:regression
```

## Required next evidence

- None — all required regression, packaged-runtime, pane, export, and parity evidence passed.
- The raw RGB SSIM remains in the parity artifact as a diagnostic; luma and per-channel thresholds are the calibrated pass criteria.
