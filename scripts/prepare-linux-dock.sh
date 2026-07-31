#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HELPER="$ROOT_DIR/dist/rough-cut-mvp-linux-x64/chrome-sandbox"

cd "$ROOT_DIR"
bash scripts/setup-hebrew-transcription.sh
pnpm package:linux

if [[ "$(stat -Lc '%U:%G %a' "$HELPER" 2>/dev/null || true)" != 'root:root 4755' ]]; then
  sudo chown root:root "$HELPER"
  sudo chmod 4755 "$HELPER"
fi

EXPECTED='root:root 4755'
ACTUAL="$(stat -Lc '%U:%G %a' "$HELPER")"
if [[ "$ACTUAL" != "$EXPECTED" ]]; then
  printf 'Sandbox helper verification failed: expected %s, got %s\n' "$EXPECTED" "$ACTUAL" >&2
  exit 1
fi

printf 'Dock package ready: %s\n' "$ACTUAL"
