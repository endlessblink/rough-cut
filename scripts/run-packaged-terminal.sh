#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_ROOT="$ROOT_DIR/dist/rough-cut-mvp-linux-x64"
REPORT_PATH="${ROUGH_CUT_TERMINAL_REPORT_PATH:-/tmp/rough-cut-terminal-report.json}"
USER_DATA_PATH="${ROUGH_CUT_TERMINAL_USER_DATA:-/tmp/rough-cut-terminal-user-data}"

if [[ ! -x "$ARTIFACT_ROOT/dock-launch.sh" ]]; then
  printf '%s\n' 'Packaged artifact missing. Run: pnpm package:linux' >&2
  exit 1
fi

rm -f "$REPORT_PATH"
printf '[rough-cut-terminal] bundle: '
sed -n '1,12p' "$ARTIFACT_ROOT/resources/app/apps/desktop/dist/renderer/index.html" | sed -n 's/.*src="\.\/assets\/\(index-[^"]*\.js\)".*/\1/p'
printf '[rough-cut-terminal] report: %s\n' "$REPORT_PATH"
printf '[rough-cut-terminal] launch: %s\n' "$ARTIFACT_ROOT/dock-launch.sh"

exec env \
  ROUGH_CUT_DOCK_LAUNCH=1 \
  ROUGH_CUT_PLAYBACK_DEBUG_REPORT_PATH="$REPORT_PATH" \
  "$ARTIFACT_ROOT/dock-launch.sh" \
  --no-sandbox \
  --user-data-dir="$USER_DATA_PATH"
