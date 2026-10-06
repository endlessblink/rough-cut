# Install the isolated Linux candidate

Candidate: **0.1.0-beta.8**, Electron **43.7.7**, Linux x86_64/X11. ffmpeg/ffprobe (8.1.3-roughcut-source1), xdotool, xinput and pactl are bundled. Node.js, pnpm, source checkout and host media-tool packages are unnecessary for installed builds. Standard Linux desktop libraries are still required; this is not a server/headless distribution. Wayland is not supported.

This is a local pre-release candidate. Public release, production signing and actual recording-device/user acceptance remain pending; corresponding source is supplied as a separately verified archive; see `docs/RELEASE-REQUIREMENTS.md` in the source snapshot.

## AppImage

Verify the supplied SHA256 first, then:

```bash
chmod +x Rough-Cut-0.1.0-beta.8-x86_64.AppImage
./Rough-Cut-0.1.0-beta.8-x86_64.AppImage
```

If FUSE is unavailable, the AppImage runtime can extract and run without mounting:

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./Rough-Cut-0.1.0-beta.8-x86_64.AppImage
```

Keep the image in a writable directory for in-app updates. The Chromium sandbox remains required. Do not pass sandbox-disabling flags or change host security settings to force a failed launch. Report the exact startup error instead. AppImage compatibility still needs independent Linux-machine verification.

## Debian / Ubuntu

The `.deb` declares standard desktop-library dependencies and installs a launcher. After verification, ordinary package-manager installation resolves those libraries:

```bash
sudo apt install ./Rough-Cut-0.1.0-beta.8-amd64.deb
```

The app does not invoke sudo or modify package-manager security. Debian builds use package-manager updates; an approved signed repository has not been configured.

## Portable folder

Keep the whole extracted folder together and run `./run.sh`. It enables the sandbox and rejects disabling arguments. The portable folder has no automatic updater; replace it with a separately verified new download after closing the app.

## Updates, reports and recordings

The native Help menu is available from the menu bar (Alt on Linux). AppImage supports approved-feed checking/downloading and explicit restart to install. **GitHub Releases at `endlessblink/rough-cut` is the approved destination. Checks remain disabled (`activated:false`) until an owner-approved publisher public key is pinned and signed release metadata/install acceptance are ready.** It keeps a verified `.previous` image beside the application and provides explicit restore. Installation/restore are blocked during recording, finalization or export; save work before restarting.

Help → Crash reports is **off by default**. Opt-in holds one minimal crash event in memory. Every local export first shows the chosen destination and exact JSON and offers Cancel. No automatic uploads, minidumps, recordings, project content, paths, stack traces or user identifiers are included. Main-process crashes cannot preserve an in-memory event across application termination.

Recordings and exports default below `~/Documents/Rough Cut MVP`. Settings/logs use the usual Linux application configuration directory. Existing projects/settings are not replaced by application updates. Optional Claude CLI/login and optional transcription runtimes remain separate; they are not installed by this package. NVIDIA/KDE device acceptance and representative real-project tests remain separate from synthetic package checks. Back up recordings you cannot redo.

## Linux beta compatibility

Linux x86_64 with X11 and glibc 2.35 or newer is required by the bundled media libraries. AppImage does not remove this ABI requirement. Wayland, macOS and independent-machine compatibility are not certified by this candidate.

A manual beta download with published checksums and corresponding source can be released with the updater disabled. Creating or pinning a publisher signing key is required for updater activation, not for manual beta installation. Hardware acceptance and publication approval are separate release gates.
