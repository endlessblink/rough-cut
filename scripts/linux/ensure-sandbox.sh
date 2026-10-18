#!/usr/bin/env bash
# Rough Cut always runs inside Chromium's sandbox. Ubuntu 24.04 and later block the user
# namespaces that sandbox needs unless an AppArmor rule allows them for the program (the .deb
# installs that rule). For this portable folder: ask once, add the same rule for this folder's
# exact binary (password prompt through pkexec, or sudo in a terminal), then start sandboxed.
# Exit 0 = safe to start; non-zero = do not start (never falls back to running unprotected).
#
# Test hooks: ROUGH_CUT_USERNS_RESTRICT_FILE replaces the kernel setting's path;
# ROUGH_CUT_SANDBOX_DRY_RUN=1 prints the rule and the decision without asking or installing.
set -u

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$DIR/electron"
RESTRICT_FILE="${ROUGH_CUT_USERNS_RESTRICT_FILE:-/proc/sys/kernel/apparmor_restrict_unprivileged_userns}"
PROFILE_NAME="rough-cut-portable"
PROFILE_PATH="/etc/apparmor.d/$PROFILE_NAME"

[[ "$(cat "$RESTRICT_FILE" 2>/dev/null)" == "1" ]] || exit 0

# A root-owned setuid sandbox helper also works on these systems.
HELPER="$DIR/chrome-sandbox"
if [[ -u "$HELPER" && "$(stat -L -c %u "$HELPER" 2>/dev/null)" == "0" ]]; then exit 0; fi

# Already allowed for this exact folder.
grep -qF "\"$BIN\"" "$PROFILE_PATH" 2>/dev/null && exit 0

PROFILE="abi <abi/4.0>,
include <tunables/global>

profile $PROFILE_NAME \"$BIN\" flags=(unconfined) {
  userns,

  include if exists <local/$PROFILE_NAME>
}
"
PROMPT="This version of Linux blocks the protection Rough Cut runs inside. Allow a small system rule just for Rough Cut (the same one the Debian package adds)? Your system will ask for your password once."
DENIED="Rough Cut cannot start without its protection. Nothing was changed. Start it again to allow it, or install the Debian package (.deb), which sets this up during install."

if [[ "${ROUGH_CUT_SANDBOX_DRY_RUN:-}" == "1" ]]; then
  echo "ROUGH_CUT_SANDBOX_PROMPT: $PROMPT"
  printf 'ROUGH_CUT_SANDBOX_PROFILE:\n%s' "$PROFILE"
  exit 0
fi

has_gui() { [[ -n "${DISPLAY:-}" || -n "${WAYLAND_DISPLAY:-}" ]]; }
has_tty() { [[ -t 0 && -t 1 ]]; }
say() {
  echo "$1" >&2
  if has_gui; then
    if command -v zenity >/dev/null 2>&1; then zenity --warning --no-markup --title "Rough Cut" --text "$1" 2>/dev/null || true
    elif command -v kdialog >/dev/null 2>&1; then kdialog --title "Rough Cut" --msgbox "$1" 2>/dev/null || true
    fi
  fi
}
ask_yes() {
  if has_gui && command -v zenity >/dev/null 2>&1; then
    zenity --question --no-markup --title "Rough Cut" --ok-label "Allow" --cancel-label "Quit" --text "$PROMPT" 2>/dev/null
  elif has_gui && command -v kdialog >/dev/null 2>&1; then
    kdialog --title "Rough Cut" --yesno "$PROMPT" 2>/dev/null
  elif has_tty; then
    local reply; read -r -p "$PROMPT [Y/n] " reply; [[ -z "$reply" || "$reply" =~ ^[Yy] ]]
  else
    return 0  # no way to ask: pkexec's own password prompt is the confirmation
  fi
}

ask_yes || { say "$DENIED"; exit 65; }

SOURCE="$(mktemp)"
trap 'rm -f "$SOURCE"' EXIT
printf '%s' "$PROFILE" > "$SOURCE"
INSTALL='install -m 0644 "$1" "$2" && apparmor_parser --replace --write-cache --skip-read-cache "$2"'
if [[ $EUID -eq 0 ]]; then
  sh -c "$INSTALL" sh "$SOURCE" "$PROFILE_PATH" && exit 0
elif has_gui && command -v pkexec >/dev/null 2>&1; then
  pkexec sh -c "$INSTALL" sh "$SOURCE" "$PROFILE_PATH" && exit 0
elif has_tty && command -v sudo >/dev/null 2>&1; then
  sudo sh -c "$INSTALL" sh "$SOURCE" "$PROFILE_PATH" && exit 0
fi
say "$DENIED"
exit 65
