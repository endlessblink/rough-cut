# Rough Cut

**Linux beta — 0.1.0-beta.8.** A free screen recorder and editor for tutorials, demos and product walkthroughs. Record your screen, edit linked screen and audio on one timeline, style the picture and export an MP4.

![Rough Cut: the Recording edit view with screen, camera, zoom and timeline](docs/site/assets/proof-zoom.webp)

The public [feature demos](https://endlessblink.github.io/rough-cut/) show recording edits, zoom and optional graphics. The newer correction candidate still requires fresh packaged verification.

## What you can do

- Record a display, window area or region, with optional microphone, system audio and camera.
- Seek, split, trim, move and remove linked screen/audio clips. Undo and restore edits.
- Inspect signed stereo waveforms, resize the Audio lane, and zoom into detailed source windows.
- Add manual zooms, styled cursors, click emphasis, backgrounds, rounded frames and camera layouts.
- Choose landscape, portrait or square compositions and adjust the output size.
- Hide sensitive regions with solid or pixelated censors.
- Add optional Claude-made animated graphics over your video; edit their exposed text/colour fields and timing.
- Export MP4 with picture and audio. Output is validated before the final file is exposed.

**Automatic zoom is deferred to the next version.** Existing experimental code is not a release promise. Transparent graphics-only export is also not available in this beta.

## Download and install

Linux **x86_64 / X11** only. Published downloads and their checksums are listed on [GitHub Releases](https://github.com/endlessblink/rough-cut/releases). There are no macOS or Windows builds yet.

See [INSTALL.md](INSTALL.md) for exact filenames and commands. FFmpeg/FFprobe, xdotool, xinput and pactl are bundled, with their private libraries and notices. Node.js, pnpm and a source checkout are not needed to run the app. Standard Linux desktop libraries are required. Optional Claude and transcription engines/models are separate.

Tested on KDE Plasma/X11 with NVIDIA. Other desktops/GPUs and independent machines still need acceptance testing. On NVIDIA, disabling **Allow Flipping** in nvidia-settings has prevented capture tearing on the tested setup. This is a beta; back up recordings you cannot redo.

## First run

Open the recording setup, choose the screen and optional audio/camera sources, then Start. Stop saves the take and opens Recording edit. Make your edits, inspect the preview and use Export. Existing recordings can be reopened without recording again.

## Privacy and optional Claude graphics

Recording and editing stay local. There is no analytics service or automatic crash upload. Help → Crash reports is off by default; each local JSON export shows its exact contents and destination before you choose to save. This beta has no approved submission destination.

Public update checks are disabled. The approved destination is GitHub Releases at `endlessblink/rough-cut`. The isolated candidate adds custom Ed25519 publisher metadata verification around electron-updater 6.8.9; the owner-supplied public key is pinned in this source, while genuine signed-release acceptance and activation remain pending. Debian updates currently require a separately downloaded package.

Graphics use the official Claude Code CLI through your own Claude subscription/login. The app checks the connection and rejects API-key/billing-route overrides. It does not collect passwords or tokens. Graphic prompts and design context are sent to Claude only when you request generation; recent requests/answers are kept in local diagnostics. Your subscription limits apply. See [CLAUDE-SETUP.md](CLAUDE-SETUP.md).

Optional local transcription requires a compatible engine and model; these are not installed or bundled. See [CONTRIBUTING.md](CONTRIBUTING.md) for configuration. Recordings/exports default below `~/Documents/Rough Cut MVP`; settings and logs use the Linux configuration directory.

## Source, support and license

Release artifacts must be accompanied by the exact application source and media-tool corresponding-source archives, SHA256SUMS and license notices. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [docs/MEDIA-SOURCE-BUILD.md](docs/MEDIA-SOURCE-BUILD.md).

Report issues on [GitHub](https://github.com/endlessblink/rough-cut/issues), after reviewing attachments for private content. Development instructions: [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md).

If Rough Cut helps your work, you can [support Noam on Buy Me a Coffee](https://buymeacoffee.com/noamnau). Support is optional; the app remains free.

Copyright (C) 2026 Noam Naumovsky. Free software under [AGPL-3.0-only](LICENSE), including the graphics tool.

## Linux beta compatibility

Linux x86_64 with X11 and glibc 2.35 or newer is required by the bundled media libraries. AppImage does not remove this ABI requirement. Wayland, macOS and independent-machine compatibility are not certified by this candidate.

A manual beta download with published checksums and corresponding source can be released with the updater disabled. Creating or pinning a publisher signing key is required for updater activation, not for manual beta installation. Hardware acceptance and publication approval are separate release gates.
