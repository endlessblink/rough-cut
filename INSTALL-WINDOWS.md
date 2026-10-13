# Install Rough Cut on Windows

Candidate: **0.1.0-beta.8 (Windows port)**, Electron 43.7.7, Windows x64. FFmpeg and ffprobe are bundled. Node.js, pnpm and a source checkout are not needed for an installed build.

This is a pre-release. The Windows port was developed and tested on one machine (Windows 11 Home, a 125%-scaled laptop display, a USB webcam, a USB microphone). Other hardware, a second monitor and long recordings still need testing. Back up recordings you cannot redo.

## Requirements

- Windows 10 version 2004 (build 19041) or newer, or Windows 11, 64-bit. System-audio capture needs the Windows audio loopback support that arrived in 2004.
- About 1 GB free for the app, plus room for recordings. Recordings are high quality (CRF 16 H.264), so a long take at full-screen resolution needs several GB.
- Optional: the `claude` command, logged in, for Claude-made graphics. Install it with `winget install Anthropic.ClaudeCode`.
- Optional, not bundled: a local transcription engine.

## Install

**Installer (recommended).** Run `Rough-Cut-0.1.0-beta.8-Setup.exe`. It installs for your user only and needs no administrator rights. You can change the folder; it adds a Start Menu entry and an optional desktop shortcut. Uninstalling removes the app and never touches your recordings or projects.

**Portable zip.** Unzip `Rough-Cut-0.1.0-beta.8-win-x64.zip` anywhere you can write to, keep the folder together, and run `Rough Cut.exe`. There is no updater; replace the folder with a newer one after closing the app.

### The "Windows protected your PC" warning

The build is **not code-signed yet**, so Windows SmartScreen will warn that the publisher is unknown. Check the file first, then choose **More info → Run anyway**:

```powershell
Get-FileHash .\Rough-Cut-0.1.0-beta.8-Setup.exe -Algorithm SHA256
```

Compare the result with the checksum published next to the download. Do not run a build whose checksum you cannot match.

## First recording

1. Open Rough Cut. Choose **Screen** (or **Region**), then turn on the microphone, system audio and camera you want.
2. Windows may ask you to allow microphone or camera access. If a device does not appear or stays silent, open **Settings → Privacy & security → Microphone** (or **Camera**) and turn on **Let desktop apps access your microphone** (or camera).
3. **Start recording**, and stop from the app.

**System audio** records everything that plays through your default output device ("what you hear"); you do not need Stereo Mix or a virtual cable. Silence is recorded as silence, so it stays in sync with the picture. It is the whole device, not one app.

## Where things are stored

| What | Location |
| --- | --- |
| Recordings, projects, exports | `Documents\Rough Cut MVP` (you can change the folders in the app) |
| Settings and logs | `%APPDATA%\rough-cut-mvp` |

## Privacy

Recording and editing stay local. There is no analytics service and no automatic crash upload. To drive auto-zoom, Rough Cut listens for mouse clicks and key presses system-wide **while a recording is running**. For keys it stores only a key code, never the text you type, and the data stays in the project folder. Graphic prompts are sent to Claude only when you ask for a graphic. Public update checks are disabled.

## Known limits of this build

- **Unsigned** (see above). Updates are manual.
- Verified on a single display. Region capture and a second monitor are implemented but not yet verified on real multi-monitor hardware.
- Screen capture uses the Windows GDI grabber. It cannot capture protected (DRM) video, and some exclusive full-screen games record black. Run games in borderless windowed mode.
- Cursor and click timing was measured with synthetic input; in-editor alignment with a real hand is still being verified.
- The bundled FFmpeg is large (two 218 MB executables), so the download is about 230 MB.

## Report a problem

Include the log from `%APPDATA%\rough-cut-mvp\logs\app-runtime.log` and the steps you took, at <https://github.com/endlessblink/rough-cut/issues>.

Contributing or building from source: see [docs/WINDOWS-DEVELOPMENT.md](docs/WINDOWS-DEVELOPMENT.md).
