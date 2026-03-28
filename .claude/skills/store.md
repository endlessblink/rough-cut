---
name: store
description: Store — Zustand state management, undo/redo via zundo, immer mutations, transport vs document state separation, auto-save, compositor subscription. Auto-activates when working on the store, state management, undo/redo, or Zustand.
triggers:
  - useProjectStore
  - projectStore
  - project-store
  - Zustand
  - zustand
  - zundo
  - immer
  - undo
  - redo
  - auto-save
  - transport-state
  - document-state
  - store-action
---

# Store — Architectural Context

## Overview

`@rough-cut/store` manages all application state using Zustand + zundo (undo/redo) + immer (immutable mutations). The critical architecture decision is separating **document state** (undo-able, persisted) from **transport state** (high-frequency playhead, not undo-able) into two separate stores.

## Industry Patterns (Research-Based)

### Two-Store Architecture

Every professional NLE separates these concerns:

| Store | Contents | Update Frequency | Undo-able? | Persisted? |
|-------|----------|-----------------|------------|------------|
| **Document** | ProjectDocument (tracks, clips, assets, effects) | Low (user edits) | Yes (zundo) | Yes (auto-save) |
| **Transport** | playhead, isPlaying, zoom, loopRegion, selection | 60Hz (RAF loop) | No | No |

**Why separate**: The playhead updates at 60fps during playback. If in the same store as the document, every frame triggers re-renders in all document-subscribed components. And you don't want "move playhead" in the undo stack.

### Zustand + Zundo + Immer Pattern

```typescript
import { create } from 'zustand';
import { temporal } from 'zundo';
import { immer } from 'zustand/middleware/immer';

// Middleware composition order (CRITICAL — reversing causes type errors):
// temporal(subscribeWithSelector(immer(creator)))
// immer innermost → subscribeWithSelector → temporal outermost
const useDocumentStore = create<DocumentState>()(
  temporal(
    subscribeWithSelector(
      immer((set, get) => ({
        document: createProjectDocument(),
        isDirty: false,
        projectFilePath: null,

        // Actions
        addClip: (clip) => set((state) => {
          const track = state.document.composition.tracks.find(t => t.id === clip.trackId);
          if (track) track.clips.push(clip);
          state.isDirty = true;
        }),

        splitClip: (clipId, frame) => set((state) => {
          // Call timeline-engine pure function, apply result
          state.isDirty = true;
        }),
      }))
    ),
    {
      // CRITICAL: Only track document, NOT transport/UI state
      partialize: (state) => ({
        document: state.document,
      }),

      // Prevent duplicate history entries
      equality: (a, b) => JSON.stringify(a) === JSON.stringify(b),

      // Memory control — at 50KB per snapshot, 50 entries = ~2.5MB.
      // Use `partialize` aggressively to reduce snapshot size.
      limit: 50,

      // Auto-save hook
      onSave: debounce((past, current) => {
        if (current.projectFilePath) {
          ipc.invoke('project:save', current.document);
        }
      }, 1500),
    }
  )
);

// Transport store — NO temporal middleware
const useTransportStore = create<TransportState>()((set) => ({
  playhead: 0,
  isPlaying: false,
  zoom: 1.0,
  loopIn: null,
  loopOut: null,
  selectedClipIds: [],
  selectedTrackId: null,

  setPlayhead: (frame) => set({ playhead: frame }),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setZoom: (zoom) => set({ zoom }),
  setSelection: (clipIds) => set({ selectedClipIds: clipIds }),
}));
```

### Compositor Subscription (Non-React)

The PreviewCompositor is a non-React class. It subscribes to stores via `subscribe()` (not hooks), which fires synchronously outside React:

```typescript
// In PreviewCompositor.init()
useDocumentStore.subscribe(
  (state) => state.document,
  (document) => this.applyDocument(document)
);

useTransportStore.subscribe(
  (state) => state.playhead,
  (frame) => this.seekToFrame(frame)
);
```

This requires `subscribeWithSelector` middleware on both stores.

### Compound Undo Operations

Multi-step operations (e.g., drag-move 5 clips) must produce a single undo step:

```typescript
const { pause, resume } = useDocumentStore.temporal.getState();

function moveClips(clipIds, deltaFrames) {
  pause();  // Stop recording history
  for (const id of clipIds) {
    moveClip(id, deltaFrames);  // Each mutation is silent
  }
  resume();  // Record one combined history entry
}
```

### Auto-Save Strategy

From DaVinci Resolve (every action persisted) and the debounced file-write pattern:

1. **Dirty flag**: Set on every document mutation
2. **Debounced write**: 1.5 seconds after last change via zundo `onSave`
3. **Flush on close**: `beforeunload` forces immediate save
4. **Versioned backups**: Every 5-10 minutes, create numbered `.roughcut.bak` files

### `projectFilePath` is NOT undo-able

`projectFilePath` and `isDirty` are app-level state excluded from `partialize`. Changing save location should not create an undo entry.

## Canonical Constraints

From the project constitution:

1. **All mutations go through store actions** — Never mutate state directly from components.

2. **Store NEVER imports from UI** — Store is accessible outside React (for compositor, IPC handlers).

3. **Immutable update patterns** — Immer handles this, but the principle stands: no direct mutation without immer draft.

4. **Separate transport from document state** — Transport updates at 60Hz, document at user-edit frequency.

5. **Group compound mutations** — A drag produces one undo step, not N individual moves.

6. **Store must be accessible outside React** — `useDocumentStore.getState()` and `.subscribe()` for non-React consumers.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  @rough-cut/store                                │
│                                                  │
│  useDocumentStore (Zustand + zundo + immer)      │
│  ├── document: ProjectDocument                   │
│  ├── isDirty: boolean                            │
│  ├── projectFilePath: string | null              │
│  ├── Actions: addClip, removeClip, splitClip,    │
│  │   moveClip, addTrack, removeTrack,            │
│  │   addAsset, addEffect, removeEffect,          │
│  │   updateSettings, setProjectFilePath...       │
│  └── temporal: { undo, redo, clear, pause,       │
│       resume, pastStates, futureStates }         │
│                                                  │
│  useTransportStore (Zustand, no temporal)         │
│  ├── playhead: number                            │
│  ├── isPlaying: boolean                          │
│  ├── zoom: number                                │
│  ├── loopIn/loopOut: number | null               │
│  ├── selectedClipIds: ClipId[]                   │
│  └── selectedTrackId: TrackId | null             │
└─────────────────────────────────────────────────┘
         ↕ subscribe()
┌─────────────────────────────────────────────────┐
│  Consumers                                       │
│  ├── React components (via useSelector hooks)    │
│  ├── PreviewCompositor (via subscribe())         │
│  ├── IPC handlers (via getState())               │
│  └── Auto-save (via zundo onSave callback)       │
└─────────────────────────────────────────────────┘
```

## Store Actions Pattern

Actions call timeline-engine pure functions and apply results:

```typescript
splitClip: (clipId, frame) => set((state) => {
  const result = timelineEngine.splitClip(state.document, clipId, frame);
  if (result.ok) {
    // Apply the result to the draft
    const track = findTrack(state.document, clipId);
    track.clips = result.clips;
    state.isDirty = true;
  }
}),
```

This keeps business logic in timeline-engine (pure, testable) and the store as a thin mutation layer.

## File Map

```
packages/store/src/
  index.ts                     — Public exports
  document-store.ts            — useDocumentStore with zundo + immer
  transport-store.ts           — useTransportStore (no temporal)
  actions/
    clip-actions.ts            — addClip, removeClip, splitClip, moveClip
    track-actions.ts           — addTrack, removeTrack, reorderTracks
    asset-actions.ts           — addAsset, removeAsset
    effect-actions.ts          — addEffect, removeEffect, reorderEffects
    project-actions.ts         — updateSettings, setProjectFilePath
  selectors/
    clip-selectors.ts          — getClipById, getClipsOnTrack, getActiveClips
    track-selectors.ts         — getTrackById, getVideoTracks, getAudioTracks
    asset-selectors.ts         — getAssetById, getAssetsByType
  middleware/
    auto-save.ts               — Debounced save via IPC
```

## Selector Best Practices

```typescript
// GOOD: Narrow selector, minimal re-renders
const clipCount = useDocumentStore((s) => s.document.composition.tracks[0]?.clips.length);

// BAD: Full document subscription, re-renders on ANY change
const doc = useDocumentStore((s) => s.document);

// GOOD: Derived selector with shallow equality
const videoTracks = useDocumentStore(
  (s) => s.document.composition.tracks.filter(t => t.type === 'video'),
  shallow
);
```

## Undo/Redo in React

```typescript
function UndoButtons() {
  const canUndo = useDocumentStore.temporal((s) => s.pastStates.length > 0);
  const canRedo = useDocumentStore.temporal((s) => s.futureStates.length > 0);
  const { undo, redo } = useDocumentStore.temporal.getState();

  return (
    <>
      <button onClick={undo} disabled={!canUndo}>Undo</button>
      <button onClick={redo} disabled={!canRedo}>Redo</button>
    </>
  );
}
```

## Missing Store Slices (Validated)

These slices are required but not yet designed:

### Clipboard (ephemeral, NOT undo-able)
```typescript
interface ClipboardSlice {
  clipboard: { clips: Clip[]; tracks: Track[] } | null;
  copy: (clipIds: ClipId[]) => void;
  paste: (atFrame: number, trackId: TrackId) => void;
  cut: (clipIds: ClipId[]) => void;
}
```

### Active Tool
```typescript
type Tool = 'select' | 'trim' | 'blade' | 'slip' | 'slide';
interface ToolSlice {
  activeTool: Tool;
  setTool: (tool: Tool) => void;
}
```

### Timeline Viewport
```typescript
interface ViewportSlice {
  zoomLevel: number;          // pixels per frame
  scrollOffset: number;       // leftmost visible frame
  zoomToFit: (viewportWidthPx: number) => void;
  zoomToSelection: () => void;
}
```
Zoom-to-fit: `zoomLevel = viewportWidthPx / totalFrames`. Accept viewport width as param (don't read DOM in store).

### Project Lifecycle State Machine
```typescript
type ProjectStatus =
  | { phase: 'empty' }
  | { phase: 'loading'; path: string }
  | { phase: 'ready'; path: string; isDirty: boolean }
  | { phase: 'saving' }
  | { phase: 'error'; path: string; error: string };
```

### Export Progress
```typescript
interface ExportSlice {
  exportStatus: 'idle' | 'rendering' | 'cancelled' | 'done' | 'error';
  exportProgress: number;   // 0-1
  startExport: (settings: ExportSettings) => void;
  cancelExport: () => void;
}
```

**None of these slices should be in the temporal (undo) history.** Only the document store (composition, assets, motionPresets) is undo-able.

## Safety Rules

- **Never mutate state outside of immer drafts** — All mutations go through `set()`
- **partialize excludes transport state** — Only document enters undo history
- **projectFilePath changes must NOT create undo entries** — Excluded from partialize
- **Group compound operations** — Use `pause()`/`resume()` around multi-step actions
- **Use narrow selectors** — Avoid full-document subscriptions in components
- **Store must work without React** — `getState()` and `subscribe()` for non-React consumers
- **Auto-save is debounced** — Not on every keystroke, 1.5s after last change
- **Flush on close** — Never lose work on window close
- **Zustand v5.0.10+ required** — TypeScript regression in v5.0.3-v5.0.9 breaks middleware type inference
- **Call `enableArrayMethods()`** if any `produce()` calls read large arrays with `.filter()`/`.map()` — avoids Immer proxy-per-item overhead
- **Selection state is NOT undo-able** — undo should not restore what was selected

## What NOT to Do

- Don't put transport state (playhead, zoom) in the document store
- Don't subscribe to the full document from React components
- Don't call compositor directly from store actions (use subscribe pattern)
- Don't skip pause/resume for compound operations
- Don't import UI/React from store package
- Don't make projectFilePath part of undo history
- Don't auto-save on every mutation (debounce!)
- Don't assume store is only used from React (compositor, IPC handlers use it too)

## References

- Zustand: `subscribe()` with selector for non-React synchronous updates
- Zundo: `partialize`, `limit`, `onSave`, `pause/resume` for compound operations
- DaVinci Resolve: Every action auto-saved to database (inspiration for aggressive auto-save)
- Remotion: Player owns playback state separately from composition data
- Camtasia: `editRate` as project-level constant, `sourceBin` as asset registry
