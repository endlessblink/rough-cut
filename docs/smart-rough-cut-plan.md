# Smart Rough Cut Plan

## Product Goal

Turn a live-coding recording into a tight tutorial through one fast review pass.
Rough Cut should do most of the finding, keep the user in control of every cut,
and make the transcript, preview, and canonical timeline behave as one editor.

## Agreed Workflow

1. Transcription and lightweight analysis run locally at low priority while
   recording.
2. Capture quality always wins. Analysis pauses automatically under recording
   load and catches up after stop.
3. The transcript and first suggestions are mostly ready when recording stops.
4. The workspace opens with a large preview, a readable transcript, and a
   compact timeline.
5. The first review queue targets failed attempts, retries, and corrections.
6. Each suggestion identifies the later successful attempt that replaces it
   and gives a short reason.
7. Uncertain material is kept and flagged, never removed automatically.
8. Review plays a short before / proposed cut / resulting join loop.
9. The keyboard controls replay, accept, reject, word-boundary adjustment, and
   next suggestion.
10. Accepted suggestions update playback immediately but remain a single
    reviewable draft pass.
11. Transcript word selection is the primary cut-boundary control.
12. Joins optimize natural speech using silence-aware boundaries and short
    audio crossfades.
13. Large screen or code-state jumps are flagged and offer nearby safer
    boundaries.
14. Waiting periods are either removed or compressed to a short 2–4 second
    speed-up, depending on whether meaningful visual progress exists.
15. Manual review runs at fast, pitch-preserved playback with sentence-step
    transcript following.
16. Selecting transcript words and pressing Delete creates a reversible draft
    cut, verifies the join, and then resumes review.
17. Finalizing the pass commits one grouped, undoable project edit.
18. Restoring removed material returns it to its original position and
    rechecks both surrounding joins.

## Non-Goals For This Lane

- General-purpose AI generation, collaboration, or cloud sharing.
- Automatic deletion of uncertain suggestions.
- A separate transcript-only edit model.
- A second playback or export timeline.
- Broad visual redesign of the full NLE.
- Requiring markers, voice commands, or behavior changes while recording.

## Architecture Rules

- `ProjectDocument.timeline` remains the only persisted edit truth.
- Transcript selections resolve to integer timeline-frame ranges.
- Draft cleanup state is transient and reconstructable; it must not fork the
  project timeline.
- Final cuts use the existing canonical timeline command path.
- Preview and export resolve the same finalized timeline.
- A complete smart-cleanup pass appears as one undoable history action, while
  draft decisions remain individually reversible before finalization.
- Local analysis is isolated from capture and can be suspended without losing
  recorded media or analysis progress.

## Build Sequence

### Slice 1 — Transcript Job And Progress Contract

Add a resumable transcription job with incremental segments, progress,
pause/resume, cancellation, and local-first provider selection. Persist enough
job state to finish safely after recording stops or the app restarts.

Acceptance:

- Recording can start and stop with transcription enabled or unavailable.
- Capture automatically suspends analysis when the performance guard trips.
- Partial transcript results survive a renderer reload.
- Cloud analysis is opt-in and never required for basic transcription.

### Slice 2 — Timeline-Aligned Transcript

Normalize words, paragraphs, speaker-neutral sentences, and non-speech ranges
to canonical integer frames. Add selectors for frame-to-word, word-to-range,
active sentence, and transcript seek.

Acceptance:

- Clicking any word seeks the canonical playhead to the matching frame.
- Selecting words returns a valid half-open timeline range.
- Cuts and gaps do not make transcript highlighting drift from playback.
- Saving and reopening preserves the same word timing.

### Slice 3 — Screen-Action Landmarks

Derive compact transcript landmarks for spoken commands, spoken errors, and
long waits first. Keep raw activity detail out of the primary transcript, and
use cursor telemetry only as supporting evidence. Application, file, and major
visual-state landmarks stay deferred until the recording pipeline emits
trustworthy telemetry for them.

Acceptance:

- Landmarks are searchable and seekable.
- Each landmark shows its evidence source and confidence in the review UI.
- Missing telemetry degrades to a speech-only transcript without blocking
  review.

### Slice 4 — Retry And Replacement Suggestions

Group semantically similar attempts and rank the best complete successful
attempt using transcript meaning, detected errors, screen-state outcome, and
completion. Emit a conservative removal suggestion with a replacement mapping,
reason, confidence, and alternative boundaries.

Acceptance:

- The engine never applies a cut by itself.
- Low-confidence candidates remain visible as kept-and-flagged.
- Suggestions explain which successful attempt replaces the proposed removal.
- Deterministic fixtures cover repeated sentences, corrected commands, failed
  builds, abandoned explanations, and legitimate repetition that must remain.

### Slice 5 — Wait Detection And Treatment

Detect builds, installs, loading, silence, and low-activity spans. Recommend
removal when no meaningful progress is visible and a fixed short speed-up when
progress should remain.

Acceptance:

- Suggestions distinguish remove from compress.
- Speed-up duration defaults to 2–4 seconds and remains adjustable.
- Unusable wait audio is muted or softened without affecting surrounding
  narration.
- The decision is previewable before acceptance.

### Slice 6 — Draft Cleanup Session

Create a transient cleanup-session model containing pending, accepted,
rejected, adjusted, and restored suggestions. Resolve the draft through the
canonical timeline for playback without persisting parallel edit truth.

Acceptance:

- Accept and reject update the preview immediately.
- Closing and reopening the review can reconstruct the unfinished draft.
- Canceling the pass restores the exact pre-review project.
- Finalizing produces one grouped undo entry.

### Slice 7 — Editing Feel And Reactivity Foundation

Build the shared interaction primitives before the review workspace: transient
local gesture state, single-command commit boundaries, optimistic draft
feedback, cancellable seeks, keyboard focus routing, stable selection, and
virtualized transcript rendering. Define latency instrumentation that runs in
development and the interaction harness.

Interaction rules:

- Pointer and word-selection feedback follows input immediately; persistence
  never blocks visual feedback.
- A gesture or boundary adjustment commits once, not on every pointer move.
- New seeks cancel obsolete in-flight seeks so rapid navigation never snaps
  backward to an old request.
- Playback, selection, transcript highlighting, and the playhead share one
  authoritative frame.
- Keyboard commands work globally except in real typing targets.
- Focus stays on the current review task after accept, reject, replay, delete,
  undo, or restore.
- Panels remain stable while suggestion state changes; controls disable rather
  than disappear and shift the workspace.
- Long transcripts render only the visible reading window plus a small buffer.
- Expensive waveform, thumbnail, landmark, and suggestion work stays off the
  interaction path.

Acceptance:

- Common keyboard actions show feedback within 50 ms.
- Play, pause, accept, reject, undo, and next do not cause layout movement.
- Rapid seek and suggestion navigation settle on the latest requested frame.
- Holding a boundary-adjustment key remains smooth and produces one undoable
  draft decision when released.
- A 60-minute transcript scrolls, selects, follows playback, and updates
  highlights without long main-thread stalls.
- Pointer and keyboard tests verify focus continuity after every review action.
- An in-page frame monitor catches blank, gray, stale, or backward-jumping
  preview frames throughout rapid interactions and a post-action window.

### Slice 8 — Before / Cut / After Review Player

Build the focused review loop over the existing preview: lead-in, proposed
removal, resulting join, then pause for a decision. Add keyboard commands for
replay, accept, reject, boundary adjustment, next, previous, and escape.

Acceptance:

- A suggestion can be reviewed without using the mouse.
- Playback never exposes frames that the draft timeline marks removed.
- Moving to the next suggestion stays within a strict interaction-latency
  budget.
- Keyboard commands do nothing inside editable text fields.

### Slice 9 — Transcript Editing Surface

Add the preview-plus-transcript workspace with sentence-step following, manual
scroll lock, word-range selection, suggestion highlights, replacement links,
and compact screen-action landmarks.

Acceptance:

- Continuous playback does not continuously scroll the page.
- Manual scrolling suspends follow until the user explicitly resumes it.
- Delete on selected words creates a reversible draft cut.
- Suggestion states are distinguishable without relying on color alone.

### Slice 10 — Natural Join Engine

Refine selected word ranges to nearby silence and phoneme-safe boundaries.
Apply short audio crossfades and score screen-state discontinuity independently
from speech quality.

Acceptance:

- Join preview uses the same timing as finalized playback and export.
- Speech fixtures do not click, clip consonants, or create accidental doubled
  words.
- Large visual jumps are flagged rather than silently hidden.
- The user can choose a nearby safer boundary without leaving review.

### Slice 11 — Fast Manual Review

Add pitch-preserved 1.5×, 2×, and 3× review speeds. When the user stops to make
a transcript cut, verify the join once and automatically resume just after it
unless the user intervenes.

Acceptance:

- Transcript highlighting remains frame-aligned at every supported speed.
- Pause, selection, delete, join verification, and resume form one keyboard
  flow.
- Playback speed returns to the chosen review speed after join verification.

### Slice 12 — Finalize, Restore, And Audit

Convert the draft into canonical ripple-delete and speed-region commands,
record one history entry, preserve an audit of suggestion decisions, and allow
removed ranges to be restored in place.

Acceptance:

- Undo restores the exact project before smart cleanup.
- Redo recreates the same finalized edit.
- Restore reintroduces the original media and rechecks adjacent joins.
- Recording Edit, NLE, preview, save/reopen, and export agree on the result.

### Slice 13 — Performance And Real-Recording Gate

Measure capture overhead, transcript readiness after stop, suggestion latency,
keyboard response, seek time, join-preview startup, memory growth, and export
parity on a real long live-coding recording.

Initial budgets:

- No capture frame or audio drops attributable to analysis.
- Analysis suspension reacts before capture health becomes degraded.
- Common keyboard review actions respond within 100 ms.
- Join preview starts within 250 ms when media is warm.
- Transcript and first-pass suggestions are available within 10 seconds after
  stop when incremental analysis kept up.
- A 60-minute recording can complete review, finalize, save, reopen, and export
  without transcript or timeline drift.

The budgets are hypotheses until measured on target hardware. Slice 13 records
the baseline and tightens them without weakening capture reliability.

## Verification Strategy

- Project-model tests for transcript timing, suggestion schemas, draft
  decisions, replacement mappings, and canonical command conversion.
- Timeline-engine tests for linked media, ripple deletion, restore, gaps, and
  speed regions.
- Desktop tests for job lifecycle, local/cloud policy, suspend/resume, and
  restart recovery.
- Playwright interaction coverage for transcript seek, word selection,
  keyboard review, join playback, fast playback, and finalization.
- Per-frame preview monitoring during cuts and join playback to reject blank or
  stale frames.
- Preview/export parity fixtures containing camera, microphone, linked clips,
  retries, long waits, screen changes, and internal gaps.
- A fresh real live-coding recording and packaged-app pass before promotion.

## First Build Milestone

Implement Slices 1–2 behind a feature flag, using a deterministic transcript
fixture before connecting a real transcription provider. This proves that
incremental transcript data can survive recording, map to canonical timeline
frames, seek the existing preview, and reopen without drift. It deliberately
avoids UI polish and semantic AI until the timing contract is trustworthy.
