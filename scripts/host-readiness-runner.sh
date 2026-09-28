#!/usr/bin/env bash
set -euo pipefail

REPO="/media/endlessblink/data/my-projects/ai-development/content-creation/rough-cut-mvp"
REQUEST_FILE="${ROUGH_CUT_HOST_READINESS_REQUEST_FILE:-/tmp/rough-cut-host-readiness-runner.request}"
STATUS_FILE="${ROUGH_CUT_HOST_READINESS_STATUS_FILE:-/tmp/rough-cut-host-readiness-runner.status.json}"
LOG_FILE="${ROUGH_CUT_HOST_READINESS_LOG_FILE:-/tmp/rough-cut-host-readiness-runner.log}"
REAL_PROJECT_PATH="${ROUGH_CUT_REAL_PROJECT_PATH:-/home/endlessblink/Documents/Rough Cut MVP/recordings/rough-cut-2026-07-25T12-18-16-524Z.roughcut}"

cd "$REPO"

export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-/run/user/1000/xauth_Mqgwcs}"

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

write_status() {
  local status="$1"
  local gate="${2:-}"
  local message="${3:-}"
  printf '{"status":"%s","gate":"%s","message":"%s","requestFile":"%s","logFile":"%s","updatedAt":"%s"}\n' \
    "$(json_escape "$status")" \
    "$(json_escape "$gate")" \
    "$(json_escape "$message")" \
    "$(json_escape "$REQUEST_FILE")" \
    "$(json_escape "$LOG_FILE")" \
    "$(date -Is)" > "$STATUS_FILE"
}

run_gate() {
  local gate="$1"
  case "$gate" in
    smoke-ui)
      pnpm smoke:ui
      ;;
    playback-timeline)
      pnpm playback:timeline
      ;;
    nle-export-parity)
      pnpm visual:nle-export-parity
      ;;
    smoke-styled-export)
      pnpm smoke:styled-export
      ;;
    smoke-package)
      ROUGH_CUT_DOCK_LAUNCH=1 pnpm smoke:package
      ;;
    regression-lab)
      pnpm test:regression-lab
      ;;
    real-editor)
      node scripts/visual-real-editor-playwright.mjs "$REAL_PROJECT_PATH"
      ;;
    restore-control)
      node scripts/visual-restore-control-playwright.mjs "$REAL_PROJECT_PATH"
      ;;
    recording-editor-interactions)
      ROUGH_CUT_DOCK_LAUNCH=1 node scripts/recording-editor-interactions-playwright.mjs "$REAL_PROJECT_PATH"
      local interaction_code=$?
      if [[ "$interaction_code" -ne 0 ]]; then return "$interaction_code"; fi
      local dock_profile="/tmp/rough-cut-directive-dock-user-$$-$(date +%s)"
      local dock_log="/tmp/rough-cut-directive-dock-$$.log"
      ROUGH_CUT_DOCK_LAUNCH=1 ROUGH_CUT_UI_SMOKE_PROJECT_PATH="$REAL_PROJECT_PATH" nohup "$REPO/dist/rough-cut-mvp-linux-x64/dock-launch.sh" --user-data-dir="$dock_profile" >"$dock_log" 2>&1 </dev/null &
      ;;
    export-entrypoints)
      pnpm visual:export-entrypoints "$REAL_PROJECT_PATH"
      ;;
    preview-export-parity)
      pnpm visual:preview-export-parity "$REAL_PROJECT_PATH"
      ;;
    canvas2d-fallback)
      ROUGH_CUT_DISABLE_WEBGPU_DEFAULT=1 \
      VITE_ROUGH_CUT_DISABLE_WEBGPU_DEFAULT=1 \
      ROUGH_CUT_EXPECT_SCREEN_LAYER_RENDERER=canvas2d \
      ROUGH_CUT_PLAYBACK_PROJECT_PATH='/home/endlessblink/Documents/Rough Cut MVP/recordings/rough-cut-2026-06-02T15-49-33-067Z.roughcut' \
      ROUGH_CUT_PLAYBACK_SEEK_SEC=77 \
      ROUGH_CUT_PLAYBACK_CORRECTNESS_ONLY=1 \
      ROUGH_CUT_PLAYBACK_ADVANCE_SEC=0.5 \
      ROUGH_CUT_PLAYBACK_VIEW=recording \
      pnpm playback:timeline
      ;;
    full-readiness)
      pnpm test:regression-lab
      pnpm visual:export-entrypoints "$REAL_PROJECT_PATH"
      pnpm visual:preview-export-parity "$REAL_PROJECT_PATH"
      pnpm smoke:ui
      pnpm playback:timeline
      pnpm visual:nle-export-parity
      pnpm smoke:styled-export
      pnpm smoke:package
      ROUGH_CUT_DISABLE_WEBGPU_DEFAULT=1 \
      VITE_ROUGH_CUT_DISABLE_WEBGPU_DEFAULT=1 \
      ROUGH_CUT_EXPECT_SCREEN_LAYER_RENDERER=canvas2d \
      ROUGH_CUT_PLAYBACK_PROJECT_PATH='/home/endlessblink/Documents/Rough Cut MVP/recordings/rough-cut-2026-06-02T15-49-33-067Z.roughcut' \
      ROUGH_CUT_PLAYBACK_SEEK_SEC=77 \
      ROUGH_CUT_PLAYBACK_CORRECTNESS_ONLY=1 \
      ROUGH_CUT_PLAYBACK_ADVANCE_SEC=0.5 \
      ROUGH_CUT_PLAYBACK_VIEW=recording \
      pnpm playback:timeline
      ;;
    *)
      echo "Unknown readiness gate: $gate" >&2
    echo "Allowed: smoke-ui playback-timeline nle-export-parity smoke-styled-export smoke-package regression-lab real-editor restore-control recording-editor-interactions export-entrypoints preview-export-parity canvas2d-fallback full-readiness" >&2
      return 64
      ;;
  esac
}

run_requested_gate() {
  local gate="$1"
  : > "$LOG_FILE"
  write_status "running" "$gate" "started"
  echo "[host-readiness-runner] $(date -Is) starting $gate" | tee -a "$LOG_FILE"

  set +e
  run_gate "$gate" >> "$LOG_FILE" 2>&1
  local code=$?
  set -e

  if [[ "$code" -eq 0 ]]; then
    write_status "passed" "$gate" "gate passed"
    echo "[host-readiness-runner] $(date -Is) $gate passed" | tee -a "$LOG_FILE"
  else
    write_status "failed" "$gate" "gate failed with exit code $code"
    echo "[host-readiness-runner] $(date -Is) $gate failed with exit code $code" | tee -a "$LOG_FILE"
  fi
  return "$code"
}

if [[ "${1:-}" == "--once" ]]; then
  if [[ -z "${2:-}" ]]; then
    echo "Usage: $0 --once <gate>" >&2
    exit 2
  fi
  run_requested_gate "$2"
  exit $?
fi

write_status "idle" "" "waiting for request"
echo "[host-readiness-runner] watching $REQUEST_FILE"
echo "[host-readiness-runner] status: $STATUS_FILE"
echo "[host-readiness-runner] log: $LOG_FILE"
echo "[host-readiness-runner] request with: printf '%s\\n' smoke-package > $REQUEST_FILE"

while true; do
  if [[ -f "$REQUEST_FILE" ]]; then
    gate="$(tr -d '\r\n' < "$REQUEST_FILE")"
    rm -f "$REQUEST_FILE"
    run_requested_gate "$gate" || true
  fi
  sleep 1
done
