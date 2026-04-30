# Rough Cut MVP

Fresh MVP focused on reliable Linux/X11 screen recording.

MVP scope:

- Capture screen-only MP4 via FFmpeg `x11grab`
- Save recording metadata as a versioned `.roughcut` project file
- Reopen project files
- Play the recording in a basic editor view
- Export to MP4

Deferred until after the MVP is stable: camera, audio, cursor overlay, cursor zoom, effects, multi-track timeline, transitions, motion templates, AI, and recovery markers.

Useful commands:

- `pnpm dev` starts the Electron app in development mode.
- `pnpm test` runs the full build and automated test suite.
- `pnpm smoke:mvp` records a short X11 capture, reopens it, and exports it.
- `pnpm smoke:ui` launches Electron against a synthetic project and verifies preview/export UI.
- `pnpm package:linux` creates a local Linux artifact at `dist/rough-cut-mvp-linux-x64`.
- `pnpm smoke:package` builds that artifact and verifies it can launch, preview, and export.
