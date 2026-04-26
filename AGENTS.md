# Rough Cut — Agent Rules

Read `CLAUDE.md` first for the project-specific operating rules.

Mandatory runtime log rule:

- Check `.logs/app-runtime.log` before asking the user for terminal logs
- Prefer reading or tailing `.logs/app-runtime.log` directly from the workspace
- Only ask the user for pasted terminal output if the needed information is missing from that file
- Use `pnpm logs:app` to follow the live log stream

E2E test display mode rule:

- Default to `pnpm test:e2e:headless:serial` for full-suite Electron/Playwright runs so tests use `xvfb-run` and do not take over the user's desktop
- Use `pnpm test:e2e:headless` for parallel background E2E runs when speed matters
- Use `pnpm test:e2e:headed` or `pnpm test:e2e:headed:serial` only when the user asks for visible testing or visual debugging requires it
- Avoid `pnpm exec playwright test` directly for Electron E2E unless you intentionally need custom flags; prefer the named scripts so headless/headed intent stays explicit
- Treat headless mode as mandatory by default for this repo, even for one-off specs. If you need to run a single Electron/Playwright spec, use the headless scripts or wrap the command with `xvfb-run`.
- Never run headed Electron/Playwright tests in this repo unless the user explicitly asks for a visible run in that moment.
