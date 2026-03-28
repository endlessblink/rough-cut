---
name: edit-tab
description: Edit tab — multi-track timeline editor with clip CRUD, trimming, splitting, transitions, zoom event tracks, playhead/scrubbing, and keyboard shortcuts. Auto-activates when working on timeline editing, clips, tracks, or the Edit tab.
triggers:
  - EditTab
  - Timeline
  - TimelineEditor
  - Clip
  - Track
  - trim
  - split
  - transition
  - playhead
  - scrubber
  - ripple
  - magnetic
  - timeline-engine
---

# Edit Tab — Architectural Context

## Overview

The Edit tab is the full multi-track timeline editor where users arrange clips, trim, split, add transitions, manage zoom/cursor event tracks, and prepare the composition for export. It reads and writes the Composition (tracks, clips, transitions) in the ProjectDocument.

## Industry Patterns (Research-Based)

### Two Timeline Philosophies

| Philosophy | Examples | Model |
|------------|----------|-------|
| **Event-row** | Screen Studio, Focusee | Fixed rows per event type (zoom, cursor, shortcuts). No free-form clip editing. |
| **Full NLE** | ScreenFlow, Camtasia, DaVinci | Unlimited tracks, free-form clip placement, full editing operations. |

**Rough Cut uses both:** Record tab gets event-rows (presentation events only). Edit tab gets the full NLE model with clip CRUD, multi-track, and all editing operations.

### Track Types

Based on ScreenFlow, Camtasia, and DaVinci patterns:

| Track Type | Purpose | Visual |
|------------|---------|--------|
| Video | Screen recordings, camera feeds, images | Thumbnail filmstrip |
| Audio | Microphone, system audio, music | Waveform visualization |
| Annotation | Text, shapes, arrows, callouts | Colored clip bars |
| Zoom/Pan | Auto-zoom events, manual zoom keyframes | Colored blocks (Screen Studio: purple, Focusee: blue) |
| Caption | Auto-generated or manual subtitles | Text segment bars |

### Clip Representation

Clips are colored rectangles on tracks. They show:
- Thumbnail strip or waveform (depending on track type)
- Name/label
- In/out handles for trimming (drag edges)
- Effect badges (if effects applied)
- Zoom events as inline colored blocks (ScreenFlow "action bars" pattern)

### Editing Operations (from DaVinci / ScreenFlow)

| Operation | Shortcut | Description |
|-----------|----------|-------------|
| Split at playhead | T (or Cmd+B) | Cut clip into two at playhead position |
| Trim front | W | Move in-point to playhead |
| Trim end | E | Move out-point to playhead |
| Delete (non-ripple) | Delete/Backspace | Remove clip, leave gap (universal default) |
| Ripple delete | Cmd+Delete | Remove clip AND close gap |
| Move clip | Drag | Reposition on track or between tracks |
| Slip | Alt+Drag | Shift source content within clip bounds |
| Slide | Ctrl+Alt+Drag | Move clip, adjacent clips absorb/give frames |
| Set in point | I | Mark selection start |
| Set out point | O | Mark selection end |
| Play/Pause | Space | Toggle playback |
| Frame step | Left/Right | Single frame forward/back |
| Jump 10 frames | Shift+Left/Right | Fast frame stepping |

### Trim Modes (DaVinci smart cursor pattern)

The trim tool auto-switches mode based on cursor position on the edit point:
- **Ripple**: Extend/shorten clip, downstream clips shift
- **Roll**: Move edit point between two clips, total duration unchanged
- **Slip**: Change source range within clip, position unchanged
- **Slide**: Move clip position, adjacent clips adjust

### Transitions

Two models observed:
- **Overlap model** (ScreenFlow, DaVinci): Physically overlap clips on the same track. Overlap duration = transition length.
- **Drag-and-drop model** (Camtasia): Drag transition from a panel onto an edit point. Small icon appears at the junction.

Both require clips to have "handles" (extra source frames beyond the in/out points). Rough Cut should support both — overlap for manual control, drag-drop for convenience.

### Snap Behavior

**Snap targets (priority order):** playhead > clip edges > markers > grid subdivisions.

Snap uses a pixel-proximity threshold (8–12px at default zoom). When a dragged clip's edge comes within this threshold, it locks. Screen recording editors do NOT use magnetic timeline (FCPX) semantics — gaps are allowed.

Toggle snap on/off with `N` key (no menu required).

### Waveform Rendering Pipeline

Waveforms are **pre-computed at asset import, not live-rendered**:
1. Main process runs `audiowaveform` binary (or FFmpeg peak extraction) during asset import
2. Generates binary `.dat` peak file (min/max amplitude pairs, 8-bit)
3. Renderer reads peak arrays → draws on Canvas (not WebAudio API at render time)
4. On zoom change, re-query peak data at different samples-per-pixel resolution
5. Reference: BBC Peaks.js / `bbc/waveform-data.js`

This aligns with Architecture Principle §8 (main process owns all I/O).

### Thumbnail Generation Pipeline

Video thumbnails for timeline filmstrips:
1. Main process generates sprite sheet PNG at asset import using FFmpeg seeking (`-ss` before `-i`)
2. Resolution: ~160px wide, aspect ratio maintained
3. Interval: 1 frame/second for recordings <30min, 1 per 2-5s for longer
4. Stored as single sprite sheet PNG (grid layout) — one `drawImage` call with source rect
5. Interval + thumbnail size stored in asset metadata
6. Seeking-based extraction is ~3.8x faster than fps-filter approach

### Timeline Zoom Behavior

**Two anchor behaviors:**
- **Mouse wheel zoom**: Anchors to mouse cursor position (zoom toward what you're pointing at)
- **Keyboard zoom** (Cmd+=/-): Anchors to playhead (zoom toward where you're editing)

```
// Cursor-anchored zoom math:
worldX = (screenX - scrollLeft) / pixelsPerFrame
newPixelsPerFrame = oldPixelsPerFrame * zoomFactor
newScrollLeft = worldX * newPixelsPerFrame - screenX
```

### Selection Patterns

| Interaction | Behavior |
|-------------|----------|
| Click | Select single clip, deselect others |
| Cmd+Click | Toggle individual clip in/out of selection |
| Shift+Click | Range select from last-clicked to target (same track) |
| Click+Drag on empty space | Rubber-band / marquee select (SVG rect overlay) |
| Cmd+A | Select all clips |
| A | Select all clips forward of playhead (for ripple operations) |

### Timeline Navigation

| Action | Control |
|--------|---------|
| Horizontal zoom | Cmd+= / Cmd+- or Alt+Scroll (cursor-anchored) |
| Vertical zoom (track height) | Shift+Scroll or drag track separator |
| Scroll timeline | Scroll wheel (horizontal) |
| Zoom to fit | Shift+Z (fits entire project in visible width) |
| Jump to start | Home |
| Jump to end | End |

### Descript Text-Based Editing (future reference)

Descript's innovation: a transcript document IS the editing surface. Deleting words = deleting video segments. This is a future AI tab feature for Rough Cut, not an Edit tab concern, but the project model should support word-level timestamp metadata (in AIAnnotations) to enable it later.

## Canonical Constraints

From the project constitution:

1. **The timeline engine is pure functions** — `@rough-cut/timeline-engine` depends only on project-model. All clip operations (split, trim, move) are pure functions that return new state.

2. **Frame-based, not time-based** (§4) — All clip in/out points, playhead position, and transition durations are integer frame numbers.

3. **UI does NOT own rendering logic** (§2) — Timeline components render clip rectangles and handle user interaction. The actual video preview comes from the compositor via store subscription.

4. **No business logic in components** — Clip operations go through store actions which call timeline-engine functions. Components dispatch actions, never mutate directly.

5. **Group compound mutations for undo** — A drag operation that moves multiple clips produces ONE undo step, not N individual moves.

6. **Timeline uses canvas-based area virtualization** — React list virtualization (react-window, TanStack Virtual) does NOT work for 2D timelines with arbitrary clip positions and zoom. The correct pattern is canvas-based viewport culling: only render clips whose bounding boxes intersect the visible horizontal range. DOM elements only for interactive handles (resize grips, context menus). Reference: `ievgennaida/animation-timeline-control`.

## Component Architecture (planned)

```
EditTab (orchestrator)
├── TimelinePanel
│   ├── TimelineRuler           — Frame numbers / timecode display
│   ├── PlayheadIndicator       — Vertical line at current frame
│   ├── TrackList               — Virtualized list of tracks
│   │   ├── TrackHeader         — Track name, mute/solo/lock controls
│   │   └── TrackLane           — Clip rendering area
│   │       ├── ClipView        — Individual clip rectangle
│   │       │   ├── ClipThumbnails  — Video frame thumbnails
│   │       │   ├── ClipWaveform    — Audio waveform
│   │       │   └── TrimHandle     — Drag handles for in/out
│   │       └── TransitionView  — Transition icon/overlay at edit points
│   ├── ZoomEventTrack          — Dedicated row for zoom events
│   └── CaptionTrack            — Dedicated row for subtitles
├── TransportControls           — Play/pause, skip, speed
├── TimelineToolbar             — Tool selection (select, trim, blade, slip)
└── EditRightPanel (inspector)
    └── InspectorShell
        ├── ClipProperties      — Selected clip details
        ├── EffectStack         — Applied effects list
        └── TransitionSettings  — Transition type/duration
```

## File Map (planned)

```
packages/timeline-engine/src/
  clip-operations.ts           — split, trim, move, slip, slide (pure functions)
  track-operations.ts          — add/remove/reorder tracks
  transition-operations.ts     — add/remove transitions, compute overlaps
  playhead.ts                  — Playhead position, in/out points
  selection.ts                 — Clip/track selection logic
  snap.ts                      — Snap-to-grid, snap-to-clip-edge

apps/desktop/src/renderer/features/edit/
  EditTab.tsx                  — Top-level orchestrator
  TimelinePanel.tsx            — Main timeline area
  TimelineRuler.tsx            — Frame number ruler
  TrackList.tsx                — Virtualized track rendering
  TrackHeader.tsx              — Track controls (mute/solo/lock)
  TrackLane.tsx                — Clip placement area
  ClipView.tsx                 — Individual clip component
  TrimHandle.tsx               — Drag handles for trimming
  TransitionView.tsx           — Transition visual
  TransportControls.tsx        — Playback controls
  TimelineToolbar.tsx          — Tool palette
  EditRightPanel.tsx           — Inspector for selected clip
```

## Keyboard Shortcut Map

| Category | Key | Action |
|----------|-----|--------|
| Playback | Space | Play/Pause |
| Playback | J/K/L | Reverse/Pause/Forward (JKL shuttle — power user essential) |
| Playback | K+L | Trim forward one frame (hold both) |
| Playback | Left/Right | Frame step |
| Playback | Shift+Left/Right | 10-frame step |
| Editing | T | Split at playhead |
| Editing | Shift+T | Split ALL tracks at playhead |
| Editing | W | Trim front to playhead (ripple) |
| Editing | E | Trim end to playhead (ripple) |
| Editing | Delete/Backspace | Delete clip (leave gap — non-ripple, universal default) |
| Editing | Cmd+Delete | Ripple delete (close gap) |
| Editing | Cmd+Z | Undo |
| Editing | Cmd+Shift+Z | Redo |
| Editing | Cmd+C/V/X | Copy/Paste/Cut |
| Editing | M | Add marker at playhead |
| Selection | I | Set in point |
| Selection | O | Set out point |
| Selection | Cmd+A | Select all |
| Selection | A | Select all clips forward of playhead |
| Navigation | Cmd+= | Timeline zoom in (anchored to playhead) |
| Navigation | Cmd+- | Timeline zoom out (anchored to playhead) |
| Navigation | Alt+Scroll | Timeline zoom (anchored to mouse cursor) |
| Navigation | Shift+Z | Zoom to fit entire project |
| Navigation | Home/End | Jump to start/end |
| Tools | N | Toggle snap on/off |
| Tools | V | Select tool (pointer) |
| Tools | B | Blade tool |

## Safety Rules

- **All editing operations must go through store actions** — never mutate ProjectDocument directly
- **Compound operations = single undo step** — multi-clip drag, multi-track paste
- **Virtualize clip rendering** — only render visible clips in viewport
- **Frame-accurate snap** — snapping resolves to integer frame boundaries
- **Validate clip boundaries** — in-point < out-point, within asset duration
- **Handle empty tracks gracefully** — don't crash on tracks with zero clips

## What NOT to Do

- Don't put clip operation logic in React components (use timeline-engine)
- Don't expose structural editing in the Record tab (Edit tab only)
- Don't use time-based values (milliseconds) in clip positions
- Don't render all clips at once (virtualize)
- Don't implement a full graph editor for MVP (keyframe editing is a Motion tab concern)
- Don't couple timeline rendering to preview rendering (they're independent)
- Don't skip undo grouping for compound operations
