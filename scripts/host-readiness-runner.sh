#!/usr/bin/env bash
set -euo pipefail

REPO="/media/endlessblink/data/my-projects/ai-development/content-creation/rough-cut-mvp"
REQUEST_FILE="${ROUGH_CUT_HOST_READINESS_REQUEST_FILE:-/tmp/rough-cut-host-readiness-runner.request}"
STATUS_FILE="${ROUGH_CUT_HOST_READINESS_STATUS_FILE:-/tmp/rough-cut-host-readiness-runner.status.json}"
LOG_FILE="${ROUGH_CUT_HOST_READINESS_LOG_FILE:-/tmp/rough-cut-host-readiness-runner.log}"

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
    nle-linked)
      pnpm --filter @rough-cut/project-model build
      pnpm --filter @rough-cut/desktop build
      node scripts/visual-nle-linked-clips-playwright.mjs
      ;;
    nle-export-parity)
      pnpm visual:nle-export-parity
      ;;
    smoke-styled-export)
      pnpm smoke:styled-export
      ;;
    smoke-package)
      pnpm smoke:package
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
      pnpm smoke:ui
      pnpm playback:timeline
      pnpm --filter @rough-cut/project-model build
      pnpm --filter @rough-cut/desktop build
      node scripts/visual-nle-linked-clips-playwright.mjs
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
      echo "Allowed: smoke-ui playback-timeline nle-linked nle-export-parity smoke-styled-export smoke-package canvas2d-fallback full-readiness" >&2
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
