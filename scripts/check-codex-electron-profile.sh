#!/usr/bin/env bash
set -euo pipefail

REPO="/media/endlessblink/data/my-projects/ai-development/content-creation/rough-cut-mvp"

echo "== Strict profile config check =="
codex --strict-config --profile electron-test --help >/tmp/codex-electron-profile-help.out
echo "profile accepted"

echo
echo "== Host sandbox status =="
cd "$REPO"
scripts/diagnose-codex-sandbox.sh

echo
echo "== Host Electron preflight =="
env ELECTRON_DISABLE_SANDBOX=1 ELECTRON_DISABLE_SECURITY_WARNINGS=true node_modules/.pnpm/electron@35.7.5/node_modules/electron/dist/electron --no-sandbox --disable-setuid-sandbox --disable-gpu-sandbox --disable-dev-shm-usage --version

echo
echo "Launch new Codex with:"
echo "codex --profile electron-test -C $REPO"
