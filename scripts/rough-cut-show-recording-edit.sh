#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_RUNNER="$ROOT_DIR/dist/rough-cut-mvp-linux-x64/run.sh"

if [[ ! -x "$APP_RUNNER" ]]; then
  echo '[rough-cut] packaged app is missing; run rough-cut-dock-reset first' >&2
  exit 1
fi

pkill -f '/dist/rough-cut-mvp-linux-x64/electron' 2>/dev/null || true
sleep 2
echo '[rough-cut] launching packaged Recording edit baseline'
exec env ROUGH_CUT_STARTUP_VIEW=editor ROUGH_CUT_DOCK_LAUNCH=1 "$APP_RUNNER" "$@"
