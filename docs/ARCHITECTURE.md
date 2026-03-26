# Rough Cut — Architecture Specification

> Desktop screen recording and editing studio.
> This document is the canonical reference for system design, module boundaries, data flow, and key decisions.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Declarative Project Model](#2-declarative-project-model)
3. [Module Boundaries](#3-module-boundaries)
4. [Rendering Architecture](#4-rendering-architecture)
5. [Recording Pipeline](#5-recording-pipeline)
6. [State Management](#6-state-management)
7. [IPC Architecture](#7-ipc-architecture)
8. [Effect System Design](#8-effect-system-design)
9. [Folder Structure](#9-folder-structure)
10. [Architecture Decision Records](#10-architecture-decision-records-summary)

---

## 1. System Overview

The system is organized around one central idea: **a declarative project document is the single source of truth.** Every subsystem — recording, editing, preview, export, AI — reads from or writes to this document. No subsystem communicates with another directly.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      ELECTRON MAIN PROCESS                         │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Capture Engine   │  │  Export Pipeline  │  │     File I/O     │  │
│  │  desktopCapturer  │  │  frame-by-frame   │  │  project save/   │  │
│  │  webcam, audio    │  │  → FFmpeg          │  │  load/autosave   │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  │
│           │                     │                      │            │
│  ┌────────┴─────────┐          │                      │            │
│  │  AI Worker Bridge │          │                      │            │
│  │  spawn child procs│          │                      │            │
│  └────────┬─────────┘          │                      │            │
│           │                     │                      │            │
│  ─────────┴─────────────────────┴──────────────────────┴──────────  │
│                    IPC Bridge (typed, bidirectional)                │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 │  contextBridge / ipcRenderer
                                 │
┌────────────────────────────────┴────────────────────────────────────┐
│                    ELECTRON RENDERER PROCESS                        │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │               PROJECT STORE (Zustand)                        │   │
│  │               Single Source of Truth                         │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────┴───────────────────────────────────┐   │
│  │  Tab UIs:  Record  |  Edit  |  Motion  |  AI  |  Export     │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────┴───────────────────────────────────┐   │
│  │  Preview Compositor (PixiJS)                                 │   │
│  │  Reads project model, renders composited frames              │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Decisions

- **Renderer process** owns UI, project store, and the PixiJS preview compositor. This gives low-latency access between user interactions, state, and visual feedback.
- **Main process** owns all heavy I/O: disk capture, FFmpeg export, file system operations, and AI worker processes.
- **IPC bridge** is fully typed with a contract defined in a shared package (`@rough-cut/ipc`). No stringly-typed channel names leak across the boundary.
- **Project document** is a plain serializable object (JSON). It is diffable, testable, and never contains code or live references.

---

## 2. Declarative Project Model

The project model is a pure data structure. It contains everything needed to reconstruct the editing state and render the final output. Nothing is implicit.

### Schema Versioning

The project model includes a `version` field from day one. On load, the migration pipeline runs to bring any older document to the current schema version before validation.

```typescript
CURRENT_SCHEMA_VERSION: number        // Incremented on any breaking schema change
migrate(doc: unknown): ProjectDocument // Runs migration chain: v1→v2→...→current
// Each migration is a pure function: (v: N) => (v: N+1), tested independently
```

### Schema Hierarchy

```
ProjectDocument (root)
├── version: number (schema version for migrations)
├── id: string (UUID)
├── name: string
├── createdAt: ISO timestamp
├── modifiedAt: ISO timestamp
├── settings: ProjectSettings
│   ├── resolution: { width, height }
│   ├── frameRate: 24 | 30 | 60
│   ├── backgroundColor: string (hex)
│   └── sampleRate: number (e.g. 48000)
├── assets: Asset[]
│   ├── id: string
│   ├── type: 'video' | 'audio' | 'image' | 'recording'
│   ├── filePath: string
│   ├── duration: number (frames)
│   ├── metadata: Record<string, unknown>
│   └── thumbnailPath: string
├── composition: Composition
│   ├── duration: number (total frames)
│   ├── tracks: Track[]
│   │   ├── id: string
│   │   ├── type: 'video' | 'audio'
│   │   ├── name: string
│   │   ├── index: number (z-order)
│   │   ├── locked: boolean
│   │   ├── visible: boolean
│   │   ├── volume: number (0..1, audio tracks)
│   │   └── clips: Clip[]
│   │       ├── id: string
│   │       ├── assetId: string (→ Asset.id)
│   │       ├── trackId: string (→ Track.id)
│   │       ├── timelineIn: number (frame)
│   │       ├── timelineOut: number (frame)
│   │       ├── sourceIn: number (frame)
│   │       ├── sourceOut: number (frame)
│   │       ├── transform: ClipTransform
│   │       │   ├── x, y: number
│   │       │   ├── scaleX, scaleY: number
│   │       │   ├── rotation: number (degrees)
│   │       │   ├── anchorX, anchorY: number (0..1)
│   │       │   └── opacity: number (0..1)
│   │       ├── effects: EffectInstance[]
│   │       └── keyframes: KeyframeTrack[]
│   └── transitions: Transition[]
│       ├── id: string
│       ├── type: string (registry key)
│       ├── clipAId: string
│       ├── clipBId: string
│       ├── duration: number (frames)
│       ├── params: Record<string, unknown>
│       └── easing: EasingType
├── motionPresets: MotionPreset[]
│   ├── id: string
│   ├── name: string
│   ├── keyframeTracks: KeyframeTrack[]
│   └── category: string
└── exportSettings: ExportSettings
    ├── format: string ('mp4', 'webm', 'gif')
    ├── codec: string ('h264', 'vp9', 'prores')
    ├── bitrate: number
    ├── resolution: { width, height }
    └── frameRate: number
```

### Supporting Types

```
EffectInstance
├── id: string
├── effectType: string              # Registry key (e.g. 'gaussian-blur')
├── enabled: boolean
├── params: Record<string, unknown> # Current static values
└── keyframes: KeyframeTrack[]      # Animated params

KeyframeTrack
├── property: string                # Dotted path (e.g. 'transform.x', 'effects.0.params.radius')
└── keyframes: Keyframe[]

Keyframe
├── frame: number                   # Relative to clip start (0 = first frame of clip)
├── value: number | string
├── easing: EasingType
└── tangent: { inX, inY, outX, outY }  # For cubic-bezier curves

EasingType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'cubic-bezier'
```

### Design Rationale

| Decision | Rationale |
|----------|-----------|
| **Frame-based, not time-based** | Prevents floating-point drift. Snapping, alignment, and arithmetic are trivial with integers. Convert to seconds only at display/export boundaries. |
| **Assets separate from clips** | One source file can appear as multiple clips. Deleting a clip does not delete the file. Assets are the library; clips are the arrangement. |
| **Effects are data, not code** | The project file never contains executable code. Effect behavior is resolved at runtime via the effect registry. Projects are safe to share, diff, and version. |
| **Keyframes are per-property** | Animate `transform.x` independently from `opacity`. No wasted storage for properties that are not animated. Interpolation is simple: one track, one curve. |

---

## 3. Module Boundaries

Each package has a clear owner, a narrow public API, and explicit dependencies. No circular dependencies are permitted.

| Package | Owns | Public API | Dependencies |
|---------|------|------------|--------------|
| `@rough-cut/project-model` | TypeScript types, Zod schemas, validators, factory functions, schema versioning + migrations | Types, schemas, `createProject()`, `createClip()`, `validateProject()`, `migrate()`, `CURRENT_SCHEMA_VERSION` | **None** (zero deps) |
| `@rough-cut/timeline-engine` | Pure timeline operations (no side effects) | `placeClip()`, `trimClip()`, `splitClip()`, `resolveOverlaps()`, `snapToGrid()` | project-model |
| `@rough-cut/effect-registry` | Effect definitions, parameter interpolation | `registerEffect()`, `getEffect()`, `interpolateParam()`, `evaluateKeyframes()` | project-model |
| `@rough-cut/preview-renderer` | PixiJS compositor for live preview | `PreviewCompositor`: `setProject()`, `seekTo()`, `play()`, `pause()`, `resize()` | project-model, effect-registry, pixi.js |
| `@rough-cut/export-renderer` | Headless frame-by-frame renderer for final output | `ExportPipeline`: `start()`, `abort()`, `onProgress()` | project-model, effect-registry |
| `@rough-cut/capture` | Recording orchestration (main process only) | `CaptureSession`: `start()`, `stop()`, `pause()`, events | Electron (main only) |
| `@rough-cut/store` | Zustand slices, undo/redo, selectors | Store slices, actions, selectors, `useProjectStore()` | project-model, timeline-engine, zustand |
| `@rough-cut/ipc` | Typed IPC contract, bridge setup | `IpcContract` type, `createMainHandler()`, `createRendererClient()` | electron |
| `@rough-cut/ai-bridge` | AI provider abstraction. **AI writes only metadata** (marks, labels, suggested cuts) into the project model — it never directly mutates clips. All clip mutations go through store/timeline-engine. | `AiProvider` interface, `suggestCuts()`, `generateCaptions()` | project-model |
| `@rough-cut/ui` | Tab shell (AppShell, TabBar, shared layout) + per-tab submodules (`components/record/`, `components/edit/`, etc.). Each tab owns its own components, hooks, and local state. | React components | store, preview-renderer |

### Dependency Rules

```
                  ┌─────────────────────┐
                  │   project-model     │  ← ZERO dependencies
                  └──────────┬──────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
    ┌─────────▼──────┐ ┌────▼─────────┐ ┌──▼──────────┐
    │ timeline-engine│ │effect-registry│ │  ai-bridge   │
    └─────────┬──────┘ └────┬────┬────┘ └─────────────┘
              │             │    │
              │    ┌────────┘    └────────┐
              │    │                      │
    ┌─────────▼────▼─────┐  ┌────────────▼───────────┐
    │  preview-renderer   │  │    export-renderer      │
    └─────────┬──────────┘  └────────────────────────┘
              │                        (main process)
    ┌─────────▼──────────┐
    │       store         │ ← also depends on timeline-engine
    └─────────┬──────────┘
              │
    ┌─────────▼──────────┐
    │         ui          │
    └────────────────────┘
```

1. **`project-model`** depends on NOTHING. It is the foundation.
2. **`timeline-engine`** and **`effect-registry`** depend only on `project-model`. They contain pure logic — fully testable without any runtime.
3. **`preview-renderer`** and **`export-renderer`** both depend on `effect-registry` but NEVER on each other.
4. **`ui`** NEVER imports from `preview-renderer` directly. A thin `PreviewCanvas` adapter component may host the canvas element and manage the compositor lifecycle, but rendering logic stays in `preview-renderer`.
5. **`capture`** runs exclusively in the main process. It is never imported by renderer code.
6. **`store`** NEVER imports from `ui`. Data flows one way: store → ui.

### App Workspaces (Tabs)

The app is organized into 5 workspaces, each a top-level tab:

| Tab | Purpose | Primary Model Concern |
|-----|---------|----------------------|
| **Record** | Capture screen, webcam, audio | Creates Assets (via capture → IPC) |
| **Edit** | Timeline editing, clip arrangement | Reads/writes Composition (tracks, clips) |
| **Motion** | Animated templates, keyframes | Reads/writes MotionPresets, clip keyframes |
| **AI** | AI-powered suggestions | Creates AIAnnotations (metadata only — never directly mutates clips) |
| **Export** | Render final output | Reads entire ProjectDocument, drives export pipeline |

`@rough-cut/ui` owns the tab shell (AppShell, TabBar, shared layout). Each tab owns its own submodule directory with tab-specific components, hooks, and local state.

---

## 4. Rendering Architecture

### Preview vs Export: Fundamentally Different Pipelines

Preview and export are **not** the same pipeline at different quality levels — they are architecturally distinct systems:

| | Preview | Export |
|---|---------|--------|
| **Goal** | Interactive feedback | Pixel-perfect output |
| **Process** | Renderer (GPU, WebGL via PixiJS) | Main (headless, Canvas2D or small WebGL) |
| **Frame rate** | Display refresh, may skip frames | Every frame, deterministic |
| **Quality** | Draft during scrub, full when paused | Always full quality |
| **Blocking** | Never blocks UI | Runs in background, reports progress |

They share the same **effect definitions** and **keyframe interpolation math** (from `@rough-cut/effect-registry`) to guarantee visual parity, but their rendering implementations are independent.

### Shared Effect Definitions

Both the preview compositor and the export pipeline consume the same effect definitions. Each definition provides implementations for both rendering targets:

```typescript
interface EffectDefinition {
  type: string;                                    // 'gaussian-blur'
  name: string;                                    // 'Gaussian Blur'
  category: 'blur' | 'color' | 'transform' | 'stylize' | 'motion';
  params: ParamDefinition[];                       // Schema for UI + validation

  // Preview (renderer process, PixiJS)
  createPreviewFilter: (params: ResolvedParams) => PIXI.Filter;
  updatePreviewFilter: (filter: PIXI.Filter, params: ResolvedParams) => void;

  // Export (main process, Canvas2D or headless WebGL — must be deterministic)
  renderExportFrame: (ctx: CanvasRenderingContext2D | WebGLRenderingContext, source: ImageData, params: ResolvedParams) => ImageData;
}
```

Both preview and export call the same `evaluateKeyframeTracks()` function from `@rough-cut/effect-registry` to resolve parameter values at any given frame. **This guarantees visual parity between what the user sees in the editor and what gets exported.**

### Preview Pipeline (Renderer Process)

```
ProjectStore ──subscribe──▶ PreviewCompositor (PixiJS)
                                    │
                            on seekTo() / play tick
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │ 1. Query active clips at frame │
                    │ 2. For each clip (z-ordered):  │
                    │    - Resolve source frame       │
                    │    - Evaluate keyframes          │
                    │    - Load/cache texture          │
                    │    - Apply transform             │
                    │    - Apply effects (PIXI filters)│
                    │ 3. Blend transitions             │
                    │ 4. PixiJS renders to <canvas>    │
                    └───────────────────────────────┘
```

Key implementation details:

- **Texture cache**: LRU cache (120 frames default) avoids redundant decoding during scrubbing.
- **Playback clock**: `requestAnimationFrame`-based loop with frame-accurate timing derived from `performance.now()`.
- **Audio sync**: Web Audio API playback is synchronized with the visual clock. Audio nodes are created per audio clip and scheduled against the timeline.

### Export Pipeline (Main Process)

```
ProjectDocument + ExportSettings
        │
        ▼
  for frame = 0 to composition.duration:
        │
        ├─▶ 1. Same clip resolution logic as preview
        ├─▶ 2. Same keyframe interpolation (shared from effect-registry)
        ├─▶ 3. Render to OffscreenCanvas / node-canvas
        ├─▶ 4. Apply effects via Canvas2D / WebGL (export implementation)
        └─▶ 5. Extract RGBA buffer → pipe to FFmpeg stdin
                    │
                    ▼
          FFmpeg encodes frame
                    │
        Audio mixed separately ──▶ FFmpeg muxes final output
                    │
          Progress reported via IPC
```

### Frame Decoding Strategy — Spike-Validated

> **Spike 1 validated**: FFmpeg CLI per-frame spawn is ~130-180ms (unusable for preview). Persistent FFmpeg sequential decode is ~57ms/frame (fine for export). WebCodecs is the only viable preview decoder.

| Context | Decoder | Details |
|---------|---------|---------|
| **Preview** | WebCodecs `VideoDecoder` in renderer | Container demux via `mp4box.js`. Hardware-accelerated. Frame-accurate — we control exactly which chunks to decode. No FFmpeg per-frame spawning in the UI path. |
| **Export** | Persistent FFmpeg child process in main | Sequential decode + encode. ~57ms/frame for 1080p is acceptable for offline rendering. No HTML5 `<video>` in the export path. |
| **Fallback (scrubbing)** | FFmpeg fast-seek or `<video>` keyframe snap | If WebCodecs is unavailable for a given codec, use keyframe-snapped draft mode for scrubbing only. Export always uses frame-accurate FFmpeg. |

**Not used**: HTML5 `<video>` element seeking — architecturally wrong for a video editor (seeks to nearest keyframe, can be off by 60+ frames with typical GOP sizes).

### Built-in Effects (v1)

| Effect | Category | Key Params |
|--------|----------|------------|
| Gaussian Blur | `blur` | `radius`, `quality` |
| Zoom & Pan | `transform` | `centerX`, `centerY`, `scale` |
| Color Correct | `color` | `brightness`, `contrast`, `saturation`, `temperature` |
| Drop Shadow | `stylize` | `offsetX`, `offsetY`, `blur`, `color`, `opacity` |
| Round Corners | `stylize` | `radius` |
| Background Blur | `blur` | `radius`, `padding` |
| Fade In/Out | `motion` | `duration`, `easing` |
| Cursor Highlight | `stylize` | `radius`, `color`, `opacity` |

### Transitions (Separate from Effects)

Transitions and effects are **parallel systems**, not a hierarchy:

| | Effects | Transitions |
|---|---------|-------------|
| **Inputs** | ONE clip | TWO clips (A, B) |
| **Parameterization** | Arbitrary params + keyframes | `progress` (0 → 1) + params |
| **Stored on** | `Clip.effects[]` | `Composition.transitions[]` |
| **Interface** | `EffectDefinition` | `TransitionDefinition` |

A transition blends `clipA` and `clipB` over a duration. The blending function receives both rendered frames and a normalized `progress` value. This separation keeps the interfaces clean and avoids contorting effects to handle the two-input case.

---

## 5. Recording Pipeline

### Full Recording Flow

```
┌──────────────────────────────────────────────────────────────┐
│  RENDERER                                                     │
│                                                               │
│  User configures capture in Record tab                        │
│  (source selection, webcam toggle, audio input)               │
│         │                                                     │
│         │  IPC: capture.start(config)                         │
└─────────┼────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────┐
│  MAIN PROCESS                                                 │
│                                                               │
│  1. desktopCapturer.getSources() → select screen/window       │
│  2. Create MediaStreams:                                       │
│     - Screen capture stream                                   │
│     - Webcam stream (if enabled)                              │
│     - Audio input stream (system + mic)                       │
│  3. MediaRecorder writes chunks to temp files                 │
│  4. Stream low-res preview frames → renderer (for live view)  │
│                                                               │
│  On stop:                                                     │
│  5. Finalize temp files                                       │
│  6. FFmpeg probe → extract duration, resolution, codec info   │
│  7. Generate thumbnail                                        │
│  8. Return AssetInfo via IPC                                  │
└──────────────────────────────────────────────────────────────┘
          │
          │  IPC: capture.complete(assetInfo)
          ▼
┌──────────────────────────────────────────────────────────────┐
│  RENDERER                                                     │
│                                                               │
│  store.addAsset(assetInfo)                                    │
│  Auto-create clips on timeline (one per track/stream)         │
└──────────────────────────────────────────────────────────────┘
```

### Key Decisions

- **Recording produces assets + metadata, not clips.** The capture system writes media files and creates Asset entries populated with probed metadata (duration, resolution, codec, frame count). Timeline clips are a separate authoring concern — the UI creates Clip entries on tracks by referencing assets. Capture never touches timeline logic; the timeline never touches capture logic.
- **Separate streams, separate files.** Screen, webcam, and audio are recorded as independent assets placed on independent tracks. This allows the user to reposition the webcam overlay, adjust audio independently, and trim each stream separately.
- **Swappable capture backend.** The `CaptureSession` delegates to a `CaptureBackend` interface. The default backend uses Electron's `desktopCapturer`, but this can be swapped for platform-specific solutions (e.g., native screen capture APIs) without changing the orchestration logic.
- **Post-capture FFmpeg probe.** Instead of trusting MediaRecorder metadata (which can be unreliable), the system runs `ffprobe` on the finalized file to extract accurate duration, resolution, frame count, and codec information. This metadata populates the Asset entry.

### Platform Status (Spike-Validated)

| Platform | Status | Notes |
|----------|--------|-------|
| **Linux (X11)** | ✅ First-class | `desktopCapturer` works programmatically. System audio via PipeWire/PulseAudio monitor sources. Webcam + mic confirmed. |
| **Linux (Wayland)** | ⚠️ Limited | Portal picker required (no programmatic source selection). Accepted limitation for v1. |
| **macOS** | ❓ Pending spike | TCC permissions, system audio (requires BlackHole/virtual device). |
| **Windows** | ❓ Pending spike | DXGI, WASAPI loopback for system audio. |

**Architecture decision**: Linux (X11) is the primary supported Linux mode for v1. Wayland runs via portal with UX limitations. `CaptureBackend` must support different strategies per platform.

---

## 6. State Management

> **Zustand confirmed via spike (2026-03-26).** Split-store architecture: a **transport store** (playhead, isPlaying, playbackRate) is kept separate from the **project store** (clips, tracks, effects, assets). This prevents every playhead tick from invalidating timeline selectors. `selectActiveClipsAtFrame` measured at <0.005ms for 100 clips and <0.01ms for 5000 clips — well under the 1ms budget. zundo confirmed for undo/redo (analytical: <1ms push, <5ms restore).

### Store Architecture

```
useTransportStore (Zustand — separate store, 30-60Hz updates)
├── playhead: number (current frame)
├── isPlaying: boolean
└── playbackRate: number

useProjectStore (Zustand — project mutations, undo-able)
├── project       ─── ProjectDocument metadata (name, settings)
├── assets        ─── Asset[] management (add, remove, update)
├── composition   ─── Tracks, clips, transitions (all timeline data)
├── selection     ─── selectedClipIds, selectedTrackId, selectedKeyframes
├── ui            ─── activeTab, panelSizes, inspectorState
└── history       ─── undo/redo (via zundo/temporal)
```

> **Spike 3 validated**: Split-store architecture confirmed. `selectActiveClipsAtFrame` runs in <0.005ms for 100 clips, <0.01ms for 5000 clips — no interval tree needed. zundo snapshot-based undo is acceptable for 1000+ clips (~100KB per snapshot). React clip components subscribe ONLY to `useProjectStore`; playhead/transport UI subscribes ONLY to `useTransportStore`.

### Middleware Stack

| Middleware | Purpose |
|------------|---------|
| `immer` | Immutable updates with mutable syntax. All state mutations go through immer producers. |
| `temporal` (zundo) | Undo/redo. Snapshots relevant slices on every mutation. Configurable throttle for rapid operations. |
| `devtools` | Redux DevTools integration for state inspection during development. |
| `subscribeWithSelector` | Fine-grained subscriptions. The preview compositor subscribes to only the data it needs. |

### Key Selectors

```typescript
selectActiveClipsAtFrame(frame: number): Clip[]
selectClipEffectParams(clipId: string, frame: number): ResolvedParams[]
selectTracksByType(type: 'video' | 'audio'): Track[]
selectAssetById(id: string): Asset | undefined
selectSelectedClips(): Clip[]
```

### Access Patterns

| Consumer | Store | How |
|----------|-------|-----|
| Clip components | `useProjectStore` only | `useProjectStore(s => s.composition.tracks)` — never re-renders from playhead |
| Playhead indicator | `useTransportStore` only | `useTransportStore(s => s.playhead)` — updates at 60Hz |
| PreviewCompositor | Both | `transportStore.subscribe()` for frame, `projectStore.subscribe()` for content changes |
| Effect inspector | Both | `useTransportStore(s => s.playhead)` for current values, `useProjectStore` for effect data |
| IPC handlers | `useProjectStore` | `projectStore.getState()` / `projectStore.setState()` |

### Undo/Redo Strategy

- **zundo** snapshots the `project`, `assets`, and `composition` slices.
- **Excluded from history:** `playback` (current frame, play state) and `ui` (panel sizes, active tab). These are ephemeral.
- **Mutation grouping:** Rapid sequential mutations (e.g., dragging a clip across the timeline) are grouped into a single undo step using a debounce window. The user presses Ctrl+Z once to undo the entire drag, not each intermediate position.

---

## 7. IPC Architecture

### Typed Contract

The IPC contract is defined in `@rough-cut/ipc` and shared between main and renderer. Every channel, its request payload, and its response type are statically typed.

| Domain | Channels | Direction |
|--------|----------|-----------|
| **Capture** | `capture.start`, `capture.stop`, `capture.preview-frame`, `capture.status` | Renderer → Main, Main → Renderer (preview frames) |
| **Export** | `export.start`, `export.cancel`, `export.progress`, `export.complete` | Renderer → Main (commands), Main → Renderer (progress/complete) |
| **File I/O** | `file.save`, `file.load`, `file.pick-file`, `file.autosave` | Renderer → Main |
| **Assets** | `asset.import`, `asset.probe`, `asset.thumbnail`, `asset.delete` | Renderer → Main |
| **AI** | `ai.suggest-cuts`, `ai.generate-captions`, `ai.status` | Renderer → Main, Main → Renderer (streaming results) |

### Boundary Rule

> **If it touches the file system, spawns a process, or runs longer than 16ms** → main process.
> **If it touches the DOM or needs sub-16ms response** → renderer process.

This rule determines where every operation lives. No exceptions.

---

## 8. Effect System Design

### Three Constraints

Every effect must satisfy all three constraints simultaneously:

1. **Serialized as data** — stored in the project model as an `EffectInstance` (type string + params object). No code in the project file.
2. **Rendered in PixiJS preview** — provides `createPreviewFilter()` and `updatePreviewFilter()` for real-time display.
3. **Rendered in export pipeline** — provides `renderExportFrame()` for pixel-accurate offline rendering.

### Registry Pattern

Effect definitions are registered at application startup:

```typescript
// Built-in effects registered during app initialization
registerEffect(gaussianBlurEffect);
registerEffect(zoomPanEffect);
registerEffect(colorCorrectEffect);
// ...

// Future: third-party effects use the same call
registerEffect(myCustomEffect);
```

The registry maps `effectType` strings (e.g., `'gaussian-blur'`) to `EffectDefinition` objects. When the renderer encounters an `EffectInstance` in the project, it looks up the definition by type and delegates to the appropriate render function.

### Keyframe Interpolation — Shared Logic

```
effect-registry
├── evaluateKeyframeTracks(tracks, frame) → ResolvedParams
├── interpolateValue(k1, k2, t, easing) → value
└── resolveEasing(type, tangent) → (t) => t
```

Both the preview compositor and the export pipeline call `evaluateKeyframeTracks()` with the same inputs and get the same outputs. **Same math, same results, guaranteed visual parity.**

---

## 9. Folder Structure

```
rough-cut/
├── package.json                        # Workspace root
├── pnpm-workspace.yaml                 # pnpm workspace config
├── turbo.json                          # Turborepo pipeline config
├── tsconfig.base.json                  # Shared TypeScript config
│
├── apps/
│   └── desktop/                        # Electron application
│       ├── package.json
│       ├── electron-builder.yml
│       └── src/
│           ├── main/                   # ── Main Process ──
│           │   ├── index.ts            # Entry point, window creation
│           │   ├── capture/            # CaptureSession, CaptureBackend
│           │   │   ├── capture-session.ts
│           │   │   └── backends/
│           │   │       └── electron-capturer.ts
│           │   ├── export/             # ExportPipeline, FFmpeg writer
│           │   │   ├── export-pipeline.ts
│           │   │   └── ffmpeg-writer.ts
│           │   ├── file-io/            # Project save/load, autosave
│           │   │   └── project-io.ts
│           │   └── ai/                 # AI worker bridge
│           │       └── ai-worker.ts
│           ├── renderer/               # ── Renderer Process ──
│           │   ├── index.html
│           │   ├── main.tsx            # React entry
│           │   └── App.tsx
│           └── preload/                # ── Preload Script ──
│               └── index.ts            # Typed IPC exposure via contextBridge
│
├── packages/
│   ├── project-model/                  # ZERO deps foundation
│   │   ├── package.json
│   │   └── src/
│   │       ├── types.ts                # All TypeScript interfaces
│   │       ├── schemas.ts              # Zod validation schemas
│   │       ├── factories.ts            # createProject(), createClip(), etc.
│   │       └── index.ts
│   │
│   ├── timeline-engine/                # Pure timeline logic
│   │   ├── package.json
│   │   └── src/
│   │       ├── place-clip.ts
│   │       ├── trim-clip.ts
│   │       ├── split-clip.ts
│   │       ├── resolve-overlaps.ts
│   │       ├── snap.ts
│   │       └── index.ts
│   │
│   ├── effect-registry/                # Effects + interpolation
│   │   ├── package.json
│   │   └── src/
│   │       ├── registry.ts             # registerEffect(), getEffect()
│   │       ├── interpolation.ts        # evaluateKeyframes(), interpolateParam()
│   │       ├── effects/                # Built-in effect definitions
│   │       │   ├── gaussian-blur.ts
│   │       │   ├── zoom-pan.ts
│   │       │   ├── color-correct.ts
│   │       │   ├── drop-shadow.ts
│   │       │   ├── round-corners.ts
│   │       │   ├── background-blur.ts
│   │       │   ├── fade.ts
│   │       │   └── cursor-highlight.ts
│   │       ├── transitions/            # Built-in transition definitions
│   │       │   ├── cross-dissolve.ts
│   │       │   ├── wipe.ts
│   │       │   └── slide.ts
│   │       └── index.ts
│   │
│   ├── preview-renderer/               # PixiJS compositor
│   │   ├── package.json
│   │   └── src/
│   │       ├── preview-compositor.ts   # Main compositor class
│   │       ├── texture-cache.ts        # LRU texture cache
│   │       ├── playback-clock.ts       # rAF-based frame clock
│   │       ├── audio-sync.ts           # Web Audio synchronization
│   │       └── index.ts
│   │
│   ├── export-renderer/                # Headless frame renderer
│   │   ├── package.json
│   │   └── src/
│   │       ├── export-pipeline.ts
│   │       ├── frame-decoder.ts        # FFmpeg-based frame extraction
│   │       ├── audio-mixer.ts
│   │       └── index.ts
│   │
│   ├── store/                          # Zustand store
│   │   ├── package.json
│   │   └── src/
│   │       ├── slices/
│   │       │   ├── project.ts
│   │       │   ├── assets.ts
│   │       │   ├── composition.ts
│   │       │   ├── playback.ts
│   │       │   ├── selection.ts
│   │       │   └── ui.ts
│   │       ├── selectors/
│   │       │   ├── clip-selectors.ts
│   │       │   ├── track-selectors.ts
│   │       │   └── playback-selectors.ts
│   │       ├── actions/
│   │       │   ├── clip-actions.ts
│   │       │   ├── track-actions.ts
│   │       │   └── asset-actions.ts
│   │       ├── middleware/
│   │       │   ├── undo-redo.ts        # zundo configuration
│   │       │   └── persistence.ts      # Autosave trigger
│   │       └── index.ts                # useProjectStore()
│   │
│   ├── ipc/                            # Typed IPC contract
│   │   ├── package.json
│   │   └── src/
│   │       ├── contract.ts             # IpcContract type definition
│   │       ├── main-handler.ts         # createMainHandler()
│   │       ├── renderer-client.ts      # createRendererClient()
│   │       └── index.ts
│   │
│   ├── ai-bridge/                      # AI provider abstraction
│   │   ├── package.json
│   │   └── src/
│   │       ├── provider.ts             # AiProvider interface
│   │       ├── suggest-cuts.ts
│   │       ├── generate-captions.ts
│   │       └── index.ts
│   │
│   └── ui/                             # All React components
│       ├── package.json
│       └── src/
│           └── components/
│               ├── layout/             # AppShell, TabBar, StatusBar
│               ├── preview/            # PreviewCanvas, TransportControls
│               ├── timeline/           # Timeline, Track, Clip, Playhead
│               ├── inspector/          # ClipInspector, EffectControls, KeyframeEditor
│               ├── record/             # RecordTab, SourcePicker, RecordingIndicator
│               ├── motion/             # MotionTab, PresetBrowser, PresetCard
│               ├── ai/                 # AiTab, SuggestionCard, CaptionEditor
│               └── export/             # ExportTab, FormatPicker, ProgressBar
│
├── tools/                              # Shared tooling configs
│   ├── eslint-config/
│   └── tsconfig/
│
└── docs/                               # Architecture, ADRs
    ├── ARCHITECTURE.md                 # This document
    └── adr/                            # Architecture Decision Records
```

---

## 10. Architecture Decision Records (Summary)

| ADR | Decision | Status | Rationale |
|-----|----------|--------|-----------|
| **ADR-001** | Frame-based timeline (not time-based) | Accepted | Integer arithmetic prevents floating-point drift. Snapping and alignment are trivial. Convert to seconds only at display and export boundaries. |
| **ADR-002** | Zustand over Redux, split-store architecture | Accepted — validated by spike | Less ceremony for a media app where performance matters. First-class subscriptions outside React (preview compositor). `zundo` provides undo/redo with minimal configuration. Immer middleware gives immutable updates with mutable syntax. **Spike (2026-03-26) confirmed:** transport store (playhead/isPlaying) split from project store prevents high-frequency playback ticks from invalidating timeline selectors. `selectActiveClipsAtFrame` runs in <0.005ms for 100 clips, <0.01ms for 5000 clips. |
| **ADR-003** | Separate preview and export renderers | Accepted | Preview needs 60fps interactivity (PixiJS/WebGL in renderer process). Export needs frame-accurate offline rendering (headless Canvas in main process). Coupling them would compromise both: the preview would block on heavy frames, and the export would inherit browser rendering quirks. |
| **ADR-004** | Effect registry pattern (not class hierarchy) | Accepted | Open for extension without modification. Third-party effects register the same way as built-ins. No class inheritance to manage. Effect definitions are plain objects — easy to test, easy to serialize metadata. |
| **ADR-005** | Recording produces assets, not clips | Accepted | Clean separation of capture and editing. Recording writes files and creates asset entries. The user (or automation) then places those assets as clips on the timeline. This prevents the recording system from needing to understand timeline logic. |
| **ADR-006** | Turborepo + pnpm over Nx | Accepted | Right-sized for the project. Turborepo handles task orchestration and caching. pnpm handles dependency management with strict hoisting. Lower configuration overhead and less vendor lock-in compared to Nx. |

---

*Last updated: 2026-03-26*
