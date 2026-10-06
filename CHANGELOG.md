# Changelog

## 0.1.0-beta (2026-10-06)

First public beta. Linux/X11 only; tested on KDE Plasma with NVIDIA.

### Features

- Screen recording with optional camera and microphone, plus cursor and click data.
- One shared timeline for the Recording edit view: trim, cut, split, zoom markers.
- Animated graphics over the video, written with the Claude CLI you have logged in.
- Export to MP4 with background (including grid), rounded frame, camera, zooms, animations and sound; each export is checked on completion.
- One dated project folder per video; choose where exports go.
- The Recording tab shows a live panel (sources on/off, pause, stop) while a take runs.
- Pre-record panel warns when the microphone or camera is off.

### Fixes

- Finishing a take no longer decodes the whole file twice (a 2 minute take went from about 52 s to under 1 s).
- The tray light is removed after a take is stopped or cancelled; no duplicate Stop controls while recording.
- The app no longer crashes when started from a folder it cannot write logs to; logs go under the user config folder.
- Export: timeline audio no longer about 6 dB too quiet; export length no longer rounded down to whole seconds; multi-segment exports no longer drop frames between segments; zoom markers map correctly through edited clips; an export never appears half-built under its final name.
- Editor: deleting, trimming and gaps behave like a normal editor timeline; camera stays lip-synced during playback; preview holds the last frame past a trimmed end.
- Recorder window no longer re-expands to full screen on startup.
- Waveform rendering skipped for sources without audio instead of crashing.

### Known limits

- Electron 35 is out of support; upgrade planned for 0.1.1.
- Wayland, Windows and macOS are not supported.
