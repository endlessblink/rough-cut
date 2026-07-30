#!/usr/bin/env bash
# Kept as the compatibility target for older desktop/dock shortcuts. GUI launches
# don't source ~/.bashrc, so pnpm's directory (~/.npm-global/bin) is not on
# PATH here — add the known tool locations explicitly. All output goes to a
# log file because the shortcut runs with Terminal=false (failures would
# otherwise be silent).
set -euo pipefail

export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$HOME/bin:$PATH"

LOG_DIR="$HOME/.cache/rough-cut-mvp"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/launch.log"

cd "$(dirname "${BASH_SOURCE[0]}")/.."

{
  echo "=== launch $(date '+%Y-%m-%d %H:%M:%S') ==="
  echo "PATH=$PATH"
} >> "$LOG_FILE"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found on PATH" >> "$LOG_FILE"
  command -v notify-send >/dev/null 2>&1 \
    && notify-send "Rough Cut MVP" "Launch failed: pnpm not found. See $LOG_FILE"
  exit 127
fi

APP_ROOT="$PWD/dist/rough-cut-mvp-linux-x64"
if [[ ! -x "$APP_ROOT/run.sh" ]]; then
  echo "Packaged app missing: $APP_ROOT/run.sh" >> "$LOG_FILE"
  command -v notify-send >/dev/null 2>&1 \
    && notify-send "Rough Cut MVP" "Packaged app missing. Rebuild Rough Cut first."
  exit 1
fi

# Keep the legacy dock launcher name, but always hand off to the packaged app.
exec "$APP_ROOT/run.sh" >> "$LOG_FILE" 2>&1
