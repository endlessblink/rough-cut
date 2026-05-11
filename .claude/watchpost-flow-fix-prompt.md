# Prompt — fix Watchpost flow so it always loads correct sprints

Paste everything below into a fresh Watchpost-context Claude Code session (cwd = `~/.watchpost`). Don't summarize or rewrite it; the specifics matter.

---

## Goal

Make the Watchpost flow view (`flow/index.html`) render a sensible **active sprint** for any project, even when MASTER_PLAN.md does not (yet) declare an explicit `### Delivery Lines` or `### Current sprint framing` block. Right now, in the absence of those blocks, the flow falls back to body-text dependency inference and produces wrong, confusing chains for projects whose task descriptions cross-reference each other (e.g., "Supersedes: TASK-X", "see TASK-Y", "future replaces TASK-Z" all become phantom `waits for` edges).

Concrete failure I just hit on `rough-cut-mvp`: the flow rendered `TASK-012 → TASK-017 → TASK-026 → TASK-043` as the active sprint, with TASK-012 marked `▶ START NOW`. In reality:

- TASK-012 and TASK-017 are `SUPERSEDED → TASK-025` (already folded into a different completed task).
- TASK-026 is the deprioritized Wayland pivot — it doesn't depend on the zoom-preview task.
- TASK-043 was DONE.

The chain came entirely from inferred edges between IDs that happened to be mentioned in each other's bodies under headings like `#### Supersede Notes`, `**Supersedes:** TASK-012, TASK-017`, "future-replaces", etc.

The fix has four parts. Do them in this order; verify each on `rough-cut-mvp` before moving on.

---

## Background — exactly what's running today

Read these first; don't skip:

- `~/.watchpost/flow/index.html:1740-1873` — task parser (`parseStatus`, `tableRowRe`, body-Status/Depends-on extraction, dedup).
- `~/.watchpost/flow/index.html:1875-1933` — `extractEdges` (the inferred-edge logic that's the main offender).
- `~/.watchpost/flow/index.html:2229-2237` — render entry point. Today: prefer `parseDeliveryLines`, else `parseSprintFraming`, else fall through to inferred-edge streams view.
- `~/.watchpost/flow/index.html:2482-2585` — `parseSprintFraming` and `parseDeliveryLines`.
- `~/.watchpost/flow/index.html:1944-2000` — `rankTasks` (status/priority weights for the streams-view spine).

Concrete project to verify against: `/media/endlessblink/data/my-projects/ai-development/content-creation/rough-cut-mvp/MASTER_PLAN.md`. It has `IN PROGRESS`, `PLANNED`, `DONE`, `SUPERSEDED → TASK-025`, and `EXTERNAL` statuses, plus a 4-column summary table (no `Depends-on` column).

---

## Part 1 — Fix `parseStatus`: substring-match bug + missing statuses

### 1a. Substring-match bug (highest priority — directly silently corrupts active sprint)

`parseStatus` (line 1863) does naïve `src.includes(...)` checks in this order:

```js
if (src.includes('DONE') || src.includes('✅')) return 'done';
if (src.includes('IN PROGRESS') || src.includes('IN-PROGRESS') || src.includes('🔄')) return 'in-progress';
```

Real-world failure I just hit: `**Status:** IN PROGRESS (capture done; visual emphasis pending)` is parsed as `'done'` because "DONE" appears inside the parenthetical clarifier. Any status text that explains *what* was done (very common in mid-flight tasks) gets silently flipped to done. That collapses the sprint lane in `renderCurrentFlowRow` (only `currentTask` and `nextTask` are shown, both `!== 'done'`), making the user think their IN PROGRESS task vanished.

**Fix**: anchor the match to the leading token, not anywhere in the string.

```js
function parseStatus(parenStatus, titleText, strikethrough) {
  const src = (parenStatus || titleText || '').trim();
  // Take the first status token: everything up to the first '(' or '—' or '-' or whitespace+lowercase.
  const head = src.split(/[(—\-]|\s{2,}/)[0].trim().toUpperCase();
  if (/^DONE\b/.test(head) || src.startsWith('✅')) return 'done';
  if (/^IN[\s-]PROGRESS\b/.test(head) || src.startsWith('🔄')) return 'in-progress';
  if (/^REVIEW\b/.test(head) || src.startsWith('👀')) return 'review';
  if (/^PAUSED\b/.test(head) || src.startsWith('⏸')) return 'paused';
  if (/^(?:TODO|TO\sDO|TBD|PLANNED)\b/.test(head) || src.startsWith('📋')) return 'planned';
  if (/^SUPERS[EC]EDED\b/.test(head)) return 'done';      // see 1b
  if (/^(?:CANCELLED|CANCELED|WONTFIX|WON'T\sFIX)\b/.test(head)) return 'done';
  if (/^EXTERNAL\b/.test(head)) return 'external';
  if (/^DEFERRED\b/.test(head)) return 'paused';
  if (/^BLOCKED\b/.test(head)) return 'paused';
  if (strikethrough) return 'done';
  return 'unknown';
}
```

The key change is the `head` extraction + `\b` word-boundary regex. `IN PROGRESS (capture done; ...)` now extracts `head = "IN PROGRESS"`, regex `^IN[\s-]PROGRESS\b` matches, and `'in-progress'` is returned. The trailing parenthetical content is ignored.

### 1b. Add new statuses (was original Part 1)

Even after the substring fix, `parseStatus` still returns `'unknown'` for `SUPERSEDED`, `CANCELLED`, `WONTFIX`, `EXTERNAL`, `DEFERRED`, `BLOCKED`. The regex block above adds them. Notes:

- `SUPERSEDED → TASK-025` (with arrow continuation) → `head = "SUPERSEDED"` → `'done'`. ✓
- `EXTERNAL` → new status value `'external'`. Add `external: 0` to `STATUS_WEIGHT`. Exclude `'external'` from active spine in streams-view fallback. Treat as done in `deriveLineStates` (line 2604: `task.status === 'done'` check should be widened to `['done','external'].includes(task.status)` so external tasks don't keep a line "active").
- `DEFERRED`, `BLOCKED` (status field) → `'paused'`.

Verify on `rough-cut-mvp/MASTER_PLAN.md` (after the user reverts the temporary "capture complete" workaround back to "capture done"): TASK-013 should parse as `'in-progress'`, TASK-012/017 should parse as `'done'`, TASK-050/054/055/056 should parse as `'external'`.

---

## Part 2 — Tolerate variable-column summary tables

`tableRowRe` at line 1747 requires exactly 5 pipe-separated columns: `| ID | Title | Priority | Status | Deps |`. This project's table uses 4 columns (`| ID | Title | Priority | Status |`, no Deps column). Result: every summary-table row is silently ignored. Tasks are only picked up via the detail H3 sections.

That's tolerable today (the dedup logic merges them anyway), but it means the parser is brittle. Make `tableRowRe` accept 4-, 5-, or 6-column rows:

```js
// Match: | ID | Title | Priority | Status | (optional Deps) | (optional anything-else) |
const tableRowRe = /^\|\s*(?:~~)?((?:TASK|BUG|ISSUE|FEATURE|ROAD)-\d+)(?:~~)?\s*\|\s*(.*?)\s*\|\s*([A-Z0-9-]+)\s*\|\s*([^|]+?)\s*(?:\|\s*([^|]*?)\s*)?(?:\|\s*[^|]*?\s*)?\|\s*$/;
```

Then `depsRaw = tblMatch[5] || ''` so the existing `match(ID_PATTERN)` still works (zero matches if the column is absent).

Verify on `rough-cut-mvp/MASTER_PLAN.md` lines 17–77 — every row should now produce a parsed task with the correct status. Spot-check that `~~TASK-027~~ ... DONE (2026-05-06)` still parses as `done`.

---

## Part 3 — Tighten `extractEdges` so cross-references don't fabricate dependencies

This is the critical fix. `extractEdges` at line 1882 walks every task body, collects every `(TASK|BUG|ISSUE|FEATURE|ROAD)-\d+` match, and creates an inferred edge per match. That turns "Supersedes: TASK-012, TASK-017" inside TASK-025's body into edges TASK-012 → TASK-025 and TASK-017 → TASK-025. Multiplied across a mature MASTER_PLAN, the inferred graph becomes mostly noise.

Apply these guards inside the `for (const ref of refs)` loop (line 1915):

1. **Skip refs in lines that match supersede/replace/see-also patterns.** Before scanning `t.body` for IDs, strip lines whose trimmed content matches:
   - `^\*\*Supersedes\*\*:` (and `Superseded by`, `Supersedes`)
   - `^\*\*Replaces\*\*:` / `^\*\*Replaced by\*\*:`
   - `^\*\*See also\*\*:` / `^\*\*See\*\*:` / `^\*\*Related\*\*:`
   - Any line under a heading `#### Supersede Notes`, `#### Replacement notes`, `#### See also`.
   
   Implementation: split body on `\n`, drop lines matching the patterns above, drop lines inside the matching `####` sections (until the next `####` or H3), then re-join and run the existing ID match.

2. **Skip refs to tasks whose status is `done`, `external`, or `paused`** when the source task is itself active. A done predecessor is fine as a solid edge (it's already a satisfied dep), but adding inferred-only edges from done tasks just clutters the graph. Specifically: at the existing addEdge call site, if `byId.get(ref).status === 'done'` and the edge would be inferred, skip it.

3. **Cap inferred fan-out per task at 3.** If a task body mentions 8 other IDs (common for narrative tasks like TASK-025 "Unified preview"), creating 8 inferred edges is almost always wrong. After collecting, sort by ID-numeric distance (closest first) and keep at most 3.

After this change, the rough-cut-mvp flow with no Delivery Lines block should stop showing the bogus 012→017→026→043 chain. Verify by temporarily commenting out the `### Delivery Lines` block in the test project's MASTER_PLAN and reloading the flow.

---

## Part 4 — Smarter fallback when no sprint framing exists

Right now `renderGraph` (line 2224) falls all the way through to the streams view if neither `parseDeliveryLines` nor `parseSprintFraming` returns anything. That view is graph-shaped and not sprint-shaped, so the `▶ START NOW` heuristic ends up picking whichever node has the highest score in the inferred graph — easily wrong as we've seen.

Add a third fallback **before** the streams view: an **auto-derived sprint** built purely from status + priority, no edge inference:

```js
function buildAutoSprint(tasks) {
  // Group active tasks; ignore done/external.
  const active = tasks.filter(t => t.status !== 'done' && t.status !== 'external');
  if (active.length === 0) return [];
  // Top track: anything in-progress, ordered by priority then ID.
  const inProgress = active.filter(t => t.status === 'in-progress')
    .sort((a, b) => priorityRank(b) - priorityRank(a) || idNum(a.id) - idNum(b.id));
  // Next track: planned, ordered by priority then ID, capped at 8.
  const planned = active.filter(t => t.status === 'planned')
    .sort((a, b) => priorityRank(b) - priorityRank(a) || idNum(a.id) - idNum(b.id))
    .slice(0, 8);
  return [
    { letter: 'A', name: 'In-flight', ids: inProgress.map(t => t.id) },
    { letter: 'B', name: 'Up next',   ids: planned.map(t => t.id) },
  ];
}
```

Wire it into `renderGraph` between the explicit-sprint check and the streams fallback:

```js
const lines = deliveryLines.length > 0
  ? deliveryLines
  : sprints.length > 0
    ? buildLegacyDeliveryLinesFromSprints(sprints)
    : buildLegacyDeliveryLinesFromSprints(buildAutoSprint(tasks));
```

This guarantees the flow always renders a sprint view for any project that has at least one IN PROGRESS or PLANNED task, with **zero dependency inference**. Projects that want a hand-curated sprint can still write `### Delivery Lines` and override.

Add a small UI hint in the sprint sidebar header when the auto-sprint is active: `"Auto-derived sprint — declare ### Delivery Lines in MASTER_PLAN.md to override"` so users know they can take control.

---

## Part 5 — Delivery-view UX: the full sprint sequence is hidden

Two small UX issues observed when an explicit `### Delivery Lines` block IS present:

### 5a. Each lane shows only `current` + `next` — full sequence is invisible

`renderCurrentFlowRow` at line 2748 builds:

```js
const sequence = [{ task: currentTask, state: ... }];
if (nextTask) sequence.push({ task: nextTask, state: 'planned' });
```

So if `Sequence: TASK-A, TASK-B, TASK-C, TASK-D, TASK-E` is declared, the lane only ever displays the first two non-done tasks. Users reasonably expect to see the whole declared sequence when they look at the lane.

**Fix**: render the full sequence, with `current` highlighted and subsequent steps shown in a muted "upcoming" state. Cap at, say, 5 visible steps with a "+N more" pill if longer.

```js
const sequenceTasks = line.sequenceTaskIds.map(id => taskById.get(id)).filter(Boolean);
const currentIdx = sequenceTasks.findIndex(t => t.id === line.currentTaskId);
const visible = sequenceTasks.slice(Math.max(0, currentIdx), Math.max(0, currentIdx) + 5);
const overflow = sequenceTasks.length - (Math.max(0, currentIdx) + visible.length);
const sequence = visible.map((task, i) => ({
  task,
  state: i === 0 ? (line.state === 'blocked' ? 'blocked' : 'in-progress')
       : task.status === 'in-progress' ? 'in-progress'
       : 'planned',
}));
// Optionally pass `overflow` into renderFlowSequence so it can render a "+N more" pill.
```

This makes the lane self-explanatory: the user sees CURRENT → NEXT → ... → +N more without having to click into the task detail or unfold anything.

### 5b. "Other Planned Flows" hides ready-but-blocked-on-line lanes by default

Lines without an active runtime/lock (`isLiveInstance === false`) get pushed into `renderCollapsedFlows` (line 2799) as a `<details>` collapsed by default with the title "Other Planned Flows — N hidden flows". This makes legitimate, ready-to-start lanes invisible until the user discovers the disclosure.

**Fix options** (pick one):

1. **Open by default if a lane is `ready` and another `in-progress` lane exists.** Add `open` attribute to the `<details>` element when `lines.some(l => l.state === 'ready')`. Users who want to focus can collapse it manually.
2. **Promote `ready`-state lanes (no live instance) into the main "Active Instances" section** with a "Ready to start" badge instead of "Instance open". Move only `paused`/`locked` lanes into the collapsed section.

Option 2 is the right product call — "Active Instances" should mean "lines with work in flight", which includes ready-without-runtime lanes. A line is "hidden" only when it's blocked by another line (`locked`) or paused.

```js
// In renderDeliveryView around line 2843:
const activeFlows = lineStates.filter(line =>
  line.isLiveInstance || line.state === 'in-progress' || line.state === 'ready'
);
const availableFlows = lineStates.filter(line =>
  !activeFlows.includes(line) && line.state !== 'in-progress' && line.state !== 'ready'
);
```

Update the "Active Instances" subtitle to "These lanes are in flight, ready to claim, or backed by live instances" (current copy mentions only "live rough-cut context", which is misleading).

---

## Verification checklist

Run each of these after making the changes:

1. `~/.watchpost/dashboard` (or it's already running) → open the flow page for `rough-cut-mvp`. Confirm the spine shows `LINE A: TASK-013 → TASK-048`, `LINE B: TASK-041 → TASK-020 → ...`, no SUPERSEDED tasks anywhere.
2. Temporarily rename the `### Delivery Lines` heading in `rough-cut-mvp/MASTER_PLAN.md` to `### Delivery Lines (off)` and reload. Confirm the auto-sprint fallback kicks in: in-flight should be `TASK-013, TASK-048`, up-next should start with the highest-priority PLANNED tasks (TASK-041 at P1). Restore the heading after.
3. Open at least one other registered project from `~/.watchpost/projects.json` and confirm its flow still renders without errors.
4. `node -e "require('./server.js')"` smoke-check (or equivalent) — no syntax errors introduced.

## Out of scope

- Don't refactor the streams view or layout engine; keep changes localized to `parseStatus`, `tableRowRe`, `extractEdges`, and the `renderGraph` fallback chain.
- Don't add a server-side endpoint for sprint computation; this stays a client-side render concern.
- Don't change the `### Delivery Lines` parser format — it works.

## Commit

One commit per part is fine, or a single squash. Suggested squash message:
```
fix(flow): render sane sprint view across status/edge/UX edge cases

- parseStatus: anchor status match to leading token (was: substring;
  "IN PROGRESS (capture done; ...)" parsed as DONE). Recognize
  SUPERSEDED/CANCELLED/WONTFIX/EXTERNAL/DEFERRED/BLOCKED.
- tableRowRe: tolerate 4/5/6-column summary tables.
- extractEdges: skip Supersedes/Replaces/See-also lines and inferred
  edges from done tasks; cap inferred fan-out at 3 per task.
- renderGraph: auto-derive sprint from status+priority when no
  Delivery Lines or Current-sprint-framing block exists.
- renderCurrentFlowRow: show full declared Sequence (capped at 5
  visible + overflow pill) instead of only current+next.
- renderDeliveryView: promote ready-state lanes into Active Instances;
  collapse only locked/paused lanes into Other Planned Flows.
```
