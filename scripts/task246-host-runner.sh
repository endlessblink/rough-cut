#!/usr/bin/env bash
set -euo pipefail

REPO="/media/endlessblink/data/my-projects/ai-development/content-creation/rough-cut-mvp"
REQUEST_FILE="/tmp/rough-cut-task246-host-runner.request"
STATUS_FILE="/tmp/rough-cut-task246-host-runner.status.json"
LOG_FILE="/tmp/rough-cut-task246-host-runner.log"

cd "$REPO"

export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-/run/user/1000/xauth_Mqgwcs}"

write_status() {
  local status="$1"
  local message="${2:-}"
  printf '{"status":"%s","message":"%s","requestFile":"%s","logFile":"%s","updatedAt":"%s"}\n' \
    "$status" \
    "$(printf '%s' "$message" | sed 's/"/\\"/g')" \
    "$REQUEST_FILE" \
    "$LOG_FILE" \
    "$(date -Is)" > "$STATUS_FILE"
}

write_status "idle" "waiting for request"
echo "[task246-host-runner] watching $REQUEST_FILE"
echo "[task246-host-runner] status: $STATUS_FILE"
echo "[task246-host-runner] log: $LOG_FILE"
echo "[task246-host-runner] trigger with: touch $REQUEST_FILE"

while true; do
  if [[ -f "$REQUEST_FILE" ]]; then
    rm -f "$REQUEST_FILE"
    : > "$LOG_FILE"
    write_status "running" "pnpm smoke:experimental-headless-runtime-export"
    echo "[task246-host-runner] $(date -Is) starting smoke" | tee -a "$LOG_FILE"

    set +e
    pnpm smoke:experimental-headless-runtime-export >> "$LOG_FILE" 2>&1
    code=$?
    set -e

    if [[ "$code" -eq 0 ]]; then
      write_status "passed" "smoke passed"
      echo "[task246-host-runner] $(date -Is) smoke passed" | tee -a "$LOG_FILE"
    else
      write_status "failed" "smoke failed with exit code $code"
      echo "[task246-host-runner] $(date -Is) smoke failed with exit code $code" | tee -a "$LOG_FILE"
    fi
  fi
  sleep 1
done
