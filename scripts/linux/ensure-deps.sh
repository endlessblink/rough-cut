#!/usr/bin/env bash
# Rough Cut: make sure ffmpeg, ffprobe, xdotool and xinput exist before the app starts.
# Missing tools -> one clear prompt -> installed with the system package manager
# (graphical password prompt through pkexec, or sudo in a terminal). Never fatal:
# if anything is declined or fails, the app still starts and its own pre-record
# check shows the exact command.
#
# Test hooks: ROUGH_CUT_SKIP_DEP_CHECK=1 skips everything; ROUGH_CUT_DEP_DRY_RUN=1 prints
# the prompt and the install command without asking or installing.
set -u

[[ "${ROUGH_CUT_SKIP_DEP_CHECK:-}" == "1" ]] && exit 0

REQUIRED=(ffmpeg ffprobe xdotool xinput)
MISSING=()
for tool in "${REQUIRED[@]}"; do
  command -v "$tool" >/dev/null 2>&1 || MISSING+=("$tool")
done
[[ ${#MISSING[@]} -eq 0 ]] && exit 0

# Pick the package manager and the package names it uses (ffprobe ships inside ffmpeg).
PM=""; PKGS=(); INSTALL_CMD=()
add_pkg() { local p; for p in "$@"; do [[ " ${PKGS[*]:-} " == *" $p "* ]] || PKGS+=("$p"); done; }
for tool in "${MISSING[@]}"; do
  case "$tool" in
    ffmpeg|ffprobe) add_pkg ffmpeg ;;
    xdotool) add_pkg xdotool ;;
    xinput) add_pkg xinput ;;
  esac
done
if command -v apt-get >/dev/null 2>&1; then
  PM=apt; INSTALL_CMD=(apt-get install -y)
elif command -v dnf >/dev/null 2>&1; then
  PM=dnf; INSTALL_CMD=(dnf install -y)
  PKGS=("${PKGS[@]/ffmpeg/ffmpeg-free}")
elif command -v pacman >/dev/null 2>&1; then
  PM=pacman; INSTALL_CMD=(pacman -S --needed --noconfirm)
  PKGS=("${PKGS[@]/xinput/xorg-xinput}")
elif command -v zypper >/dev/null 2>&1; then
  PM=zypper; INSTALL_CMD=(zypper --non-interactive install)
fi

MISSING_TEXT="${MISSING[*]}"
if [[ -z "$PM" ]]; then
  MSG="Rough Cut needs these tools to record and export: ${MISSING_TEXT}. This system's package manager isn't one we can drive (apt, dnf, pacman, zypper). Install ffmpeg, xdotool and xinput with your distribution's package manager, then start Rough Cut again."
  echo "$MSG" >&2
  if [[ -n "${DISPLAY:-}" ]]; then
    if command -v zenity >/dev/null 2>&1; then zenity --warning --no-markup --title "Rough Cut" --text "$MSG" 2>/dev/null || true
    elif command -v kdialog >/dev/null 2>&1; then kdialog --title "Rough Cut" --msgbox "$MSG" 2>/dev/null || true
    fi
  fi
  exit 0
fi

# The command is shown exactly as it would be typed, so a failure is never a dead end.
case "$PM" in
  apt) TYPED="sudo apt install ${PKGS[*]}" ;;
  dnf) TYPED="sudo dnf install ${PKGS[*]}" ;;
  pacman) TYPED="sudo pacman -S ${PKGS[*]}" ;;
  zypper) TYPED="sudo zypper install ${PKGS[*]}" ;;
esac
PROMPT="Rough Cut needs a few helper tools to record and export (missing: ${MISSING_TEXT}). Install them now? Your system will ask for your password."

if [[ "${ROUGH_CUT_DEP_DRY_RUN:-}" == "1" ]]; then
  echo "ROUGH_CUT_PROMPT: ${PROMPT}"
  echo "ROUGH_CUT_INSTALL_COMMAND: ${TYPED}"
  exit 0
fi

has_gui() { [[ -n "${DISPLAY:-}" || -n "${WAYLAND_DISPLAY:-}" ]]; }
has_tty() { [[ -t 0 && -t 1 ]]; }

ask_yes() {
  if has_gui && command -v zenity >/dev/null 2>&1; then
    zenity --question --no-markup --title "Rough Cut" --ok-label "Install" --cancel-label "Not now" --text "$PROMPT" 2>/dev/null
  elif has_gui && command -v kdialog >/dev/null 2>&1; then
    kdialog --title "Rough Cut" --yesno "$PROMPT" 2>/dev/null
  elif has_tty; then
    local reply; read -r -p "$PROMPT [Y/n] " reply; [[ -z "$reply" || "$reply" =~ ^[Yy] ]]
  else
    return 0  # no way to ask (launched from a desktop icon without a dialog tool): pkexec's own password prompt is the confirmation
  fi
}

fail_note() {
  echo "Couldn't install the helper tools automatically. To do it by hand: ${TYPED}" >&2
  if has_gui; then
    local msg="Couldn't install the helper tools automatically. To do it by hand, run: ${TYPED}"
    if command -v zenity >/dev/null 2>&1; then zenity --warning --no-markup --title "Rough Cut" --text "$msg" 2>/dev/null || true
    elif command -v kdialog >/dev/null 2>&1; then kdialog --title "Rough Cut" --msgbox "$msg" 2>/dev/null || true
    fi
  fi
}

ask_yes || exit 0

if [[ $EUID -eq 0 ]]; then
  [[ "$PM" == "apt" ]] && { apt-get update -qq >/dev/null 2>&1 || true; }
  "${INSTALL_CMD[@]}" "${PKGS[@]}" || fail_note
elif has_gui && command -v pkexec >/dev/null 2>&1; then
  # apt metadata refresh and install in one authorised step
  if [[ "$PM" == "apt" ]]; then
    pkexec sh -c 'apt-get update -qq; apt-get install -y "$@"' sh "${PKGS[@]}" || fail_note
  else
    pkexec "${INSTALL_CMD[@]}" "${PKGS[@]}" || fail_note
  fi
elif has_tty && command -v sudo >/dev/null 2>&1; then
  sudo "${INSTALL_CMD[@]}" "${PKGS[@]}" || fail_note
else
  fail_note
fi

# Report only what is still missing; the app's own check handles the rest.
for tool in "${REQUIRED[@]}"; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Still missing: $tool" >&2; exit 0; }
done
exit 0
