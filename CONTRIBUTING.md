# Contributing

Thanks for helping. Rough Cut is AGPL-3.0; contributions are accepted under the same licence. By contributing you agree your work is released under it.

## Setup

Requires Node 20+, pnpm 9, and on Linux/X11: `ffmpeg`, `ffprobe`, `xdotool`, `xinput`.

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts Vite and Electron; main-process changes restart Electron automatically, renderer changes hot-reload.

## Commands

- `pnpm dev` starts the Electron app in development mode.
- `pnpm typecheck` type-checks every package.
- `pnpm test` runs the full build and automated test suite.
- `pnpm smoke:mvp` records a short X11 capture, reopens it, and exports it.
- `pnpm smoke:ui` launches Electron against a synthetic project and verifies preview/export UI.
- `pnpm package:linux` creates a local Linux artifact at `dist/rough-cut-mvp-linux-x64`.
- `pnpm smoke:package` builds that artifact and verifies it can launch, preview, and export.

Long-workflow transcription gate (needs a source video of 60+ minutes):

```bash
ROUGH_CUT_LONG_BENCHMARK_SOURCE=/absolute/path/to/recording.mp4 \
  pnpm benchmark:smart-rough-cut -- --output=/tmp/rough-cut-smart-benchmark.json
```

## Before opening a PR

- `pnpm typecheck` and `pnpm test` must pass.
- UI changes: include a real screenshot of the Recording edit screen.
- Keep PRs small and focused; one change per PR.
- Do not commit recordings, exports, `.env` files or credentials.

## Reporting bugs

Use the issue templates. Include your distro, desktop, GPU, and the log from `~/.config/rough-cut-mvp/logs`. Report security problems privately, see [SECURITY.md](SECURITY.md).

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
