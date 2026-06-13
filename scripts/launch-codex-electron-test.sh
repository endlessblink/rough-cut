#!/usr/bin/env bash
set -euo pipefail

REPO="/media/endlessblink/data/my-projects/ai-development/content-creation/rough-cut-mvp"

cd "$REPO"

exec codex --profile electron-test -C "$REPO" \
  "Continue TASK-246 in this repo. Before doing any code edits, run these diagnostics in order:

1. scripts/diagnose-codex-sandbox.sh
2. env ELECTRON_DISABLE_SANDBOX=1 ELECTRON_DISABLE_SECURITY_WARNINGS=true node_modules/.pnpm/electron@35.7.5/node_modules/electron/dist/electron --no-sandbox --disable-setuid-sandbox --disable-gpu-sandbox --disable-dev-shm-usage --version

If Electron prints v35.7.5, continue TASK-246 by running scripts/run-task246-host-smoke.sh or pnpm smoke:experimental-headless-runtime-export, inspect the latest /tmp/rough-cut-headless-runtime-export-* artifact, and fix the first real runtime failure. Current known host-run evidence: Electron launches and wrote 30 frame PNGs, but they were 1919x1079 instead of expected 1920x1080. Do not mark TASK-246 complete until fallbackActive=false, headlessRenderOk=true, and nonzero headlessFrameArtifacts are proven."
