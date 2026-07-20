#!/usr/bin/env bash
# Launched by the desktop/dock shortcut (Rough Cut MVP.desktop). GUI launches
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

# pnpm dev handles stale-process cleanup itself (predev-cleanup), so clicking
# the shortcut while the app is already running restarts it cleanly.
exec pnpm dev >> "$LOG_FILE" 2>&1
