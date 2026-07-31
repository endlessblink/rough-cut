#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HELPER="$ROOT_DIR/dist/rough-cut-mvp-linux-x64/chrome-sandbox"
APP_ROOT="$ROOT_DIR/dist/rough-cut-mvp-linux-x64"
APPLICATIONS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
DESKTOP_ENTRY="$APPLICATIONS_DIR/rough-cut-mvp.desktop"
ICON_PATH="$ROOT_DIR/apps/desktop/assets/rough-cut-mvp-icon.png"

cd "$ROOT_DIR"
bash scripts/setup-hebrew-transcription.sh
if [[ -z "${ROUGH_CUT_FREECUT_DIST:-}" ]]; then
  printf 'ROUGH_CUT_FREECUT_DIST must point to a built FreeCut dist folder before preparing the dock package.\n' >&2
  exit 1
fi
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

mkdir -p "$APPLICATIONS_DIR"
cat > "$DESKTOP_ENTRY" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Rough Cut MVP
Comment=Launch the Rough Cut editor
Path=$APP_ROOT
Exec=$APP_ROOT/run.sh
Icon=$ICON_PATH
Terminal=false
Categories=AudioVideo;Video;
StartupNotify=true
StartupWMClass=@rough-cut/desktop
EOF

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APPLICATIONS_DIR" >/dev/null 2>&1 || true
fi

printf 'Dock package ready: %s\nDesktop entry: %s\n' "$ACTUAL" "$DESKTOP_ENTRY"
