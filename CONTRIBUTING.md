# Contributing

Thanks for helping. Rough Cut is AGPL-3.0; contributions are accepted under the same licence. By contributing you agree your work is released under it.

## Setup

Requires Node 22.12+ (Node 22 LTS in CI), pnpm 9.15.0, and on Linux/X11: `ffmpeg`, `ffprobe`, `xdotool`, `xinput`. Automated Electron tests also use `xvfb`.

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev
```

`pnpm electron:install` downloads the pinned Electron binary using its official installer and checksums. Packaging runs this command automatically. `pnpm dev` starts Vite and Electron; main-process changes restart Electron automatically, renderer changes hot-reload.

## Commands

- `pnpm dev` starts the Electron app in development mode.
- `pnpm typecheck` type-checks every package.
- `pnpm test` runs the full build and automated test suite.
- `pnpm smoke:mvp` records a short X11 capture, reopens it, and exports it.
- `pnpm smoke:ui` launches Electron against a synthetic project and verifies preview/export UI.
- `pnpm package:linux` creates a local Linux artifact at `dist/rough-cut-mvp-linux-x64`.
- `pnpm smoke:package` builds that artifact and verifies it can launch, preview, and export.

`pnpm test` packages the app before running repository tests: visual-proof tests
require the generated package identity. Package-local tests follow.

The optional `package:linux:verified` command also requires locally maintained
`.agents` design skills. They are private and excluded from this source snapshot.
For that optional gate, set `ROUGH_CUT_DESIGN_SKILL_PATH` to your design skill file;
a missing skill fails with an explicit message. Standard `package:linux` and CI
are independent of private skills.

Recording smoke commands capture the current X11 display. Run them in a virtual
X11 session with a synthetic fixture when you do not want to record your desktop.

## Before opening a PR

- `pnpm typecheck` and `pnpm test` must pass.
- UI changes: include a real screenshot of the Recording edit screen.
- Keep PRs small and focused; one change per PR.
- Do not commit recordings, exports, `.env` files or credentials.

## Reporting bugs

Use the issue templates. Include your distro, desktop, GPU, and the log from `~/.config/rough-cut-mvp/logs`. Report security problems privately, see [SECURITY.md](SECURITY.md).

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
