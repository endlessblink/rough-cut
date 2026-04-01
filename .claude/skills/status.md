---
name: status
description: Project health dashboard — reads MASTER_PLAN.md task progress, risks, and optionally runs tests/typecheck. Supports --quick (default, docs only) and --full (docs + tests + typecheck + E2E).
triggers:
  - status
  - health
  - project status
  - where are we
  - how's the project
  - what's the state
---

# Project Health Dashboard

When this skill is invoked, produce a scannable project health report.

## Arguments

| Arg | Behavior |
|-----|----------|
| (none) | Default: `--quick` — parse docs only, no test runs |
| `--quick` | Explicit quick mode |
| `--full` | Parse docs + run unit tests + typecheck + E2E tests |
| `--tests` | Docs + unit tests only |
| `--types` | Docs + typecheck only |

## Workflow

### Step 1: Read MASTER_PLAN.md

Read `docs/MASTER_PLAN.md`. Parse the **Progress Summary** table near the top (look for a table with columns like Area, Done, Remaining, %). Use those numbers directly.

Also count individual task rows from the tier tables. Task rows look like:
```
| ~~TASK-001~~ | Title | P0 | DONE | ... |
| TASK-012     | Title | P0 | TODO | ... |
```

Rules:
- Strikethrough (`~~`) or status column containing "DONE" or "✅" → DONE
- Status containing "IN PROGRESS" or "🔄" → IN PROGRESS
- Status containing "TODO" → TODO
- Status containing "BLOCKED" → BLOCKED

### Step 2: Read Risks

Read `docs/RISKS_AND_NEXT_STEPS.md`. Count risks by severity (Critical, High) and status (RESOLVED, PARTIAL, OPEN, MITIGATED). Look for `> **Status**:` lines within each risk section.

### Step 3: Git Status

Run:
```bash
git status --short
git log --oneline -5
git branch --show-current
```

### Step 4: Run Checks (conditional)

Only if `--full`, `--tests`, or `--types` is specified:

| Check | Command | When |
|-------|---------|------|
| Unit tests | `pnpm test 2>&1` | `--full` or `--tests` |
| Typecheck | `pnpm typecheck 2>&1` | `--full` or `--types` |
| E2E tests | `pnpm test:e2e 2>&1` | `--full` only |

Set a 120-second timeout per check. If a check times out, report "TIMEOUT".

### Step 5: Compile Report

Output the report in this exact format:

```
## Rough Cut — Project Health

**Date**: {today} | **Branch**: {branch} | **Uncommitted**: {count} files | **Mode**: {quick|full}

### Task Progress

| Area | Done | Remaining | % |
|------|------|-----------|---|
| {area} | {done} | {remaining} | {pct}% |
| **Total** | **{total_done}** | **{total_remaining}** | **{total_pct}%** |

### By Status

| Status | Count |
|--------|-------|
| DONE | {n} |
| IN PROGRESS | {n} |
| TODO | {n} |
| BLOCKED | {n} |

### Checks

| Check | Result |
|-------|--------|
| Unit Tests | {PASS x/y | FAIL x/y | ⏭ Skipped (use --full)} |
| Typecheck | {CLEAN | {n} errors | ⏭ Skipped (use --types or --full)} |
| E2E Tests | {PASS x/y | FAIL x/y | ⏭ Skipped (use --full)} |

### Risks ({open} of {total} still open)

| Risk | Severity | Status |
|------|----------|--------|
| {name} | {Critical|High} | {RESOLVED|PARTIAL|OPEN|MITIGATED} |

### Recommended Next

Top 3 unfinished tasks sorted by priority (P0 first):
1. **{TASK-ID}** ({priority}): {title}
2. ...
3. ...

> Run `/next` to interactively pick and start a task.
```

## Important Notes

- Keep the output scannable — tables, not prose
- In quick mode, mark all checks as "⏭ Skipped"
- If the Progress Summary table in MASTER_PLAN.md exists, prefer its numbers
- Always show the "Recommended Next" section regardless of mode
- Filter out tasks that are DONE when listing recommended next
- Sort recommended tasks: P0 > P1 > P2 > P3, then IN PROGRESS before TODO
