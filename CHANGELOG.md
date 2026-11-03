# Changelog

## Dev only — not in public builds

Behind a local switch (Noam's own dock copy). Spec: docs/SPEC-dev-insert-and-camera-takes-2026-10-20.md.

- Dev: add a clip at the playhead from a video file or from another Rough Cut project (exported with its finished look first), as Insert (everything after moves later, graphics too) or Overwrite. The clip takes the whole picture over the project background; the recording's camera, cursor, clicks and zooms are hidden for its length and its sound replaces the recording's. Trim, move, split, delete and undo like any clip; export matches the preview.
- Dev: record a camera take over a marked range (3-2-1, the range plays silent unless sound is switched on, stops by itself). The take is the camera bubble for that range and its voice replaces the old one, which is muted, not deleted. Every take is kept; the newest is used and any other can be picked from the Dev menu.
- Dev: record a voice-over (mic only) from the playhead until Stop, or over a marked range where it stops by itself. 3-2-1 first, the timeline plays silent unless sound is switched on, and a live mic level shows before recording. It lands as its own clip on a Voice lane at that exact spot; drag and trim it to the frame. Per take: Replace (the recording's voice is muted there, not deleted) or Play over; click the chip on the clip to switch. Undo works for all of it; export matches.
- Dev: zooms and captions on an added clip. Click the Zoom or Captions lane over the clip (or "Add captions to this clip" when it is selected); they belong to the clip and move with it, edit like any zoom or caption, and export as they preview.
- Dev: "Add clip at playhead" also takes sound files (mp3, wav, m4a, aac, ogg, flac, opus). One lands on the Voice lane at the playhead, replacing the sound there or playing over it.
- Fix: timeline playback no longer stops at the first frame of an empty stretch on the timeline.
- Export ffmpeg also runs at low CPU and idle disk priority inside its memory-capped scope.

## Unreleased

- New: when the open project's file is changed outside Rough Cut (for example by an agent), the app shows the new version at once. If you were editing at that moment, it asks whether to load their version or keep yours; autosave never saves an old copy over theirs.
- Projects: copies of a project get their own identity, and when several projects in one recording folder share a name, each card shows its file name, sorted by last edit.

## 0.1.0-beta.12 — not yet published

- New: one-click updates on Windows and Linux. When a newer version is ready, an Update button appears at the top; one click downloads it, closes Rough Cut and opens it again on the new version (never while recording or exporting). Updating from beta.11 uses Help, Update Rough Cut once. Mac: download new versions manually until auto-update support arrives.
- New: About window (the i button at the top, or Help, About Rough Cut) with the version, update status and Check for updates.
- Timeline: with the magnet on, trimming a clip's left edge moves that edge while you drag and then closes the gap, like CapCut.
- Graphics: changing Entrance, its length or Animate replays the entrance in the viewer so you can see the change.
- New: the welcome also appears on the empty Recording edit screen; the app is named Rough Cut everywhere (no MVP).

## 0.1.0-beta.11 — 2026-10-19

- New: in-app updates on Windows (Help, Check for updates), checked against the owner's signature before anything installs; the updater is now switched on for Linux and Windows. Windows users on beta.10 or earlier update once by running the new installer.
- New: a welcome screen on the empty Projects page, with three first steps (record, edit, export).
- New: one-click Claude connection in the Graphics panel (Connect Claude, Update Claude Code, Get Claude Code) instead of typing commands in a terminal.
- Timeline: trim handles on every clip, video and audio, with no need to select the clip first; plain trim is the default (the edge you drag follows the mouse and leaves a gap), and closing gaps stays available as an option.

## 0.1.0-beta.10 — 2026-10-18

- Captions: their own timeline lane, speech-to-text (local engine), inline editing, language switching (translation through Claude, on request) and burned into styled exports, Hebrew right to left.
- Timeline: zoom keeps the playhead in place; trims show a live length readout; End jumps to the end; generated zooms only land on footage still in the edit; AI zooms apply in one undoable step.
- Fix: the camera no longer disappears partway through a video after a head trim.
- Linux: starts on Ubuntu 24.04+ with the sandbox kept on (one-time, user-approved AppArmor rule for the AppImage and portable folder); first start can install missing ffmpeg, xdotool and xinput.
- Windows: preview build from the same source (see INSTALL-WINDOWS.md).

## 0.1.0-beta.9 — 2026-10-08

- Fix: importing a video from outside the projects folder created the project but then failed with "Project path is outside the allowed projects directory", and the editor never opened. A project you imported or opened yourself now opens and saves in the folder you chose (regression test included).
- No other application changes from beta.8.

## 0.1.0-beta.8 — 2026-10-06

- Reconcile the public Linux distribution with the reviewed beta.7 editor/runtime, Electron 43.7.7 and bundled tools.
- Require the Chromium sandbox in all shipped launchers; include complete embedded-font and media-tool notices, matching corresponding source and recorded package identity.
- Preserve the current public landing page and publishing workflow. Manual updates remain in use; signed-update activation and final owner acceptance remain separate.
- Preserve the publisher’s new quiet-voice export leveling toward -16 LUFS, with capped gain and peak limiting; loud enough exports and byte-equal copies remain untouched.

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

- Install handles its own dependencies: on first start `run.sh` checks for ffmpeg, ffprobe, xdotool and xinput and installs any that are missing (apt, dnf, pacman or zypper; graphical password prompt, or sudo in a terminal). Nothing to type by hand.

### Fixes

- Finishing a take no longer decodes the whole file twice (a 2 minute take went from about 52 s to under 1 s).
- The tray light is removed after a take is stopped or cancelled; no duplicate Stop controls while recording.
- The app no longer crashes when started from a folder it cannot write logs to; logs go under the user config folder.
- Export: timeline audio no longer about 6 dB too quiet; export length no longer rounded down to whole seconds; multi-segment exports no longer drop frames between segments; zoom markers map correctly through edited clips; an export never appears half-built under its final name.
- Editor: deleting, trimming and gaps behave like a normal editor timeline; camera stays lip-synced during playback; preview holds the last frame past a trimmed end.
- Recorder window no longer re-expands to full screen on startup.
- Waveform rendering skipped for sources without audio instead of crashing.

### Known limits

- Electron 35 was out of support. Beta.8 and later ship Electron 43.7.7.
- Wayland, Windows and macOS are not supported.
