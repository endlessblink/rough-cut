# Rough Cut — OpenCode Rules

Read `CLAUDE.md` first for the project-specific operating rules.

Mandatory runtime log rule:

- Check `.logs/app-runtime.log` before asking the user for terminal logs
- Prefer reading or tailing `.logs/app-runtime.log` directly from the workspace
- Only ask the user for pasted terminal output if the needed information is missing from that file
- Use `pnpm logs:app` to follow the live log stream
