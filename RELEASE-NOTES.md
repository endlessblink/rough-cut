# Rough Cut 0.1.0-beta.9 — Linux beta

Free screen recorder and editor for Linux (x86_64, X11). Pre-release. All checksums are in `SHA256SUMS` on the release; the exact source commit is in `package-identity.json` and `SOURCE-MANIFEST.json`.

## What changed since beta.8

- **Fix: importing a video from outside the projects folder.** In beta.8, Projects → Import on a video stored in another folder created the project but then failed with "Project path is outside the allowed projects directory" and the editor never opened. Beta.9 opens a project you imported or opened yourself from the folder you chose. A regression test covers it.
- **Fix: recording from the Recording tab.** Pressing Start now hides the Rough Cut window for the whole take (as the separate recorder does), so the recording shows your other apps instead of Rough Cut itself. The window comes back with the editor when you stop.
- Nothing else in the application changed. The same Electron 43.7.7, bundled media tools and notices as beta.8.

## What this release is

The AppImage, Debian package and portable archive share one package identity. The earlier `v0.1.0-beta` and `v0.1.0-beta.8` releases stay up unchanged.

Since the first public beta (`0.1.0-beta`):

- **Electron 43.7.7.** The first beta shipped Electron 35, which is out of support.
- **Chromium sandbox required.** Every shipped launcher starts with the sandbox on and refuses arguments that disable it.
- **Media tools bundled.** FFmpeg and FFprobe (8.1.3), xdotool, xinput and pactl ship inside the package with their libraries and notices.
- **Complete notices and source.** Full licence notices (including embedded fonts), the matching application source archive, the media-tool source archive and a source manifest are attached to the release.
- **Editing and recording:** camera and preview timing fixes, linked screen/audio edits, signed stereo waveforms, a resizable Audio lane.
- **Quieter voices are levelled on export** toward -16 LUFS with capped gain and peak limiting. Exports that are already loud enough, and byte-equal copies, are left untouched.
- **Optional Claude connection check.** In Graphics, "Check connection" explains a missing CLI, an unsupported login route or a missing subscription. Checking does not generate anything.

## Known limitations

- Linux x86_64 with X11 and glibc 2.35 or newer only. No Wayland, macOS or Windows build.
- Tested on KDE Plasma/X11 with an NVIDIA GPU. Other desktops, GPUs and independent machines are not yet tested. On NVIDIA, turning off **Allow Flipping** in nvidia-settings prevented capture tearing on the tested setup.
- Zoom is manual (markers on a lane). Automatic zoom is not part of this beta.
- Transparent graphics-only export and arbitrary export In/Out are not available.
- Graphics are optional and need the official Claude Code CLI plus a Claude plan that includes it. Release checks used offline test graphics; no live model request was made during verification.
- Long recordings and acceptance on a second machine are still open. Back up recordings you cannot redo.
- Automatic updates are **off**. Update by downloading the next release manually and checking `SHA256SUMS`. Update-metadata signing is not part of this release.
- The window and desktop entry still say "Rough Cut MVP".

## Install and feedback

See `INSTALL.md`. Verify the checksum first. Report problems at https://github.com/endlessblink/rough-cut/issues/new/choose (distro, desktop and GPU help most). Security reports go through the private advisory link on that page. Optional support: https://buymeacoffee.com/noamnau. Everything, including the graphics tool, is free under AGPL-3.0; a paid Pro with new features may come later.
