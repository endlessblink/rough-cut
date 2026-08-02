#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HELPER="$ROOT_DIR/dist/rough-cut-mvp-linux-x64/chrome-sandbox"
APP_ROOT="$ROOT_DIR/dist/rough-cut-mvp-linux-x64"
APPLICATIONS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
DESKTOP_ENTRY="$APPLICATIONS_DIR/rough-cut-mvp.desktop"
PINNED_ENTRIES=(
  "$HOME/.local/share/plasma_icons/rough-cut-mvp (1).desktop"
  "$HOME/.local/share/plasma_icons/rough-cut-mvp.desktop"
)
ICON_PATH="$ROOT_DIR/apps/desktop/assets/rough-cut-mvp-icon.png"

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

mkdir -p "$APPLICATIONS_DIR"
cat > "$DESKTOP_ENTRY" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Rough Cut MVP
Comment=Launch the Rough Cut editor
Path=$APP_ROOT
Exec=$APP_ROOT/dock-launch.sh
Icon=$ICON_PATH
Terminal=false
Categories=AudioVideo;Video;
StartupNotify=true
StartupWMClass=@rough-cut/desktop
EOF

for PINNED_ENTRY in "${PINNED_ENTRIES[@]}"; do
  [[ -f "$PINNED_ENTRY" ]] || continue
  sed -i \
    -e "s#^Comment=.*#Comment=Launch the Rough Cut editor#" \
    -e "s#^Path=.*#Path=$APP_ROOT#" \
    -e "s#^Exec=.*#Exec=env ROUGH_CUT_DOCK_LAUNCH=1 $APP_ROOT/dock-launch.sh#" \
    "$PINNED_ENTRY"
  if ! grep -q 'ROUGH_CUT_DOCK_LAUNCH=1 .*\/dist\/rough-cut-mvp-linux-x64\/dock-launch.sh' "$PINNED_ENTRY"; then
    printf 'Pinned dock entry verification failed: %s\n' "$PINNED_ENTRY" >&2
    exit 1
  fi
done

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APPLICATIONS_DIR" >/dev/null 2>&1 || true
fi

printf 'Dock package ready: %s\nDesktop entry: %s\n' "$ACTUAL" "$DESKTOP_ENTRY"
