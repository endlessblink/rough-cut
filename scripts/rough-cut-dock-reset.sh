#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo '[rough-cut] packaging current build'
pnpm package:linux

echo '[rough-cut] stopping packaged instances'
pkill -f '/dist/rough-cut-mvp-linux-x64/electron' 2>/dev/null || true
sleep 2

echo '[rough-cut] refreshing Plasma launcher cache'
kbuildsycoca6 --noincremental >/tmp/rough-cut-kbuildsycoca6.log 2>&1 || true
kquitapp6 plasmashell >/dev/null 2>&1 || true
nohup plasmashell --replace >/tmp/rough-cut-plasmashell.log 2>&1 &
sleep 3

echo '[rough-cut] ready: click the Rough Cut taskbar icon now'
sleep 2
if pgrep -f '/dist/rough-cut-mvp-linux-x64/electron' >/dev/null; then
  echo '[rough-cut] packaged process detected'
else
  echo '[rough-cut] no packaged process yet; click the refreshed icon'
fi
