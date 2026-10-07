# Install Rough Cut 0.1.0-beta.9 (Linux x86_64, X11)

Rough Cut is a free screen recorder and editor for Linux. This is a public beta. Download everything from https://github.com/endlessblink/rough-cut/releases/tag/v0.1.0-beta.9

## Before you start

- Linux **x86_64** with **X11** and glibc **2.35 or newer** (for example Ubuntu 22.04 or later). Wayland is not supported. There is no macOS or Windows build.
- Tested on KDE Plasma/X11 with an NVIDIA GPU. Other setups may work but are untested.
- FFmpeg/FFprobe (8.1.3), xdotool, xinput and pactl are bundled. You do not need Node.js or a source checkout. Standard Linux desktop libraries are still required; this is not a server or headless distribution.
- Back up recordings you cannot redo. This is a beta.

## 1. Check the download

Put the file and `SHA256SUMS` in the same folder, then run:

```bash
sha256sum -c SHA256SUMS --ignore-missing
```

The line for your file should say `OK`.

## 2. Install (pick one)

**AppImage (one file)**

```bash
chmod +x Rough-Cut-0.1.0-beta.9-x86_64.AppImage
./Rough-Cut-0.1.0-beta.9-x86_64.AppImage
```

If FUSE is missing: `APPIMAGE_EXTRACT_AND_RUN=1 ./Rough-Cut-0.1.0-beta.9-x86_64.AppImage`

**Debian / Ubuntu package**

```bash
sudo apt install ./Rough-Cut-0.1.0-beta.9-amd64.deb
```

**Portable folder (.tar.gz)**

```bash
tar -xzf rough-cut-0.1.0-beta.9-linux-x64.tar.gz
cd rough-cut-mvp-linux-x64
./run.sh
```

Keep the whole folder together. Replace it with a new download when a new version comes out.

The Chromium sandbox stays on, and the launchers refuse options that turn it off. If the app does not start because of a sandbox error, do not work around it: open an issue with the exact error text.

## 3. First use

1. Open Rough Cut. A new profile may start on the recording setup panel or on the Projects screen. Both are normal.
2. **Record.** Pick the screen or a region. Add a microphone, system audio or camera if you want them. If the microphone or camera is off, the panel tells you; press **Turn on** if that is a mistake. Press **Start recording**. Stop when you are done. The take is saved and opens in **Recording edit**.
3. **Edit.** Screen and sound are linked on one timeline: split, trim, move or delete a stretch and the gap closes for both. Add zoom markers by hand where you want to focus the detail. Style the picture with a background, rounded frame and camera layout.
4. **Export.** Use Export to make an MP4. The file is checked when it finishes before it appears.
5. Your files: recordings and exports go to `~/Documents/Rough Cut MVP`. Settings and logs are in `~/.config/rough-cut-mvp` (log: `logs/app-runtime.log`).

Existing recordings can be reopened from Projects. You can also import a video file from any folder; beta.9 fixes importing a video from outside the projects folder, which failed in beta.8.

**NVIDIA tip:** if recordings show tearing, turn off **Allow Flipping** in nvidia-settings (OpenGL Settings). That fixed it on the tested setup.

## Optional: Claude graphics

Graphics are optional, and everything else works without them. Install the official Claude Code CLI separately and sign in with a Claude plan that includes Claude Code (setup: https://code.claude.com/docs/en/setup). In Graphics, press **Check connection**. When you ask for a graphic, your text and the selected design context are sent to Claude through that CLI. Rough Cut does not store your password or token, and it rejects API-key and alternate billing overrides.

## Privacy and updates

Recording and editing stay on your computer. There is no analytics and no automatic crash upload. Crash reports are off by default; if you turn them on, you see the exact JSON and destination before anything is saved.

Automatic updates are **off**. Update by downloading the next release manually and checking `SHA256SUMS`. Debian users install the new package the same way.

## What feedback helps

- Where it breaks: distro, desktop, X11 session, GPU and driver, plus the relevant lines from the log (remove anything private).
- What was confusing in the first five minutes.
- Whether the exported MP4 looks and sounds the way you expected, and anything out of sync.
- What you would use it for, and what was missing.

Report at https://github.com/endlessblink/rough-cut/issues/new/choose. Security problems go through the private link on that page, not a public issue. Optional support: https://buymeacoffee.com/noamnau. Rough Cut is free under AGPL-3.0; a paid Pro with new features may come later.

## Linux compatibility

Linux x86_64 with X11 and glibc 2.35 or newer is required by the bundled media libraries; AppImage does not remove this requirement. Wayland, macOS and Windows are not supported. Other desktops, GPUs and independent machines are not yet tested.
