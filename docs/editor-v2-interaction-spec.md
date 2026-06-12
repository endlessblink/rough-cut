# Editor v2 Interaction Spec

TASK-236 closes the design gap between the approved Editor v2 mockup and the implementation slices.
This spec is the contract for TASK-237 and the follow-on NLE tasks. The design posture is product UI:
dense, stable, familiar editor controls, no decorative motion, and no helper copy in the work surface.

## Playback Decision

Editor v2 keeps the current `StyledVideoPreview` `timeMode="timeline"` path for now.

Evidence:

- `xvfb-run -a node scripts/visual-nle-linked-clips-playwright.mjs` passed on 2026-06-11 with
  `problems: []`, report `/tmp/rough-cut-nle-linked-hxyZhR/nle-linked-clips-report.json`.
- The linked fixture verified screen + camera + mic linked delete behavior, playback dwelling through
  the deleted timeline gap, crossing to the second clip afterward, no deleted-source playback, and a
  black gap canvas.
- TASK-230 export parity passed on an edited NLE timeline with leading/internal/trailing gaps and
  moved clips, report `/tmp/rough-cut-nle-export-parity-SUzLzV/nle-export-parity-report.json`.

Decision rule:

- Keep `timeMode="timeline"` as long as the linked fixture, gap playback, and export parity harnesses
  stay green.
- If a live bug shows playback diverging from exported timeline truth, capture `Ctrl+Shift+D` debug
  state first, then either fix `timeMode="timeline"` against that fixture or replace the program
  monitor with a canonical-timeline adapter over the proven Recording edit preview path. Do not add a
  second NLE-only playback model.

## Interaction Principles

- The canonical timeline is the only persisted edit model.
- Pointer gestures use local preview/session state while moving, then commit one command on pointerup.
- Keyboard actions commit immediately and must be undoable when they mutate the project.
- Layout is stable: disable unavailable controls instead of hiding them.
- Tool changes are instant. Do not animate keyboard-initiated mode switches, playback, or selection.
- Hover/focus affordances may use short 120-180ms color/border transitions. Dragging and scrubbing
  must track the pointer directly.
- Visible controls must work. If a command is not implemented in the current slice, keep it disabled
  with a real `disabled` state or leave it out of the slice.

## Mode Semantics

| Mode | Primary gesture | Commit behavior | Selection behavior | Cursor |
| --- | --- | --- | --- | --- |
| Select (`A`) | Click selects; drag moves selected clip or linked group | One move command on pointerup | Click replaces selection; Shift/Ctrl toggles after TASK-233 | Default/drag |
| Trim (`T`) | Edge hit-zone drag trims clip edge | One trim command on pointerup; TASK-231 adds ripple trim | Selection stays on trimmed clip | East-west resize |
| Blade (`B`) | Click clip at timeline frame splits | Immediate split command | Select right-hand split result | Crosshair/scissors |
| Dynamic trim (`W`) | Reserved for later rolling/slip edits | Disabled until implemented | No behavior | Disabled |

Mode switching:

- `A`, `T`, and `B` switch modes unless the event target is an input, textarea, select, or editable
  element.
- `Esc` exits transient gestures; if no gesture is active, return to Select mode and clear marquee.
- Blade does not auto-return to Select after one click. Users doing repeated cuts expect the tool to
  stay active. `A` restores Select.
- While a pointer gesture is active, keyboard mode changes are ignored except `Esc`.

## Edit Operations

### Select And Move

- Click on a clip selects it without moving it. Two-pixel pointer jitter must not commit a move.
- Drag starts only after the existing drag threshold is crossed.
- Same-track moves preserve non-overlap. TASK-232 replaces current-gap clamp with target-position
  collision resolution so clips can be dragged past neighbors.
- Linked screen/camera/mic clips move together unless link is explicitly disabled in a later task.
- Drop targets are track-aware. Moving a linked group to an incompatible target leaves the group on
  its original tracks.

### Trim

- Edge hit-zones are always present in Select and Trim modes when a clip is selected, but Trim mode
  widens the active hit-zone and changes the cursor.
- Left edge updates `timelineIn` and `sourceIn`; right edge updates `timelineOut` and `sourceOut`.
- Drag preview may visually slide filmstrip/waveform content, but project state changes only once on
  pointerup.
- TASK-231 ripple trim shifts downstream same-track clips by the edge delta. Until TASK-231 lands,
  Trim mode performs bounded non-ripple trim only.

### Blade

- Blade click resolves the timeline frame from the ruler/timeline viewport, not from text readouts.
- A split is valid only when the frame is strictly inside the target clip.
- Linked clips split together when they share the same linked group and overlapping timeline span.
- After split, selection moves to the right-hand resulting clip so delete/drag follow the common edit
  flow.

### Insert / Overwrite / Replace

Source viewer I/O sets a source range for the selected media-pool item.

- `I` sets source in at the source viewer playhead.
- `O` sets source out at the source viewer playhead.
- Insert places the source range at the timeline playhead on the active target track and ripples
  downstream same-track clips.
- Overwrite places the source range at the playhead and trims/removes covered same-track material
  without rippling duration.
- Replace keeps the selected timeline clip's timeline range and swaps its source media/range where
  durations allow. If durations differ before retiming exists, Replace is disabled.
- Track targeting chooses destination tracks. Without a targeted compatible track, edit buttons stay
  disabled.

## Keyboard Map

| Shortcut | Action |
| --- | --- |
| `Space` | Toggle playback |
| `J` | Reverse fallback: pause and step back about one second |
| `K` | Pause |
| `L` | Play forward |
| `ArrowLeft` / `ArrowRight` | Step playhead by one frame |
| `Shift+ArrowLeft` / `Shift+ArrowRight` | Step playhead by ten frames |
| `Home` / `End` | Jump to timeline start/end |
| `A` | Select mode |
| `T` | Trim mode |
| `B` | Blade mode |
| `I` / `O` | Set source in/out when Source viewer is focused |
| `S` | Split selected clip at playhead for legacy compatibility until Blade is fully primary |
| `Delete` / `Backspace` | Delete selected clip(s); linked clips delete together |
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` | Redo |
| `Ctrl+Shift+D` / `Cmd+Shift+D` | Save NLE debug dump |
| `Esc` | Cancel gesture; otherwise return to Select mode |

Keyboard rules:

- Shortcuts are ignored in typing targets.
- Timeline transport shortcuts operate even when the media pool or inspector has focus, unless focus
  is inside an editable control.
- Source I/O shortcuts apply only when Source viewer or media-pool preview focus is active. Otherwise
  `I` and `O` do nothing until insert/overwrite focus routing is implemented.

## Focus And Accessibility

- Tab order follows the visual order: top chrome, media pool, source viewer controls, timeline viewer
  controls, inspector, timeline toolbar, track headers, timeline clips.
- Every icon-only control needs an accessible label and visible focus ring.
- Selected clip state is exposed with `aria-selected` and dataset fields used by the harness:
  `data-timeline-in`, `data-timeline-out`.
- Disabled controls remain discoverable but cannot receive accidental pointer commits.
- No color-only state: active mode uses color plus filled/tinted button state; selected clips use border
  plus handles.

## Harness Gates

Before a TASK-237 interaction slice is considered done:

- `xvfb-run -a node scripts/visual-nle-clips-playwright.mjs` must pass with `problems: []`.
- `xvfb-run -a node scripts/visual-nle-linked-clips-playwright.mjs` must pass with `problems: []`.
- Relevant screenshots or frame artifacts must be opened and visually reviewed at wide width.
- For playback/export changes, `pnpm run visual:nle-export-parity` must pass.
- The user must confirm feel in the live app before the lane calls the slice done.
