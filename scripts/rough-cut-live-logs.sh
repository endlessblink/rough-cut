#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_PATH="${ROUGH_CUT_RUNTIME_LOG_PATH:-$ROOT_DIR/.logs/app-runtime.log}"

if [[ ! -f "$LOG_PATH" ]]; then
  printf 'Runtime log is not present yet: %s\nLaunch Rough Cut from the dock, then run this command again.\n' "$LOG_PATH" >&2
  exit 1
fi

printf 'Following Rough Cut runtime log: %s\n' "$LOG_PATH"
printf 'Look for [renderer:*], FreeCut bootstrap/probe messages, load failures, and render-process-gone events.\n'
exec tail -n 0 -F "$LOG_PATH"
