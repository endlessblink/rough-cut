# Rough Cut — Architectural Invariant Checklist

> This document defines the hard rules that MUST NOT be violated during implementation.
> Each invariant includes the rule, the reasoning behind it, how to verify it, a violation example, and the correct pattern.
> Violations must be caught at code review time or earlier via CI.

---

## Table of Contents

1. [Frame-Based Timeline Invariants](#1-frame-based-timeline-invariants)
2. [Project Model Purity Invariants](#2-project-model-purity-invariants)
3. [Package Boundary Invariants](#3-package-boundary-invariants)
4. [Rendering Pipeline Invariants](#4-rendering-pipeline-invariants)
5. [Recording Pipeline Invariants](#5-recording-pipeline-invariants)
6. [State Management Invariants](#6-state-management-invariants)
7. [IPC Invariants](#7-ipc-invariants)
8. [Effect System Invariants](#8-effect-system-invariants)
9. [AI Pipeline Invariants](#9-ai-pipeline-invariants)
10. [CI Enforcement](#10-ci-enforcement)
11. [Code Review Checklist](#11-code-review-checklist)

---

## 1. Frame-Based Timeline Invariants

### INV-FRAME-01: All timeline positions are integers

**Rule:** Every field that represents a position, duration, or offset in the project model (`timelineIn`, `timelineOut`, `sourceIn`, `sourceOut`, `duration`, `frame`, `position`) MUST be an integer. No floating-point frame values anywhere in the model or in timeline-engine logic.

**Why:** Floating-point arithmetic accumulates drift. When clips are trimmed, split, or snapped, fractional frames cause alignment errors that are invisible in isolation but compound over an edit session. Integer arithmetic is exact and trivial to snap.

**How to verify:**
- TypeScript: All timeline position fields typed as `FrameNumber` (branded `number` with integer constraint).
- Unit test: `placeClip()`, `trimClip()`, `splitClip()` all produce integer outputs for all integer inputs.
- Runtime assertion (dev mode): `Number.isInteger(value)` guard in every factory function (`createClip()`, etc.).

**Violation example:**
```typescript
// WRONG: position derived from milliseconds without rounding
const clip: Clip = {
  timelineIn: (timestamp / 1000) * fps,  // may produce 23.999999...
  timelineOut: (endTimestamp / 1000) * fps,
};
```

**Correct example:**
```typescript
// RIGHT: convert at the boundary, round immediately
const timelineIn: FrameNumber = Math.round((timestamp / 1000) * fps) as FrameNumber;
const clip: Clip = { timelineIn, timelineOut: timelineIn + durationFrames };
```

---

### INV-FRAME-02: Seconds appear only at display and export boundaries

**Rule:** Conversion between frames and seconds (`frames / fps`, `seconds * fps`) must occur ONLY at two places: (a) UI display layer when rendering a time label for the user, and (b) export pipeline when writing timestamps to FFmpeg. Nowhere else.

**Why:** Mixing frames and seconds in internal logic creates an implicit dependency on the project's `frameRate` setting throughout the codebase. Changing fps then becomes a multi-file refactor instead of a single config change.

**How to verify:**
- ESLint rule: ban the pattern `/ fps` and `* fps` inside `packages/timeline-engine`, `packages/project-model`, `packages/store`, `packages/effect-registry`.
- Code review: any new use of `/fps` or `*fps` outside `packages/ui` or the export pipeline triggers a flag.

**Violation example:**
```typescript
// WRONG: timeline-engine computing seconds
export function getClipDuration(clip: Clip, fps: number): number {
  return (clip.timelineOut - clip.timelineIn) / fps; // returns seconds — wrong layer
}
```

**Correct example:**
```typescript
// RIGHT: timeline-engine returns frames; UI converts at display time
export function getClipDurationFrames(clip: Clip): FrameNumber {
  return (clip.timelineOut - clip.timelineIn) as FrameNumber;
}

// In a React component:
const durationSeconds = getClipDurationFrames(clip) / project.settings.frameRate;
const label = formatTime(durationSeconds);
```

---

### INV-FRAME-03: Keyframe `frame` field is relative to clip start

**Rule:** Keyframes stored on a clip (`Clip.effects[].keyframes`, `Clip.keyframes`) use frame numbers relative to the clip's own start (0 = first frame of clip). Absolute composition frame numbers are never stored in a clip's keyframes.

**Why:** Clips can be moved on the timeline. If keyframes store absolute frames, every clip move requires updating all keyframe values. Relative frames make the clip self-contained and moveable without mutation.

**How to verify:**
- Unit test: move a clip by N frames, serialize, reload — all keyframe `frame` values remain unchanged.
- Code review: any code that stores `composition.currentFrame` into a keyframe `frame` field is a violation.

**Violation example:**
```typescript
// WRONG: storing absolute timeline frame in keyframe
addKeyframe(clip, effectId, property, {
  frame: store.getState().playback.currentFrame, // absolute — wrong
  value: 0.5,
});
```

**Correct example:**
```typescript
// RIGHT: compute position relative to clip start
const relativeFrame = (store.getState().playback.currentFrame - clip.timelineIn) as FrameNumber;
addKeyframe(clip, effectId, property, { frame: relativeFrame, value: 0.5 });
```

---

### INV-FRAME-04: No sub-frame precision in the public API

**Rule:** Public API functions in `timeline-engine` and `effect-registry` do not accept or return fractional frames. If a caller passes a float, the function rounds before use.

**Why:** The rendering pipelines call these functions in tight loops. Allowing float frames silently would corrupt clip queries (a clip at frame 10 won't be found when the query uses frame 9.9999).

**How to verify:**
- TypeScript: parameter types are branded `FrameNumber`, preventing accidental float assignment.
- Unit test: `selectActiveClipsAtFrame(9.7)` and `selectActiveClipsAtFrame(10)` return the same result for a clip starting at frame 10.

**Violation example:**
```typescript
// WRONG: function accepts raw number allowing floats
function selectActiveClipsAtFrame(frame: number, tracks: Track[]): Clip[] { ... }
```

**Correct example:**
```typescript
// RIGHT: branded type enforces integer contract at call sites
type FrameNumber = number & { readonly __brand: 'FrameNumber' };
function selectActiveClipsAtFrame(frame: FrameNumber, tracks: Track[]): Clip[] { ... }
```

---

## 2. Project Model Purity Invariants

### INV-MODEL-01: ProjectDocument contains only plain data — no methods, no classes

**Rule:** Every type in `@rough-cut/project-model` must be a plain TypeScript interface or type alias. No class instances, no method definitions on interfaces, no `Date` objects, no `Map`, no `Set`, no circular object references.

**Why:** The project document must round-trip through `JSON.stringify` / `JSON.parse` without loss. Class instances lose their prototype chain. Circular refs throw. Non-JSON types (`Date`, `Map`) serialize incorrectly. Plain data is also diffable, testable, and safe to share.

**How to verify:**
- CI check: `JSON.parse(JSON.stringify(project))` produces a deeply equal object in the project-model test suite.
- TypeScript: `satisfies` constraint against a `JsonSerializable` recursive type applied to `ProjectDocument`.
- ESLint: no `class` keyword allowed inside `packages/project-model/src`.

**Violation example:**
```typescript
// WRONG: Clip as a class with methods
class Clip {
  id: ClipId;
  timelineIn: FrameNumber;
  getDuration(): number { return this.timelineOut - this.timelineIn; }
  clone(): Clip { return new Clip(...); }
}
```

**Correct example:**
```typescript
// RIGHT: plain interface, logic lives in timeline-engine
interface Clip {
  id: ClipId;
  timelineIn: FrameNumber;
  timelineOut: FrameNumber;
}
// Pure function in timeline-engine:
function getClipDuration(clip: Clip): FrameNumber { ... }
```

---

### INV-MODEL-02: The project model includes a `version` field and every breaking change increments it

**Rule:** `ProjectDocument.version` must be present. Any change to the schema that makes a previously valid document invalid (rename, remove, or type-change of a field) must increment `CURRENT_SCHEMA_VERSION` and add a migration function in the migration chain.

**Why:** Users save projects to disk. Without versioning, a newer app version silently breaks or corrupts saved files. The migration chain ensures any historical document is upgraded to the current schema before use.

**How to verify:**
- CI: migration test suite runs every migration step against a snapshot of the document at that version and asserts the output matches the next version's schema.
- Code review: any PR touching `packages/project-model/src/types.ts` must check whether `CURRENT_SCHEMA_VERSION` needs incrementing.

**Violation example:**
```typescript
// WRONG: renaming a field without a migration
interface Clip {
  startFrame: FrameNumber; // was: timelineIn — no migration added
}
```

**Correct example:**
```typescript
// RIGHT: bump version, add migration
export const CURRENT_SCHEMA_VERSION = 4; // was 3

// In migrations.ts:
const v3ToV4 = (doc: V3Document): V4Document => ({
  ...doc,
  version: 4,
  composition: {
    ...doc.composition,
    tracks: doc.composition.tracks.map(track => ({
      ...track,
      clips: track.clips.map(clip => ({
        ...clip,
        timelineIn: clip.startFrame, // rename
        timelineOut: clip.startFrame + clip.duration,
      })),
    })),
  },
});
```

---

### INV-MODEL-03: project-model has zero runtime dependencies

**Rule:** `packages/project-model/package.json` must list zero `dependencies`. `devDependencies` are acceptable for testing only (e.g., `zod` may be a devDep if schemas are used only at validation boundaries, not embedded in types). If Zod is used for runtime validation it must be the only allowed dependency.

**Why:** project-model is the foundation every other package builds on. If it pulls in a dependency, that dependency propagates to every consumer. Keeping it lean ensures the model can be used in any context (tests, workers, scripts) without a heavy install.

**How to verify:**
- CI: `jq '.dependencies | length' packages/project-model/package.json` returns `0` (or `1` if Zod is explicitly allowed).
- Turborepo dependency graph check.

**Violation example:**
```json
// WRONG: project-model/package.json
{
  "dependencies": {
    "lodash": "^4.17.21",
    "uuid": "^9.0.0"
  }
}
```

**Correct example:**
```json
// RIGHT: zero runtime dependencies
{
  "dependencies": {},
  "devDependencies": {
    "zod": "^3.22.0",
    "vitest": "^1.0.0"
  }
}
```

---

### INV-MODEL-04: All IDs are branded types

**Rule:** Every entity ID (`ClipId`, `TrackId`, `AssetId`, `EffectInstanceId`, etc.) is a branded type, not a plain `string`. Functions that accept a `ClipId` must not accidentally receive a `TrackId`.

**Why:** Plain string IDs allow passing the wrong ID type silently at compile time. Branded types make the mistake a type error. This eliminates an entire class of referential integrity bugs without runtime cost.

**How to verify:**
- TypeScript strict mode catches mismatched ID usage at compile time.
- Test: `const id: ClipId = 'abc' as TrackId` must produce a type error.

**Violation example:**
```typescript
// WRONG: all IDs are plain strings
function findClip(clips: Clip[], id: string): Clip | undefined { ... }
findClip(clips, track.id); // no error — wrong ID type silently accepted
```

**Correct example:**
```typescript
// RIGHT: branded IDs
type ClipId = string & { readonly __brand: 'ClipId' };
type TrackId = string & { readonly __brand: 'TrackId' };
function findClip(clips: Clip[], id: ClipId): Clip | undefined { ... }
findClip(clips, track.id); // type error — TrackId is not ClipId
```

---

## 3. Package Boundary Invariants

### INV-PKG-01: project-model is imported by everyone; it imports nothing

**Rule:** `@rough-cut/project-model` must not import from any other `@rough-cut/*` package. The dependency graph has it as a root with no outgoing edges to internal packages.

**Why:** project-model is the shared vocabulary. If it imports from timeline-engine or effect-registry, circular dependencies become possible and the foundation becomes contaminated with implementation concerns.

**How to verify:**
- Turborepo: `turbo run build --filter=@rough-cut/project-model` must succeed with no internal `@rough-cut/*` imports.
- ESLint `no-restricted-imports`: inside `packages/project-model`, ban all `@rough-cut/*` patterns.

**Violation example:**
```typescript
// WRONG: project-model/src/types.ts
import { interpolateValue } from '@rough-cut/effect-registry'; // circular risk
```

**Correct example:**
```typescript
// RIGHT: project-model declares types only; interpolation lives in effect-registry
// packages/effect-registry/src/interpolate.ts imports from project-model, never the reverse
```

---

### INV-PKG-02: preview-renderer and export-renderer never import each other

**Rule:** `@rough-cut/preview-renderer` must not import from `@rough-cut/export-renderer` and vice versa. They may both import from `@rough-cut/effect-registry` and `@rough-cut/project-model`.

**Why:** Preview and export are fundamentally different pipelines targeting different environments (renderer process / GPU vs. main process / headless). Any shared code belongs in `effect-registry`. Coupling them would mean a change to export logic can break preview and vice versa.

**How to verify:**
- ESLint `no-restricted-imports`: inside `packages/preview-renderer`, ban `@rough-cut/export-renderer`. Inside `packages/export-renderer`, ban `@rough-cut/preview-renderer`.
- CI: `madge --circular packages/` reports no cycles involving these two packages.

**Violation example:**
```typescript
// WRONG: preview-renderer/src/compositor.ts
import { renderExportFrame } from '@rough-cut/export-renderer'; // cross-pipeline import
```

**Correct example:**
```typescript
// RIGHT: both pipelines call the same effect-registry function independently
import { evaluateKeyframeTracks } from '@rough-cut/effect-registry';
// ... each pipeline has its own rendering implementation
```

---

### INV-PKG-03: ui never imports from preview-renderer directly

**Rule:** React components in `@rough-cut/ui` must not import any rendering logic, PixiJS objects, or compositor internals from `@rough-cut/preview-renderer`. The only permitted coupling is a thin `PreviewCanvas` adapter component that mounts the canvas and manages the compositor lifecycle.

**Why:** UI components should not know how rendering works. If they import PixiJS filters or compositor methods directly, a rendering refactor forces UI changes. The adapter pattern keeps the contract narrow: the UI provides a `<canvas>` element; the compositor owns everything inside it.

**How to verify:**
- ESLint `no-restricted-imports`: inside `packages/ui/src`, ban all `@rough-cut/preview-renderer` imports except from `packages/ui/src/components/preview/PreviewCanvas.tsx` (the single allowed adapter file).
- Code review: any new import of `preview-renderer` outside `PreviewCanvas.tsx` is a violation.

**Violation example:**
```typescript
// WRONG: EditTab.tsx directly calls compositor
import { compositor } from '@rough-cut/preview-renderer';
compositor.seekTo(frame);
```

**Correct example:**
```typescript
// RIGHT: EditTab uses the store; PreviewCanvas adapter observes store changes
// EditTab.tsx
store.dispatch(seekTo(frame));

// PreviewCanvas.tsx (the single allowed adapter)
import { PreviewCompositor } from '@rough-cut/preview-renderer';
// ... mounts compositor, subscribes to store
```

---

### INV-PKG-04: capture runs exclusively in the main process

**Rule:** `@rough-cut/capture` (or any file in `apps/desktop/src/main/capture/`) must never be imported by renderer process code. It uses Electron's `desktopCapturer` API which is only available in the main process.

**Why:** `desktopCapturer` and other capture APIs are main-process only. Importing them in the renderer either throws at runtime or silently does nothing depending on Electron's context isolation settings, making bugs extremely hard to trace.

**How to verify:**
- ESLint `no-restricted-imports`: inside `apps/desktop/src/renderer/` and `packages/ui/`, ban imports of `@rough-cut/capture` and `apps/desktop/src/main/capture/*`.
- TypeScript project references: `renderer/tsconfig.json` does not include `main/` in its paths.

**Violation example:**
```typescript
// WRONG: RecordTab.tsx (renderer) importing capture directly
import { CaptureSession } from '@rough-cut/capture';
const session = new CaptureSession();
session.start(config);
```

**Correct example:**
```typescript
// RIGHT: renderer uses IPC to trigger capture in main
import { useIpc } from '@/hooks/useIpc';
const ipc = useIpc();
ipc.capture.start(config);
```

---

### INV-PKG-05: store never imports from ui

**Rule:** `@rough-cut/store` must not import from `@rough-cut/ui`. Data flows one way: store is consumed by ui, not the reverse.

**Why:** The store is the single source of truth. If it imports from UI, that creates a circular dependency and means the store's behavior becomes coupled to presentation concerns. The store must be testable in isolation without a React environment.

**How to verify:**
- ESLint `no-restricted-imports`: inside `packages/store/`, ban all `@rough-cut/ui` imports.
- Unit tests for store slices run with no React rendering (pure Vitest, no `@testing-library`).

**Violation example:**
```typescript
// WRONG: store slice importing a UI type
import type { PanelLayout } from '@rough-cut/ui/components/layout';
```

**Correct example:**
```typescript
// RIGHT: UI-specific types live in the ui package; the store uses its own types
type PanelLayout = { left: number; right: number }; // defined locally in store
```

---

### INV-PKG-06: No circular dependencies between any packages

**Rule:** The package dependency graph must be a directed acyclic graph (DAG). No package A may transitively depend on itself.

**Why:** Circular dependencies cause unpredictable module initialization order, break tree-shaking, and make it impossible to test packages in isolation.

**How to verify:**
- CI: `madge --circular --extensions ts packages/ apps/` exits with code 0.
- Turborepo: circular task dependencies fail the build graph construction.

**Violation example:**
```
project-model → timeline-engine (via a type import) → project-model  // cycle
```

**Correct example:**
```
project-model (no deps)
  ↑
timeline-engine
  ↑
store
  ↑
ui
```

---

## 4. Rendering Pipeline Invariants

### INV-RENDER-01: Both pipelines use the same keyframe interpolation function

**Rule:** `evaluateKeyframeTracks()` from `@rough-cut/effect-registry` is the single implementation for resolving keyframe values at a given frame. Neither preview-renderer nor export-renderer may implement their own interpolation logic.

**Why:** Visual parity between preview and export is the core promise. If each pipeline has its own interpolation, they will inevitably diverge. The user sees one result in the editor and gets a different result on export.

**How to verify:**
- Code review: any interpolation math (`lerp`, bezier, easing functions) outside `packages/effect-registry` is a violation.
- Integration test: a project with animated parameters renders the same pixel values (within tolerance) in both preview and export at the same frame number.

**Violation example:**
```typescript
// WRONG: export-renderer re-implementing its own linear interpolation
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
const value = lerp(kf1.value, kf2.value, progress); // duplicated logic
```

**Correct example:**
```typescript
// RIGHT: both pipelines delegate to effect-registry
import { evaluateKeyframeTracks } from '@rough-cut/effect-registry';
const resolvedParams = evaluateKeyframeTracks(effect.keyframes, relativeFrame);
```

---

### INV-RENDER-02: Preview may drop frames; export never drops frames

**Rule:** The preview compositor is allowed to skip rendering frames to maintain interactivity (draft quality during scrub, reduced resolution). The export pipeline must render every frame from 0 to `composition.duration - 1` exactly once, in order, at full resolution.

**Why:** Export is the final deliverable. Skipping frames produces corrupted video. Preview skipping frames is a deliberate trade-off for responsiveness. Mixing these behaviors would either make preview laggy or corrupt exports.

**How to verify:**
- Export integration test: count FFmpeg stdin writes; assert equals `composition.duration`.
- Export integration test: no frame index is written twice.
- Code review: no `continue` or early-return in the export frame loop based on time budget.

**Violation example:**
```typescript
// WRONG: export pipeline skipping frames if render takes too long
for (let frame = 0; frame < duration; frame++) {
  if (Date.now() - startTime > FRAME_BUDGET_MS) continue; // skips frames
  await renderFrame(frame);
}
```

**Correct example:**
```typescript
// RIGHT: export always renders every frame, no time budget
for (let frame = 0; frame < duration; frame++) {
  const imageData = await renderFrame(frame as FrameNumber);
  ffmpegProcess.stdin.write(imageData);
}
```

---

### INV-RENDER-03: UI rendering state is never stored in the project model

**Rule:** Ephemeral preview state — current playback frame, play/pause status, scrubbing state, draft quality flag, texture cache state — must never be written into `ProjectDocument`. It lives in the `playback` slice of the store, which is excluded from undo history.

**Why:** The project document is the saved state. If rendering ephemera leak into it, saving the project mid-playback produces a file that reopens at an arbitrary playback position, with dirty undo history, etc.

**How to verify:**
- `ProjectDocument` type has no fields for `currentFrame`, `isPlaying`, `playbackRate`, or similar.
- Undo/redo test: playing back and scrubbing, then pressing Ctrl+Z, does not affect playback position.

**Violation example:**
```typescript
// WRONG: storing playback position in the project document
interface ProjectDocument {
  lastPlaybackFrame: number; // persisted — wrong
}
```

**Correct example:**
```typescript
// RIGHT: playback state in a separate, non-persisted store slice
interface PlaybackState {
  currentFrame: FrameNumber;
  isPlaying: boolean;
  playbackRate: number;
}
// Excluded from undo/redo snapshots
```

---

## 5. Recording Pipeline Invariants

### INV-RECORD-01: Capture produces assets and metadata — not clips

**Rule:** The `@rough-cut/capture` module and its IPC handlers must return `AssetInfo` objects (file path, probed duration, resolution, codec). They must NOT create `Clip` objects, write to the composition, or call any timeline-engine functions. Clip creation from a completed recording is the responsibility of the UI layer acting on the returned asset.

**Why:** Capture and timeline are orthogonal concerns. Capture knows about media files. The timeline knows about arrangement. Coupling them means you cannot have an asset library without clips, cannot re-use the same recording in multiple timeline positions, and cannot test either concern independently.

**How to verify:**
- Type check: `capture.complete` IPC response type is `AssetInfo`, not `Clip` or anything containing timeline positions.
- Unit test: the capture module's complete handler does not call any function from `@rough-cut/timeline-engine`.
- ESLint `no-restricted-imports`: inside `apps/desktop/src/main/capture/`, ban `@rough-cut/timeline-engine` and `@rough-cut/store`.

**Violation example:**
```typescript
// WRONG: capture handler creating clips
ipcMain.handle('capture.stop', async () => {
  const asset = await finalizeRecording();
  const clip = createClip(asset, trackId, startFrame); // capture touching timeline
  store.getState().addClip(clip);
  return clip;
});
```

**Correct example:**
```typescript
// WRONG-CORRECT split:
// In main process: return asset only
ipcMain.handle('capture.stop', async () => {
  const asset = await finalizeRecording(); // ffprobe, thumbnail
  return asset; // AssetInfo only
});

// In renderer store action (triggered by IPC response):
function onCaptureComplete(asset: AssetInfo) {
  store.getState().addAsset(asset);
  store.getState().autoCreateClipsFromAsset(asset); // timeline concern lives here
}
```

---

### INV-RECORD-02: Asset duration is probed by FFmpeg, not trusted from MediaRecorder

**Rule:** The `duration` field on an `Asset` returned from capture must come from `ffprobe` output, not from `MediaRecorder` event timestamps or estimated values.

**Why:** MediaRecorder duration metadata is notoriously unreliable, especially on macOS and Windows. Using it can cause clips that appear longer or shorter than they are, leading to sync issues and off-by-one export errors. FFmpeg's probe is the authoritative source.

**How to verify:**
- Unit test: mock FFprobe returning a specific duration; assert the returned asset uses that value, not a MediaRecorder-provided value.
- Code review: no use of `MediaRecorder.ondataavailable` event timing to compute duration.

**Violation example:**
```typescript
// WRONG: trusting MediaRecorder for duration
let totalDuration = 0;
mediaRecorder.ondataavailable = (e) => { totalDuration += e.timecode; };
// ... using totalDuration as asset.duration
```

**Correct example:**
```typescript
// RIGHT: ffprobe after file is finalized
const probeResult = await ffprobe(outputFilePath);
const durationFrames = Math.round(probeResult.duration * fps) as FrameNumber;
const asset: Asset = { ..., duration: durationFrames };
```

---

### INV-RECORD-03: The CaptureSession delegates to a swappable CaptureBackend

**Rule:** `CaptureSession` must communicate with the OS capture APIs only through a `CaptureBackend` interface. The default implementation uses Electron's `desktopCapturer`. No direct calls to `desktopCapturer` APIs may appear outside a `CaptureBackend` implementation.

**Why:** Electron's capture APIs change between versions and differ by platform. Abstracting behind an interface allows swapping to native OS APIs (e.g., ScreenCaptureKit on macOS) without rewriting orchestration logic. It also enables a mock backend for testing.

**How to verify:**
- Code review: `desktopCapturer` appears only inside `apps/desktop/src/main/capture/backends/`.
- Unit test: `CaptureSession` tests use a `MockCaptureBackend`, not the real Electron API.

**Violation example:**
```typescript
// WRONG: CaptureSession calling desktopCapturer directly
class CaptureSession {
  async start() {
    const sources = await desktopCapturer.getSources({ types: ['screen'] }); // bypasses backend
  }
}
```

**Correct example:**
```typescript
// RIGHT: delegating to the injected backend
class CaptureSession {
  constructor(private backend: CaptureBackend) {}
  async start(config: CaptureConfig) {
    const stream = await this.backend.getStream(config);
    // ...
  }
}
```

---

## 6. State Management Invariants

### INV-STATE-01: Transport state is separated from project state

**Rule:** Playback state (current frame, play/pause, playback rate, scrubbing flag) must live in a separate store slice and must be excluded from undo/redo history. Project state (composition, assets, effects) is snapshotted for undo/redo. Transport state is never snapshotted.

**Why:** The user expects Ctrl+Z to undo editing actions (clip moves, effect changes), not playback position changes. If playback state were in the undo stack, scrubbing through a video would pollute the history. Also, playback state updates at 30-60 Hz; snapshotting it would cause massive memory pressure.

**How to verify:**
- Unit test: play, scrub 50 frames, press undo — `currentFrame` does not change; only composition state reverts.
- Code review: `zundo` / `temporal` middleware configuration explicitly excludes `playback` and `ui` slices.

**Violation example:**
```typescript
// WRONG: playback state in the same Zustand slice as project data
const useProjectStore = create(
  temporal( // undo wraps EVERYTHING including playback
    (set) => ({
      composition: ...,
      currentFrame: 0, // this gets undo-snapshotted — wrong
    })
  )
);
```

**Correct example:**
```typescript
// RIGHT: separate slices, temporal only wraps project data
const useProjectStore = create(
  temporal(
    (set) => ({ composition: ..., assets: ... }),
    { exclude: ['playback', 'ui'] }
  )
);
const usePlaybackStore = create((set) => ({ currentFrame: 0, isPlaying: false }));
```

---

### INV-STATE-02: All project mutations go through store actions

**Rule:** React components must never mutate project state directly by calling `setState` on raw objects, creating new model objects and injecting them outside of store actions, or bypassing the store to write directly to a shared reference. All mutations go through named store action functions.

**Why:** Named actions enable undo/redo (the `temporal` middleware snapshots on actions), enable DevTools inspection, and enforce the single-direction data flow. Direct mutations bypass all of these guarantees.

**How to verify:**
- TypeScript: store state is `Readonly<DeepReadonly<ProjectDocument>>` so mutation attempts produce type errors.
- ESLint: no direct object spread assignments to state in component files.
- Code review: component files must not call `store.setState()` directly; only named action methods.

**Violation example:**
```typescript
// WRONG: component mutating state directly
const { composition } = useProjectStore();
composition.tracks[0].clips.push(newClip); // direct mutation, bypasses undo
```

**Correct example:**
```typescript
// RIGHT: named action
const { addClip } = useProjectStore();
addClip({ trackId: track.id, clip: newClip }); // goes through immer, snapshotted for undo
```

---

### INV-STATE-03: Rapid mutations are grouped into single undo steps

**Rule:** Operations that produce many intermediate states (clip drag, keyframe drag, trim handle drag) must use a debounced or batched undo boundary so the user undoes the complete operation, not each 16ms intermediate position.

**Why:** Without grouping, a 3-second drag produces ~180 undo steps. The user presses Ctrl+Z and steps back one pixel at a time. This is unusable.

**How to verify:**
- Manual test: drag a clip across the timeline for 2 seconds, release, press Ctrl+Z — the clip returns to its original position in one step.
- Unit test: simulate 100 rapid `moveClip` dispatches inside `zundo`'s debounce window, assert undo history length increased by 1.

**Violation example:**
```typescript
// WRONG: every mousemove creates a new undo snapshot
onMouseMove: (e) => {
  store.getState().moveClip(clipId, newPosition); // 60 snapshots per second
}
```

**Correct example:**
```typescript
// RIGHT: group with temporal's debounce, or manual pause/resume
onMouseDown: () => store.temporal.getState().pause(),
onMouseMove: (e) => store.getState().moveClip(clipId, newPosition),
onMouseUp: () => store.temporal.getState().resume(), // single snapshot on release
```

---

## 7. IPC Invariants

### INV-IPC-01: No raw ipcRenderer.send / ipcMain.on with string channel names

**Rule:** All IPC communication must go through the typed client/handler helpers from `@rough-cut/ipc`: `createRendererClient()` and `createMainHandler()`. Direct calls to `ipcRenderer.send('some-string', ...)` or `ipcMain.on('some-string', ...)` are forbidden.

**Why:** String channel names are untyped and unverifiable. A typo in a channel name fails silently at runtime and is invisible to TypeScript. The typed contract in `@rough-cut/ipc` makes channel mismatches a compile-time error.

**How to verify:**
- ESLint: ban `ipcRenderer.send`, `ipcRenderer.invoke`, `ipcMain.on`, `ipcMain.handle` as raw calls. All usage must go through the typed wrapper.
- TypeScript: `createMainHandler` and `createRendererClient` are the only symbols that may call raw Electron IPC under the hood.

**Violation example:**
```typescript
// WRONG: raw string channel
ipcRenderer.invoke('capture.start', config); // untyped, typo-prone
ipcMain.on('capture.start', (event, config) => { ... }); // untyped
```

**Correct example:**
```typescript
// RIGHT: typed client
const ipc = createRendererClient<IpcContract>();
await ipc.capture.start(config); // type-checked channel name and payload

// Main process:
createMainHandler<IpcContract>({
  'capture.start': async (config: CaptureConfig) => { ... }
});
```

---

### INV-IPC-02: The 16ms boundary rule determines process assignment

**Rule:** Any operation that touches the file system, spawns a child process, blocks the event loop longer than 16ms, or uses a main-process-only Electron API runs in the main process and is exposed via IPC. Everything that touches the DOM, needs sub-16ms latency, or manipulates React state runs in the renderer process.

**Why:** Blocking the renderer event loop produces visible frame drops (> 16ms = below 60fps). Blocking the main process produces unresponsive window chrome. The 16ms threshold is the single clear heuristic that determines process assignment without ambiguity.

**How to verify:**
- Code review: any new `async` function that calls `fs.*`, `ffmpeg`, `child_process`, or `desktopCapturer` must live in the main process.
- Architecture review: new IPC channels should be the natural result of the boundary rule, not added arbitrarily.

**Violation example:**
```typescript
// WRONG: renderer process reading a file directly
import { readFileSync } from 'fs'; // electron renderer with node integration — wrong
const data = readFileSync(filePath);
```

**Correct example:**
```typescript
// RIGHT: file read goes through IPC to main
const data = await ipc.file.read(filePath);
```

---

### INV-IPC-03: IpcContract type is the single source of truth for all channels

**Rule:** Every IPC channel name, its request type, and its response type must be declared in the `IpcContract` interface in `@rough-cut/ipc`. No channel may be used in practice unless it is declared in the contract.

**Why:** The contract is the shared interface between two isolated processes. Without it as the single source of truth, the main-side implementation and the renderer-side client can drift apart silently.

**How to verify:**
- TypeScript: `createMainHandler` and `createRendererClient` are generic over `IpcContract`; unregistered channels produce type errors.
- CI: `tsc --noEmit` catches mismatches between main handler implementations and the contract.

**Violation example:**
```typescript
// WRONG: ad-hoc channel not in contract
ipcMain.handle('internal.debug.dumpState', () => store.getState()); // undeclared channel
```

**Correct example:**
```typescript
// RIGHT: add to contract first, then implement
interface IpcContract {
  'debug.dumpState': { request: void; response: ProjectDocument };
}
```

---

## 8. Effect System Invariants

### INV-EFFECT-01: Effects are stored as data (effectType + params), never as code

**Rule:** An `EffectInstance` in the project model contains only: an `id`, an `effectType` string (registry key), an `enabled` boolean, a `params` object (plain key-value pairs), and `keyframes`. It must never contain function references, class instances, or executable code.

**Why:** The project file must be shareable, diffable, and safe to open from untrusted sources. Embedding code would create a security risk and break JSON serialization. Effect behavior is resolved at runtime by looking up `effectType` in the registry.

**How to verify:**
- `JSON.stringify(effectInstance)` produces the identical object after `JSON.parse` (round-trip test).
- TypeScript: `EffectInstance.params` is `Record<string, unknown>` — no function types permitted.
- ESLint: no `Function` type in project-model types.

**Violation example:**
```typescript
// WRONG: storing a render function inside the effect instance
const effect: EffectInstance = {
  id: 'e1',
  effectType: 'gaussian-blur',
  render: (ctx) => { ctx.filter = 'blur(5px)'; }, // function in data — wrong
};
```

**Correct example:**
```typescript
// RIGHT: data only; rendering function lives in the registry
const effect: EffectInstance = {
  id: 'e1',
  effectType: 'gaussian-blur',
  enabled: true,
  params: { radius: 5, quality: 3 },
  keyframes: [],
};
// At render time: registry.getEffect('gaussian-blur').createPreviewFilter(params)
```

---

### INV-EFFECT-02: Every effect is testable without a DOM or PixiJS context

**Rule:** The parameter validation, default value generation, and keyframe interpolation logic for any effect must be testable in a pure Node.js environment (Vitest, no jsdom, no PixiJS). The preview filter creation (`createPreviewFilter`) and export render (`renderExportFrame`) functions may require a canvas context, but the data/math layer must not.

**Why:** Rendering requires a GPU context that is unavailable in CI. Keeping data/math separate from rendering means the correctness of keyframe interpolation, param validation, and default values can be verified quickly in CI without spinning up a headless browser.

**How to verify:**
- CI: `vitest run packages/effect-registry` runs in Node without jsdom and all parameter/interpolation tests pass.
- Code review: no imports of `pixi.js`, `canvas`, or `window` in effect definition files outside the `createPreviewFilter` / `renderExportFrame` implementations.

**Violation example:**
```typescript
// WRONG: param defaults depending on PixiJS
const gaussianBlur: EffectDefinition = {
  defaultParams: () => ({
    radius: new PIXI.Filter().resolution, // requires PIXI at import time
  }),
};
```

**Correct example:**
```typescript
// RIGHT: defaults are plain values
const gaussianBlur: EffectDefinition = {
  defaultParams: () => ({ radius: 5, quality: 3 }),
  createPreviewFilter: (params) => new PIXI.filters.BlurFilter(params.radius), // PixiJS only here
};
```

---

### INV-EFFECT-03: Effect definitions use registry pattern, not class inheritance

**Rule:** New effects are added by calling `registerEffect(definition)` with an object that satisfies `EffectDefinition`. No class extending a base `Effect` class is allowed. The registry maps `effectType` strings to definitions.

**Why:** Class inheritance creates implicit coupling between effects and a base class. Changing the base class forces updates to all subclasses. The registry/object pattern has no coupling; each definition is independent and composable.

**How to verify:**
- ESLint: no `class` keyword in `packages/effect-registry/src/effects/`.
- Code review: effect definitions are object literals or factory functions, not class instances.

**Violation example:**
```typescript
// WRONG: class-based effect hierarchy
class BlurEffect extends BaseEffect {
  apply(ctx: CanvasRenderingContext2D) { ... }
}
```

**Correct example:**
```typescript
// RIGHT: plain object registered by type string
const gaussianBlurEffect: EffectDefinition = {
  type: 'gaussian-blur',
  name: 'Gaussian Blur',
  defaultParams: () => ({ radius: 5 }),
  createPreviewFilter: (params) => new PIXI.filters.BlurFilter(params.radius),
  renderExportFrame: (ctx, source, params) => { /* canvas2d impl */ return source; },
};
registerEffect(gaussianBlurEffect);
```

---

### INV-EFFECT-04: Effects and transitions are parallel systems, not a hierarchy

**Rule:** `EffectDefinition` and `TransitionDefinition` are separate interfaces. Transitions are not effects with two inputs. They must not share a base type or be stored in the same registry.

**Why:** Effects operate on one clip (one input). Transitions blend two clips (two inputs, plus a progress value). Treating transitions as a special effect case would require awkward null-checking for the second input in every effect's render function, polluting the interface.

**How to verify:**
- TypeScript: `EffectDefinition` and `TransitionDefinition` are declared independently. No union type is used to merge them.
- Code review: `Composition.transitions[]` and `Clip.effects[]` are separate arrays with distinct types.

**Violation example:**
```typescript
// WRONG: transition stored as an effect with a secondary input hack
type EffectOrTransition = EffectDefinition & { secondaryInput?: ImageData };
```

**Correct example:**
```typescript
// RIGHT: separate interfaces
interface EffectDefinition {
  renderExportFrame(ctx: Context, source: ImageData, params: ResolvedParams): ImageData;
}
interface TransitionDefinition {
  renderExportFrame(ctx: Context, clipA: ImageData, clipB: ImageData, progress: number, params: ResolvedParams): ImageData;
}
```

---

## 9. AI Pipeline Invariants

### INV-AI-01: AI writes only metadata — never directly mutates clips

**Rule:** `@rough-cut/ai-bridge` and all AI worker outputs must produce only metadata objects: suggested cut points, caption data, scene labels, silence markers. These are stored separately (e.g., `AIAnnotation[]`) and never directly modify `Clip`, `Track`, or `Composition` objects. All clip mutations triggered by AI suggestions go through store actions, initiated by the user confirming a suggestion in the UI.

**Why:** AI suggestions are probabilistic and require human confirmation. Direct mutation would apply potentially wrong suggestions without review. The metadata-only contract also makes AI suggestions undoable as a batch (the user can reject the whole suggestion set) and keeps the AI subsystem decoupled from the timeline model.

**How to verify:**
- Type check: `ai-bridge` public API returns `AIAnnotation[]` or similar metadata types, not `Clip[]` or `Composition`.
- ESLint `no-restricted-imports`: inside `apps/desktop/src/main/ai/`, ban `@rough-cut/timeline-engine` and direct store access.
- Code review: any AI result handling that directly calls `addClip`, `trimClip`, or similar must be in a UI action handler, not in AI bridge code.

**Violation example:**
```typescript
// WRONG: AI worker directly trimming clips
ipcMain.handle('ai.suggest-cuts', async (event, projectDoc) => {
  const cutPoints = await runAiModel(projectDoc);
  cutPoints.forEach(point => {
    store.getState().splitClip(point.clipId, point.frame); // AI mutating timeline
  });
});
```

**Correct example:**
```typescript
// RIGHT: AI returns metadata; user confirms; store action applies
// Main process:
ipcMain.handle('ai.suggest-cuts', async (event, projectDoc) => {
  const suggestions = await runAiModel(projectDoc);
  return suggestions; // AIAnnotation[] — metadata only
});

// Renderer (AI tab), after user clicks "Apply":
const { applySuggestedCuts } = useProjectStore();
applySuggestedCuts(confirmedSuggestions); // store action, goes through undo system
```

---

### INV-AI-02: AI providers are pluggable via interface

**Rule:** All AI model calls must go through the `AiProvider` interface. No direct SDK calls to OpenAI, Whisper, or any AI provider may appear outside of a provider implementation class.

**Why:** AI providers change (new models, deprecations, pricing). The abstraction layer allows swapping providers without changing business logic. It also enables a mock provider for testing.

**How to verify:**
- Code review: `openai`, `anthropic`, or similar SDK packages are imported only inside `apps/desktop/src/main/ai/providers/`.
- Unit test: AI bridge tests use a `MockAiProvider`, not real model calls.

**Violation example:**
```typescript
// WRONG: direct SDK call in business logic
import OpenAI from 'openai';
const client = new OpenAI();
const result = await client.chat.completions.create(...); // not behind interface
```

**Correct example:**
```typescript
// RIGHT: business logic uses the interface
interface AiProvider {
  suggestCuts(asset: AssetInfo): Promise<CutSuggestion[]>;
  generateCaptions(asset: AssetInfo): Promise<Caption[]>;
}
class OpenAiProvider implements AiProvider { ... } // SDK call lives here
```

---

## 10. CI Enforcement

The following invariants can be enforced automatically. Corresponding CI failures block merging.

### ESLint `no-restricted-imports` Rules

| Rule | Applies to | Blocks import of |
|------|-----------|-----------------|
| project-model purity | `packages/project-model/src/**` | Any `@rough-cut/*` package |
| UI no preview-renderer | `packages/ui/src/**` (except `PreviewCanvas.tsx`) | `@rough-cut/preview-renderer` |
| UI no capture | `packages/ui/src/**`, `apps/desktop/src/renderer/**` | `@rough-cut/capture`, `apps/desktop/src/main/capture/**` |
| Store no UI | `packages/store/src/**` | `@rough-cut/ui` |
| Preview no export | `packages/preview-renderer/src/**` | `@rough-cut/export-renderer` |
| Export no preview | `packages/export-renderer/src/**` | `@rough-cut/preview-renderer` |
| Capture no timeline | `apps/desktop/src/main/capture/**` | `@rough-cut/timeline-engine`, `@rough-cut/store` |
| AI bridge no timeline | `apps/desktop/src/main/ai/**` | `@rough-cut/timeline-engine`, `@rough-cut/store` |
| No raw IPC | `apps/desktop/src/renderer/**`, `packages/ui/src/**` | `ipcRenderer.send`, `ipcRenderer.invoke` (raw) |
| No raw IPC main | `apps/desktop/src/main/**` (outside `@rough-cut/ipc`) | `ipcMain.on`, `ipcMain.handle` (raw) |
| No classes in effects | `packages/effect-registry/src/effects/**` | `class` keyword (via `no-restricted-syntax`) |
| No classes in model | `packages/project-model/src/**` | `class` keyword (via `no-restricted-syntax`) |

### TypeScript Compiler Checks (`tsc --noEmit`)

| Check | Enforces |
|-------|---------|
| `strict: true` | No implicit `any`, no loose null checks |
| Branded `FrameNumber` type | INV-FRAME-01, INV-FRAME-04 |
| Branded ID types (`ClipId`, `TrackId`, etc.) | INV-MODEL-04 |
| `Readonly<DeepReadonly<ProjectDocument>>` store state | INV-STATE-02 |
| `IpcContract` generic constraint | INV-IPC-01, INV-IPC-03 |
| `EffectInstance.params: Record<string, unknown>` (no `Function`) | INV-EFFECT-01 |
| Separate `EffectDefinition` / `TransitionDefinition` interfaces | INV-EFFECT-04 |

### Turborepo / Package Graph Checks

| Check | Tool | Enforces |
|-------|------|---------|
| No circular package deps | `madge --circular` in CI | INV-PKG-06 |
| project-model zero deps | `jq '.dependencies \| length' package.json` == 0 | INV-MODEL-03 |
| Turbo build graph is a DAG | Turbo pipeline construction (fails on cycles) | INV-PKG-06 |

### Custom Lint Scripts

| Script | What it checks |
|--------|---------------|
| `scripts/check-frame-conversions.ts` | Scans for `/fps` and `*fps` patterns outside allowed boundary files (INV-FRAME-02) |
| `scripts/check-project-serializable.ts` | Runs JSON round-trip test on all `ProjectDocument` factory outputs (INV-MODEL-01) |
| `scripts/check-ipc-contract.ts` | Asserts every channel string used in `createMainHandler` calls exists in `IpcContract` (INV-IPC-03) |

### Unit Test Patterns

| Test | Enforces |
|------|---------|
| `timeline-engine/` tests: all outputs are integers | INV-FRAME-01 |
| Migration chain: each step v→v+1 is tested with snapshot | INV-MODEL-02 |
| Export pipeline: frame count assertion | INV-RENDER-02 |
| Playback undo: scrubbing does not appear in undo stack | INV-STATE-01 |
| AI bridge: returns `AIAnnotation[]`, not `Clip[]` | INV-AI-01 |
| Effect registry: param/interpolation tests run in pure Node | INV-EFFECT-02 |
| `CaptureSession` with `MockCaptureBackend` | INV-RECORD-03 |

---

## 11. Code Review Checklist

Use this checklist on every PR that touches the listed areas.

### General (every PR)

- [ ] No new `any` types introduced (TypeScript strict mode)
- [ ] No `class` keyword in `project-model` or `effect-registry/effects/`
- [ ] No circular imports (run `madge --circular` if packages are modified)
- [ ] No raw `ipcRenderer.send/invoke` or `ipcMain.on/handle` outside `@rough-cut/ipc`

### Frame / Timeline PRs

- [ ] All new timeline fields typed as `FrameNumber` (integer-branded)
- [ ] No frame-to-seconds conversion inside `timeline-engine`, `store`, `effect-registry`, or `project-model`
- [ ] Keyframe `frame` values are relative to clip start, not absolute composition frames
- [ ] Rapid-operation mutations (drag, scrub) grouped into a single undo step

### Project Model PRs

- [ ] If a field was renamed, removed, or type-changed: `CURRENT_SCHEMA_VERSION` incremented
- [ ] If schema version incremented: migration function added and tested
- [ ] New model additions are plain data (no methods, no class instances, no `Date`, no `Map`)
- [ ] `JSON.parse(JSON.stringify(doc))` round-trip test passes for new fields

### Package Boundary PRs

- [ ] `project-model/package.json` still has zero `dependencies`
- [ ] `ui` package does not import `preview-renderer` except in `PreviewCanvas.tsx`
- [ ] `preview-renderer` does not import `export-renderer` (and vice versa)
- [ ] `capture` is not imported by renderer-side code
- [ ] `store` does not import `ui`

### Rendering PRs

- [ ] Both pipelines still call `evaluateKeyframeTracks()` from `effect-registry` (no new interpolation logic)
- [ ] No playback/transport state written to `ProjectDocument`
- [ ] Export frame loop has no early-continue / skip logic

### Recording PRs

- [ ] Capture IPC response type is `AssetInfo`, not `Clip` or composition data
- [ ] Asset `duration` populated from `ffprobe`, not `MediaRecorder` timing
- [ ] `desktopCapturer` calls are inside `CaptureBackend` implementations only

### Effect System PRs

- [ ] New effect registered via `registerEffect()`, not class instantiation
- [ ] `EffectInstance` has no function references in `params`
- [ ] New effect's param validation / defaults testable in pure Node (no PixiJS at import)
- [ ] Transitions use `TransitionDefinition`, not shoehorned into `EffectDefinition`

### AI PRs

- [ ] AI bridge returns metadata types (`AIAnnotation[]`, `CutSuggestion[]`), not `Clip[]`
- [ ] No direct `timeline-engine` or store calls inside `apps/desktop/src/main/ai/`
- [ ] New AI provider implements `AiProvider` interface; SDK not called outside provider class
- [ ] Clip mutations from AI suggestions are initiated by a user action in the UI layer

### IPC PRs

- [ ] New channel declared in `IpcContract` before implementation
- [ ] New channel assignment passes the 16ms boundary rule (I/O and processes in main, DOM in renderer)
- [ ] No string literals used as channel names outside the typed contract

---

*Last updated: see git history. For questions on any invariant, refer to `docs/ARCHITECTURE.md` for the design rationale, or raise a discussion before working around a rule.*
