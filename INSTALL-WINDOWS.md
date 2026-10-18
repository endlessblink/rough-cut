# Install Rough Cut on Windows

Candidate: **0.1.0-beta.9 (Windows port)**, Electron 43.7.7, Windows x64. FFmpeg and ffprobe are bundled. Node.js, pnpm and a source checkout are not needed for an installed build.

This is a pre-release for early users, and we want your bug reports. It was developed and tested on one Windows laptop (Windows 11 Home, a USB webcam, a USB microphone) and one Linux PC. Other hardware, a second monitor and long recordings have not been tested. Back up recordings you cannot redo.

## Requirements

- Windows 10 version 2004 (build 19041) or newer, or Windows 11, 64-bit. System-audio capture needs the Windows audio loopback support that arrived in 2004.
- About 1 GB free for the app, plus room for recordings. Recordings are high quality (CRF 16 H.264), so a long take at full-screen resolution needs several GB.
- Optional: the `claude` command, logged in, for Claude-made graphics. Install it with `winget install Anthropic.ClaudeCode`.
- Optional, not bundled: a local transcription engine.

## Install

**Installer (recommended).** Run `Rough-Cut-0.1.0-beta.9-Setup.exe`. It installs for your user only and needs no administrator rights. You can change the folder; it adds a Start Menu entry and an optional desktop shortcut. Uninstalling removes the app and never touches your recordings or projects.

**Portable zip.** Unzip `Rough-Cut-0.1.0-beta.9-win-x64.zip` anywhere you can write to, keep the folder together, and run `Rough Cut.exe`. There is no updater; replace the folder with a newer one after closing the app.

### The "Windows protected your PC" warning

The build is **not code-signed yet**, so Windows SmartScreen will warn that the publisher is unknown. Check the file first, then choose **More info → Run anyway**:

```powershell
Get-FileHash .\Rough-Cut-0.1.0-beta.9-Setup.exe -Algorithm SHA256
```

The checksum of the installer built on 2026-10-18 is:

```
BA262A16E719587D6BCF07FB32F38748FA8B0A686935FF6344C57205FA76C265  Rough-Cut-0.1.0-beta.9-Setup.exe
```

Compare the result with that value and with the checksum published next to the download. Do not run a build whose checksum you cannot match.

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
- **Camera frame rate and sharpness** depend on the camera and the light. The USB webcam this was tested with produced only about 7 to 14 real frames per second in an ordinary room even though it advertises 30. Webcams lengthen their exposure in dim light, which blurs movement, especially in the first second or two while auto-exposure settles. Put a lamp in front of you and wait a moment after pressing record before you move. The camera file is stored at a constant 30 frames per second (frames are repeated to fill gaps) so that editor playback stays steady; that does not add sharpness. The screen is recorded separately at full rate, so the screen stays smooth either way.
- **Microphone sync is a measured estimate.** A Windows microphone delivers its first sound before the picture has started, so Rough Cut delays the microphone by a fixed 320 ms when recording. That number was measured with a flash-and-beep test on one USB microphone (C-Media) on one machine. Other microphones, Bluetooth headsets and laptop microphones can be a little early or late. If your voice is early or late against the picture, please report the device and roughly how far off it is.
- **System audio sync is not corrected.** The system-audio (speaker) track can drift against the picture by roughly 200 ms either way, and the offset varies from one recording to the next.
- **Camera-versus-screen sync** is estimated from when the camera produced its first frame. It has not been checked against real footage with a clap or flash.
- The bundled FFmpeg is large (two 218 MB executables), so the download is about 230 MB.

## Report a problem

Open an issue at <https://github.com/endlessblink/rough-cut/issues>. Include the steps you took, your Windows version, which camera and microphone you used, and the log from `%APPDATA%\rough-cut-mvp\logs\app-runtime.log`. For a sync problem, say whether the voice or the picture comes first and by roughly how much.

Contributing or building from source: see [docs/WINDOWS-DEVELOPMENT.md](docs/WINDOWS-DEVELOPMENT.md).
