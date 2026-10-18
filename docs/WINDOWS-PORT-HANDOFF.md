# Windows port handoff

**Branch (2026-10-18):** the Windows port is merged into `master`, which now builds both Linux and Windows. `feat/windows-port` was deleted. On the Windows PC, switch to `master` and pull before any work (`git fetch origin && git switch master && git pull --ff-only`). Do not push old `feat/windows-port` commits back; `master` is protected against force pushes and deletion, so integrate by pulling and merging, never forcing.

This note is superseded. The port now runs end to end on Windows; read these instead:

- **[WINDOWS-PORT-GOAL.md](WINDOWS-PORT-GOAL.md)**: goal, phases, acceptance and the status log.
- **[WINDOWS-DEVELOPMENT.md](WINDOWS-DEVELOPMENT.md)**: how it works, how to build and test it, and the measured facts.
- **`pnpm gate:windows`**: the live list of what is done and what still needs a person (hardware and visual checks are recorded by the user with `node scripts/windows/verify-windows-port.mjs confirm <key> "<note>"`).
- **[../INSTALL-WINDOWS.md](../INSTALL-WINDOWS.md)**: install guide for users.
