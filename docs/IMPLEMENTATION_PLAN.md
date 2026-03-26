# Rough Cut -- Phased MVP Implementation Plan

> This document is the canonical build order for Rough Cut. It translates the architecture, MVP spec, and risk analysis into an ordered sequence of implementable tasks grouped by phase. Each phase has clear entry criteria, done criteria, and a dependency map.

---

## Dependency Graph

```
Phase 0: Spikes
  ├── Spike 1 (Frame Decoding)
  ├── Spike 2 (Recording Per Platform)
  └── Spike 3 (Timeline State Performance)
        │
        ▼
Phase 1: Foundation ◄── all spikes must complete before production code
  ├── 1.1 Monorepo scaffold
  ├── 1.2 project-model ◄── 1.1
  ├── 1.3 timeline-engine ◄── 1.2
  ├── 1.4 effect-registry ◄── 1.2
  └── 1.5 store ◄── 1.2, 1.3
        │
        ▼
Phase 2: Core Rendering ◄── 1.2, 1.4 minimum; 1.5 for full integration
  ├── 2.1 preview-renderer ◄── 1.2, 1.4
  ├── 2.2 export-renderer ◄── 1.2, 1.4
  └── 2.3 Vertical Slice: preview + export parity test ◄── 2.1, 2.2
        │
        ▼
Phase 3: Electron Shell + Record Tab ◄── 1.5, 2.1
  ├── 3.1 Electron app shell ◄── 1.5
  ├── 3.2 ipc package ◄── 1.2
  ├── 3.3 capture package ◄── 3.2, Spike 2 findings
  ├── 3.4 Record tab UI ◄── 3.1, 3.3, 2.1
  └── 3.5 Vertical Slice: record → asset → preview ◄── 3.4
        │
        ▼
Phase 4: Edit Tab ◄── Phase 3
  ├── 4.1 Timeline UI ◄── 1.5, 3.1
  ├── 4.2 Clip operations UI ◄── 1.3, 4.1
  ├── 4.3 Preview playback integration ◄── 2.1, 4.1
  ├── 4.4 Effects + Inspector ◄── 1.4, 4.1
  ├── 4.5 Undo/redo ◄── 1.5, 4.2
  ├── 4.6 Transitions ◄── 1.4, 4.2
  └── 4.7 Vertical Slice: record → edit → preview ◄── all above
        │
        ▼
Phase 5: Motion + AI + Export Tabs ◄── Phase 4 (partially parallelizable)
  ├── 5A Motion Track (can start after 4.1)
  │   ├── 5A.1 Motion template data model
  │   ├── 5A.2 Template renderer
  │   └── 5A.3 Motion tab UI
  ├── 5B AI Track (can start after 4.4)
  │   ├── 5B.1 ai-bridge package
  │   ├── 5B.2 Whisper integration (captions)
  │   ├── 5B.3 Smart Zoom analysis
  │   └── 5B.4 AI tab UI
  └── 5C Export Track (can start after 2.2)
      ├── 5C.1 Export pipeline integration
      ├── 5C.2 Export tab UI
      └── 5C.3 Export queue
        │
        ▼
Phase 6: Integration + Polish
  ├── 6.1 Project save/load
  ├── 6.2 Keyboard shortcuts
  ├── 6.3 Cross-platform testing
  ├── 6.4 Performance profiling + optimization
  ├── 6.5 Error handling + edge cases
  └── 6.6 Final integration test
```

### Demo Milestones

| Milestone | Earliest Phase | What the Demo Shows |
|-----------|---------------|---------------------|
| **D1: "It renders"** | End of Phase 2 | A hardcoded project renders in PixiJS preview AND exports to MP4 via FFmpeg. Visual parity proven. |
| **D2: "It records"** | End of Phase 3 | App opens, user records their screen, recording appears as an asset with a preview. |
| **D3: "It edits"** | End of Phase 4 | Full Record → Edit → Preview loop. User can trim, split, add effects, undo/redo. |
| **D4: "It ships"** | End of Phase 5 | All 5 tabs functional. User can record, edit, add motion graphics, use AI captions, and export. |

---

## Phase 0: Spikes

**Goal**: Validate the three highest-risk architecture assumptions before writing production code. Each spike produces a written report with findings, measurements, and architectural recommendations. Spike results directly inform implementation decisions in Phases 1-3.

**Time budget**: 1-2 weeks total.

### Spike 0.1: Frame Decoding Performance [VALIDATION] [HIGH-RISK]

**Question**: Can we extract an arbitrary frame from a recorded video within 16ms (one frame at 60fps)?

**Tasks**:
1. Build a standalone Node.js + FFmpeg benchmark. Extract 100 random frames from a 10-minute 1080p H.264 screen recording. Measure p50/p95/p99 latency.
2. Build the same benchmark using the WebCodecs API in a browser/Electron renderer context. Compare latency.
3. Test HTML5 `<video>` element seeking accuracy: seek to 100 known frame positions, capture via `drawImage()`, compare against FFmpeg-extracted ground truth frames. Quantify the keyframe-seeking error.
4. Test with a pre-decoded LRU frame cache: decode sequentially, cache N frames, measure random-access latency from cache vs. cold decode.

**Done criteria**:
- Written report with p50/p95/p99 latency numbers for each approach.
- Clear recommendation: which approach for preview (real-time), which for export (quality).
- If no approach hits 16ms for random access: documented fallback strategy (e.g., seek to nearest keyframe + sequential decode, two-tier preview quality).

**Influences**: Phase 2 (preview-renderer texture loading strategy, frame cache size), Phase 2 (export-renderer frame extraction pipeline).

---

### Spike 0.2: Recording Per Platform [VALIDATION] [HIGH-RISK]

**Question**: What works and what breaks with `desktopCapturer` on each platform?

**Tasks**:
1. **Linux**: Test on Wayland (PipeWire + XDG portal) and X11. Document the portal picker behavior. Test with PipeWire screen capture. Measure capture FPS at 1080p and 4K.
2. **macOS** (if available): Test TCC permission flow. Confirm system audio is NOT capturable without a virtual audio device. Document the BlackHole/Loopback requirement.
3. **Windows** (if available): Test DXGI capture. Test WASAPI loopback audio. Test with hardware-accelerated windows.
4. For each platform: test MediaRecorder output formats (WebM/MKV), verify FFprobe can parse the output, measure file size per minute at 30fps and 60fps.

**Done criteria**:
- Per-platform capability matrix: what works, what requires workarounds, what is blocked.
- Recommended `CaptureBackend` implementation strategy per platform.
- Known limitations documented for user-facing messaging.

**Influences**: Phase 3 (capture package backend implementations, Record tab UX for platform-specific limitations).

---

### Spike 0.3: Timeline State Performance [VALIDATION]

**Question**: Can Zustand + React handle a playhead moving at 60Hz with 100 clips across 4 tracks without UI stutter?

**Tasks**:
1. Build a standalone React + Zustand prototype (no Electron, no video). Create a mock timeline with 100 clips across 4 tracks.
2. Animate a playhead at 60Hz using `requestAnimationFrame`. Measure React re-render time per frame using React Profiler.
3. Test with naive store subscription (full store) vs. fine-grained selectors vs. separated transport state.
4. Test with 200 and 500 clips to find the breaking point.
5. If Zustand stutters: test alternatives (Jotai, Valtio, raw `useSyncExternalStore`).

**Done criteria**:
- Measured frame time for playhead updates at 60Hz with 100 clips on 4 tracks.
- Confirmed approach: Zustand with selectors, or identified alternative.
- Transport state separation strategy validated or rejected.

**Influences**: Phase 1 (store architecture, transport state design), Phase 4 (timeline UI virtualization strategy).

---

## Phase 1: Foundation

**Goal**: Build the packages that everything else depends on. At the end of this phase, the data model, timeline logic, effect system, and state management are fully implemented and tested -- but there is no UI and no rendering.

**Entry criteria**: All three spikes complete with written reports.

**Time budget**: 2-3 weeks.

### 1.1 Monorepo Scaffold

**Package**: Root workspace
**Effort**: 1-2 days
**Dependencies**: None

**Tasks**:
1. Initialize pnpm workspace with `pnpm-workspace.yaml` listing `packages/*` and `apps/*`.
2. Configure Turborepo (`turbo.json`) with pipelines: `build`, `test`, `lint`, `typecheck`, `dev`.
3. Create `tsconfig.base.json` with strict mode, path aliases, and composite project references.
4. Set up shared ESLint config (`tools/eslint-config/`) and Prettier config.
5. Set up Vitest as the test runner with workspace-level configuration.
6. Set up CI pipeline (GitHub Actions): lint + typecheck + test on every push. Enforce no circular dependencies between packages (`madge` or `depcheck`).
7. Create empty package shells for all 10 packages with correct `package.json` (name, dependencies placeholders, scripts).

**Done criteria**:
- `pnpm install` succeeds.
- `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm typecheck` all pass (on empty packages).
- CI pipeline runs and passes.
- Circular dependency check is wired into CI.

---

### 1.2 Project Model Package

**Package**: `@rough-cut/project-model`
**Effort**: 3-5 days
**Dependencies**: 1.1

This is the most critical package. Every other package depends on it. It must be reviewed before anything else is built on top of it.

**Tasks**:
1. Define all TypeScript interfaces from the architecture spec: `ProjectDocument`, `ProjectSettings`, `Asset`, `Composition`, `Track`, `Clip`, `ClipTransform`, `EffectInstance`, `KeyframeTrack`, `Keyframe`, `EasingType`, `Transition`, `MotionPreset`, `ExportSettings`, `AIAnnotation`.
2. Implement branded ID types: `ProjectId`, `AssetId`, `TrackId`, `ClipId`, `EffectId`, `TransitionId`.
3. Write Zod schemas for every type. Schemas must enforce: frame values are non-negative integers, IDs are non-empty strings, `sourceIn < sourceOut`, `timelineIn < timelineOut`, volume is 0-1, opacity is 0-1.
4. Write factory functions: `createProject()`, `createAsset()`, `createTrack()`, `createClip()`, `createEffectInstance()`, `createKeyframe()`, `createTransition()`.
5. Implement schema versioning: `CURRENT_SCHEMA_VERSION` constant, `migrate(doc: unknown): ProjectDocument` function, first migration (`v0 -> v1`) as identity transform.
6. Write `validateProject(doc: unknown): Result<ProjectDocument, ValidationError[]>` that runs Zod parsing and returns structured errors.
7. Write comprehensive unit tests: factory functions produce valid documents, validation catches all invalid states, migration pipeline runs correctly, branded IDs prevent accidental mixing.

**Done criteria**:
- 100% of types from the architecture spec are defined.
- Every type has a matching Zod schema.
- Every schema has a matching factory function.
- `validateProject()` catches at least 15 distinct invalid states (tested).
- `migrate()` pipeline runs and is tested with at least one version transition.
- Zero runtime dependencies (Zod is a dev/peer dependency for schema validation at the boundary).

**Risks**:
- Getting the schema wrong at this stage is expensive -- every downstream package depends on it. Mitigation: explicit review gate before Phase 1.3 begins.
- Over-engineering the schema for future needs. Mitigation: build only what the MVP spec requires, use the version migration system to evolve later.

---

### 1.3 Timeline Engine Package

**Package**: `@rough-cut/timeline-engine`
**Effort**: 3-4 days
**Dependencies**: 1.2

**Tasks**:
1. Implement `placeClip(composition, clip, trackId, frame): Composition` -- places a clip on a track at the given frame. Returns updated composition. Validates that the clip doesn't exceed source bounds.
2. Implement `trimClip(composition, clipId, side: 'left' | 'right', newFrame): Composition` -- adjusts `sourceIn`/`timelineIn` (left trim) or `sourceOut`/`timelineOut` (right trim). Clamps to source duration.
3. Implement `splitClip(composition, clipId, frame): Composition` -- divides a clip at the given frame into two clips with correct source references. Returns composition with the original clip replaced by two new clips.
4. Implement `moveClip(composition, clipId, targetTrackId, targetFrame): Composition` -- relocates a clip. Validates track type compatibility (video clip to video track).
5. Implement `deleteClip(composition, clipId, ripple: boolean): Composition` -- removes a clip. If ripple, shifts subsequent clips on the same track to fill the gap.
6. Implement `resolveOverlaps(composition, trackId): Composition` -- detects overlapping clips on a track and resolves them (push later clip forward).
7. Implement `snapToGrid(frame, gridSize): number` and `snapToEdges(frame, composition, tolerance): number` -- magnetic snapping to grid lines and clip edges.
8. Implement `getActiveClipsAtFrame(composition, frame): Clip[]` -- returns all clips active at a given frame across all tracks, sorted by track z-order.
9. Write extensive unit tests including edge cases: split at frame 0, split at last frame, trim past source bounds, move to same position (no-op), delete last clip, ripple with gaps, overlapping clips on same track.
10. Write property-based tests (using fast-check or similar): random clip operations should never produce invalid state (negative durations, sourceIn > sourceOut, overlapping clips after resolveOverlaps).

**Done criteria**:
- All 8 functions implemented as pure functions (no side effects, no mutations).
- Every function returns a new `Composition` -- never mutates input.
- Unit test coverage > 95% of branches.
- Property-based tests pass for 1000 random operation sequences.
- Zero dependencies beyond `@rough-cut/project-model`.

**Parallelization**: Can be built concurrently with 1.4 (effect-registry) -- they share only `project-model` as a dependency and do not depend on each other.

---

### 1.4 Effect Registry Package

**Package**: `@rough-cut/effect-registry`
**Effort**: 3-4 days
**Dependencies**: 1.2

**Tasks**:
1. Define `EffectDefinition` interface per the architecture spec: `type`, `name`, `category`, `params` (schema), `createPreviewFilter`, `updatePreviewFilter`, `renderExportFrame`.
2. Define `TransitionDefinition` interface: `type`, `name`, `blend(frameA, frameB, progress, params)`.
3. Define `ParamDefinition` interface: `name`, `type` (number, string, boolean, color, enum), `default`, `min`, `max`, `step`, `options`.
4. Implement the registry: `registerEffect(def)`, `getEffect(type)`, `getAllEffects()`, `registerTransition(def)`, `getTransition(type)`.
5. Implement keyframe interpolation: `evaluateKeyframeTracks(tracks: KeyframeTrack[], frame: number): ResolvedParams` -- resolves all animated properties at a given frame.
6. Implement `interpolateValue(k1: Keyframe, k2: Keyframe, t: number): number | string` -- interpolation between two keyframes.
7. Implement easing functions: `linear`, `ease-in` (quadratic), `ease-out`, `ease-in-out`, `cubic-bezier(x1, y1, x2, y2)`. Export `resolveEasing(type, tangent?) => (t: number) => number`.
8. Implement 3 built-in effect definitions (data + preview stubs + export stubs): `gaussian-blur`, `zoom-pan`, `rounded-corners`. Preview/export render functions can be stubs at this point -- they will be completed in Phase 2 when the renderers exist.
9. Implement 1 built-in transition definition: `cross-dissolve`.
10. Write unit tests: registry CRUD, keyframe interpolation at exact keyframe frames and between frames, easing function accuracy (test known values), parameter clamping to min/max.

**Done criteria**:
- Registry can register and retrieve effects and transitions.
- `evaluateKeyframeTracks()` correctly interpolates between keyframes with all easing types.
- Easing functions match expected curves (test against known cubic-bezier values).
- 3 effect definitions registered (render functions may be stubs).
- 1 transition definition registered.
- Unit test coverage > 90%.

**Parallelization**: Can be built concurrently with 1.3 (timeline-engine).

---

### 1.5 Store Package

**Package**: `@rough-cut/store`
**Effort**: 3-5 days
**Dependencies**: 1.2, 1.3 (informed by Spike 0.3 results)

**Tasks**:
1. Set up Zustand store with immer middleware, devtools middleware, and `subscribeWithSelector`.
2. Implement project slice: `setProject()`, `updateSettings()`, `getProject()`.
3. Implement assets slice: `addAsset()`, `removeAsset()`, `getAssetById()`.
4. Implement composition slice: wraps timeline-engine functions as actions -- `placeClip()`, `trimClip()`, `splitClip()`, `moveClip()`, `deleteClip()`. Each action calls the corresponding timeline-engine pure function and updates state.
5. Implement playback slice: `currentFrame`, `isPlaying`, `playbackRate`, `setFrame()`, `play()`, `pause()`, `stepForward()`, `stepBackward()`. This slice is **excluded from undo history** per Spike 0.3 findings -- transport state uses a separate high-frequency update path.
6. Implement selection slice: `selectedClipIds`, `selectedTrackId`, `selectClip()`, `deselectAll()`, `toggleClipSelection()`.
7. Implement UI slice: `activeTab`, `timelineZoom`, `panelSizes`, `setActiveTab()`.
8. Integrate zundo (temporal) for undo/redo on project, assets, and composition slices. Configure debounce for rapid mutations (drag operations group into single undo step).
9. Implement key selectors: `selectActiveClipsAtFrame()`, `selectClipEffectParams()`, `selectTracksByType()`, `selectAssetById()`.
10. Write unit tests: every action produces correct state, undo/redo reverses and re-applies, playback state changes don't trigger undo snapshots, selectors return correct data, rapid mutations are grouped.

**Done criteria**:
- All slices implemented and tested.
- Undo/redo works for all composition mutations.
- Playback state is separated from undo-able state.
- Store is accessible outside React (`store.getState()`, `store.subscribe()`).
- Performance: updating `currentFrame` at 60Hz does not trigger re-renders in non-playback subscribers (verified by test).

**Risks**:
- Undo/redo grouping for drag operations is tricky. The debounce window must be long enough to group a full drag but short enough that the user's next action isn't accidentally merged. Start with 300ms, tune based on testing.

---

### Phase 1 Done Criteria

- [ ] Monorepo builds, lints, typechecks, and tests pass in CI.
- [ ] `project-model` is complete with full type coverage, schemas, factories, and migrations.
- [ ] `timeline-engine` handles all clip operations with >95% test coverage.
- [ ] `effect-registry` handles registration, interpolation, and easing.
- [ ] `store` manages all state with undo/redo, separated transport state, and outside-React access.
- [ ] No circular dependencies between packages (enforced in CI).
- [ ] All packages have published type declarations consumable by downstream packages.

### Phase 1 Risks

- **Schema design mistakes**: The project model is the foundation. A wrong type definition here cascades to every package. Mitigation: explicit review gate.
- **Zustand performance**: If Spike 0.3 revealed issues, the store architecture may need to deviate from the plan. Mitigation: the spike was run first.

### Phase 1 Parallelization

```
1.1 (scaffold)
  └──▶ 1.2 (project-model)
         ├──▶ 1.3 (timeline-engine) ──┐
         ├──▶ 1.4 (effect-registry)   ├──▶ 1.5 (store)
         └────────────────────────────┘
```

1.3 and 1.4 can be built in parallel by two developers after 1.2 is complete.

---

## Phase 2: Core Rendering

**Goal**: Prove the rendering architecture works end-to-end. At the end of this phase, a hardcoded project document renders correctly in both the PixiJS preview and the FFmpeg export pipeline, and the two outputs match visually. This is the first "it works" moment.

**Entry criteria**: Phase 1 complete (1.2 and 1.4 are hard requirements; 1.5 is needed for preview-store integration).

**Time budget**: 2-3 weeks.

### 2.1 Preview Renderer Package

**Package**: `@rough-cut/preview-renderer`
**Effort**: 5-7 days
**Dependencies**: 1.2, 1.4

**Tasks**:
1. Set up PixiJS (v8) as a dependency. Create the `PreviewCompositor` class with lifecycle methods: `constructor(canvas: HTMLCanvasElement)`, `setProject(doc: ProjectDocument)`, `seekTo(frame: number)`, `play()`, `pause()`, `resize(width, height)`, `destroy()`.
2. Implement frame resolution: given a frame number and a project, determine which clips are active on each track, their z-order, and their source frame numbers (accounting for `sourceIn` offsets).
3. Implement video texture loading from `<video>` elements. Create a pool of video elements (one per active clip). Implement `seek → drawImage → upload to PIXI.Texture` pipeline. [VALIDATION] -- validates Spike 0.1 findings.
4. Implement LRU texture cache (configurable size, default 120 frames). Cache key = `assetId:frameNumber`. Track memory usage.
5. Implement the render loop: for each active video clip (z-ordered), apply clip transform (position, scale, rotation, anchor, opacity) as PixiJS sprite properties.
6. Wire effect rendering: for each clip's `EffectInstance[]`, call `getEffect(type).createPreviewFilter()` and `updatePreviewFilter()`. Apply PIXI.Filter instances to the clip sprite. Complete the preview-side implementations for `gaussian-blur`, `zoom-pan`, and `rounded-corners`.
7. Implement transition rendering: when two clips overlap with a `Transition`, render both clips and blend them using the transition definition's blend function.
8. Implement `playback-clock.ts`: `requestAnimationFrame`-based loop that advances `currentFrame` at the project's FPS. Accounts for frame skipping when the render loop can't keep up.
9. Implement audio sync stub: create Web Audio nodes per audio clip, schedule playback against the timeline clock. Full audio mixing is a Phase 4/5 concern -- for now, play a single audio track.
10. Write integration tests: create a `PreviewCompositor` with a mock canvas (via `jsdom` or headless PixiJS), set a test project, seek to known frames, verify the compositor queries the correct clips and applies the correct transforms.

**Done criteria**:
- `PreviewCompositor` renders a multi-clip, multi-track composition with effects to a canvas.
- Seeking to any frame renders the correct clips with correct transforms and effects.
- Playback runs at target FPS (measured, not assumed) on a mid-range machine.
- LRU cache prevents redundant texture uploads during scrubbing.
- At least 3 effects render correctly in preview.

**Risks**:
- [HIGH-RISK] PixiJS video texture performance. If `<video>` seeking is too slow (as Spike 0.1 may reveal), the texture loading strategy may need to use a frame extraction approach instead. The compositor architecture should abstract texture source behind a `FrameProvider` interface to allow swapping strategies.
- GPU context contention on integrated GPUs. Mitigation: test on weakest target hardware early. Implement quality degradation during scrubbing.

---

### 2.2 Export Renderer Package

**Package**: `@rough-cut/export-renderer`
**Effort**: 4-5 days
**Dependencies**: 1.2, 1.4

**Tasks**:
1. Implement `ExportPipeline` class: `constructor(project: ProjectDocument, settings: ExportSettings)`, `start(): Promise<void>`, `abort()`, `onProgress(callback)`.
2. Implement frame decoder: use FFmpeg (via child process) to extract frames sequentially from source assets. Output as raw RGBA buffers. Implement a pre-decode buffer (N frames ahead) to prevent pipeline stalls.
3. Implement the frame render loop: for each frame 0 to `composition.duration - 1`:
   - Resolve active clips (same logic as preview, shared from project-model utilities).
   - Decode source frames from each active clip's asset.
   - Apply clip transforms (position, scale, rotation, opacity) using Canvas2D.
   - Apply effects using the export-side render functions from effect-registry.
   - Composite clips in z-order onto the output canvas.
   - Resolve transitions by blending two rendered frames.
4. Complete the export-side implementations for `gaussian-blur`, `zoom-pan`, and `rounded-corners` in the effect-registry.
5. Implement FFmpeg writer: pipe composed RGBA frames to `ffmpeg -f rawvideo -pix_fmt rgba -s WxH -r FPS -i pipe:0 -c:v libx264 -crf CRF output.mp4`. Handle FFmpeg stderr for progress and errors.
6. Implement progress reporting: emit progress events with `{ currentFrame, totalFrames, percentage, estimatedTimeRemaining }`.
7. Implement abort: kill the FFmpeg process, clean up partial output file.
8. Implement audio mixing stub: extract audio tracks via FFmpeg, mix to stereo, mux with video in a second pass or single-pass with `-i` per audio stream.
9. Write integration tests: export a 30-frame test project (solid color clips with known effects), verify the output MP4 has the correct frame count, resolution, and codec (via ffprobe). Verify a specific frame matches expected pixel values.

**Done criteria**:
- `ExportPipeline` produces a valid MP4 from a `ProjectDocument`.
- Frame count in output matches `composition.duration`.
- Effects are applied correctly (verified by extracting frames from output and comparing).
- Progress reporting works with frame-level granularity.
- Abort cleans up without leaving orphan processes or files.
- Memory usage stays under 200MB (no frame accumulation -- streaming pipeline).

**Risks**:
- [HIGH-RISK] FFmpeg bundling and spawning. Path resolution, permissions, and cross-platform binary selection are error-prone. Mitigation: abstract FFmpeg spawning behind a `FfmpegRunner` utility that handles platform-specific path resolution.
- Large frame buffers. An uncompressed 1080p RGBA frame is ~8MB. The pipeline must never hold more than 3-4 frames in memory simultaneously.

---

### 2.3 Vertical Slice: Preview/Export Parity [VALIDATION]

**Effort**: 2-3 days
**Dependencies**: 2.1, 2.2

**Tasks**:
1. Create a test project fixture: 2 video tracks, 3 clips with overlaps, 1 transition (cross-dissolve), effects (blur on one clip, zoom on another, rounded corners on a third).
2. Render frame N in the preview compositor. Extract the canvas pixels.
3. Export the same project. Extract frame N from the output MP4 via FFmpeg.
4. Compare the two frames pixel-by-pixel. Allow a tolerance (e.g., SSIM > 0.95) because preview uses WebGL and export uses Canvas2D -- slight antialiasing differences are expected.
5. Automate this as a CI test: `test:parity` script that renders 5 known frames and compares.
6. If parity fails: investigate whether the discrepancy is in effect rendering, transform application, or compositing order. Fix until SSIM > 0.95 for all test frames.

**Done criteria**:
- 5 test frames pass parity check (SSIM > 0.95) between preview and export.
- Parity test runs in CI.
- Any discrepancies are documented with root cause (e.g., "WebGL uses premultiplied alpha, Canvas2D does not -- normalized in export postprocess").

---

### Phase 2 Done Criteria

- [ ] Preview renderer displays a multi-clip composition with effects in a canvas.
- [ ] Export renderer produces a valid MP4 from the same composition.
- [ ] Preview and export produce visually matching output (SSIM > 0.95).
- [ ] Parity test runs in CI.
- [ ] Demo D1 is achievable: a hardcoded project renders in both pipelines.

### Phase 2 Parallelization

```
2.1 (preview-renderer) ──┐
                          ├──▶ 2.3 (parity test)
2.2 (export-renderer) ───┘
```

2.1 and 2.2 can be built in parallel. They share only `project-model` and `effect-registry` -- they never import each other.

---

## Phase 3: Electron Shell + Record Tab

**Goal**: First user-visible milestone. The app opens as a native desktop window, the user can record their screen, and the recording appears as an asset with a live preview. This is Demo D2.

**Entry criteria**: Phase 1 complete, Phase 2.1 complete (preview renderer needed for live recording preview).

**Time budget**: 2-3 weeks.

### 3.1 Electron App Shell

**Package**: `apps/desktop`
**Effort**: 3-4 days
**Dependencies**: 1.5 (store)

**Tasks**:
1. Set up Electron with Vite (electron-vite or manual configuration). Configure main process entry, preload script, and renderer entry.
2. Create the main window with appropriate defaults: 1280x800 minimum, native title bar (or custom frame if design requires it), dev tools toggle in development.
3. Set up React 18 entry point in the renderer process. Mount the root `<App />` component.
4. Implement `AppShell` component: tab bar with 5 tabs (Record, Edit, Motion, AI, Export), content area that renders the active tab's component, status bar at the bottom.
5. Wire the Zustand store to initialize with a new empty project on app launch.
6. Set up COOP/COEP headers for `SharedArrayBuffer` support (needed for future frame transfer optimizations).
7. Configure electron-builder for development builds (not release packaging yet).
8. Implement basic window lifecycle: close confirmation if project has unsaved changes (stub -- save/load comes in Phase 6).

**Done criteria**:
- `pnpm dev` launches an Electron window with 5 tabs.
- Switching tabs renders the correct (initially empty) tab content.
- Store initializes with a valid empty project.
- Dev tools are accessible.

---

### 3.2 IPC Package

**Package**: `@rough-cut/ipc`
**Effort**: 2-3 days
**Dependencies**: 1.2

**Tasks**:
1. Define the `IpcContract` type: a mapped type where each channel name maps to `{ request: TReq, response: TRes }`. Include all channels from the architecture spec (capture, export, file I/O, assets, AI).
2. Implement `createMainHandler(contract)`: registers `ipcMain.handle()` for each channel with type-safe handler functions. Returns a typed event emitter for main-to-renderer push events.
3. Implement `createRendererClient(contract)`: creates a typed client that wraps `ipcRenderer.invoke()` with type inference. The client is exposed via `contextBridge` in the preload script.
4. Implement the preload script that exposes the renderer client on `window.api`.
5. Write type-level tests: verify that calling a channel with wrong request type is a compile error, and that the response type is correctly inferred.
6. Implement a `MessagePort`-based channel for high-throughput data (preview frames during recording) -- separate from the invoke/handle pattern.

**Done criteria**:
- Typed IPC contract covers all channels.
- Main handler and renderer client are type-safe (compile-time errors on misuse).
- Preload script exposes the client correctly.
- No raw `ipcRenderer.send()` or `ipcMain.on()` calls anywhere -- all IPC goes through the contract.

---

### 3.3 Capture Package

**Package**: `@rough-cut/capture`
**Effort**: 4-5 days
**Dependencies**: 3.2, Spike 0.2 findings

**Tasks**:
1. Define the `CaptureBackend` interface: `getSources(): Promise<SourceInfo[]>`, `startCapture(config): MediaStream`, `stopCapture()`. Config includes source ID, resolution, frame rate, audio settings.
2. Implement `ElectronCaptureBackend` using `desktopCapturer`. Handle platform-specific behavior per Spike 0.2 findings (Wayland portal on Linux, TCC on macOS).
3. Implement `CaptureSession` orchestrator: manages the lifecycle of a recording session. Handles `start()`, `pause()`, `resume()`, `stop()`. Uses `MediaRecorder` to write chunks to temp files.
4. Implement webcam stream capture (separate from screen capture). Uses `navigator.mediaDevices.getUserMedia()`.
5. Implement audio capture: microphone via `getUserMedia()`, system audio via platform-specific approach (or document limitation).
6. Implement post-capture processing: on stop, run `ffprobe` on the finalized files to extract duration, resolution, codec, frame count. Generate a thumbnail (extract frame at 1 second).
7. Implement live preview frame extraction: during recording, periodically extract low-resolution frames from the capture stream and send to the renderer via `MessagePort` for the live preview.
8. Wire capture IPC handlers: `capture.start`, `capture.stop`, `capture.pause`, `capture.resume`, `capture.status`, `capture.sources`, `capture.preview-frame`.
9. Handle edge cases: device disconnection mid-recording (warn but continue), disk space monitoring, recording duration limit.
10. Write unit tests (with mocked MediaRecorder): verify session lifecycle, state transitions, asset metadata extraction.

**Done criteria**:
- `CaptureSession` records screen to a file.
- Screen, webcam, and mic are captured as separate files/assets.
- Post-capture `ffprobe` extracts accurate metadata.
- Thumbnail is generated.
- Live preview frames are streamed during recording.
- Device disconnection is handled gracefully.

**Risks**:
- [HIGH-RISK] Platform-specific capture issues identified in Spike 0.2. The implementation must respect the spike's findings. If Wayland portal is the only option on Linux, the UX must accommodate the picker dialog.

---

### 3.4 Record Tab UI

**Package**: `@rough-cut/ui` (components/record/)
**Effort**: 4-5 days
**Dependencies**: 3.1, 3.3, 2.1

**Tasks**:
1. Implement `RecordTab` container component with the layout from the MVP spec: top toolbar, center canvas, bottom controls, right sidebar.
2. Implement `SourcePicker` dropdown: calls `capture.sources` IPC, displays source names with thumbnails, handles selection.
3. Implement live preview canvas: embed the `PreviewCompositor` in a `PreviewCanvas` wrapper component. During idle, show the selected source's live feed. During recording, show the composed feed with styling.
4. Implement recording style controls in the right sidebar: background color/gradient picker, padding slider, corner radius slider, shadow toggle + controls, webcam size/position/shape controls.
5. Implement audio controls: mic selector dropdown, system audio toggle, VU meters (real-time audio level visualization using `AnalyserNode`).
6. Implement webcam toggle and preview: when enabled, show a draggable webcam bubble overlay on the preview canvas.
7. Implement recording controls: REC button with countdown (configurable: 0/3/5/10s), Pause, Stop, elapsed time display.
8. Implement recording state management: create a `recordingStore` (separate from project store) for UI state -- selected source, device IDs, sidebar values. Persist last-used config to `localStorage`.
9. Implement post-recording flow: on stop, add the new asset(s) to the project store, optionally create clip(s) on the timeline, show a toast notification, offer to switch to Edit tab.
10. Write component tests: source picker renders sources, recording controls enable/disable based on state, sidebar values propagate to preview.

**Done criteria**:
- User can see a live preview of their selected screen with styling applied.
- User can configure background, padding, corners, shadow, and webcam.
- User can record, pause, resume, and stop.
- After stopping, new asset(s) appear in the project store.
- Audio meters display real-time levels.

---

### 3.5 Vertical Slice: Record to Preview [VALIDATION]

**Effort**: 1-2 days
**Dependencies**: 3.4

This is Demo D2. Walk through the entire flow end-to-end:

**Tasks**:
1. Launch the app. Open the Record tab. Select a screen source.
2. Configure styling (background, padding, corners).
3. Enable webcam and mic.
4. Record for 10 seconds. Stop.
5. Verify: new asset(s) in the project store with correct metadata.
6. Switch to Edit tab. Verify: clip(s) appear on the timeline.
7. Seek to a frame in the recording. Verify: preview renders the correct frame.
8. Document any issues found during the walkthrough.

**Done criteria**:
- The full Record → Asset → Timeline → Preview flow works without manual intervention.
- No crashes, no data loss, no silent failures.

---

### Phase 3 Done Criteria

- [ ] Electron app launches with 5 tabs.
- [ ] IPC is fully typed and wired.
- [ ] Screen recording works on the primary development platform.
- [ ] Recording produces valid assets with correct metadata.
- [ ] Live preview shows styled recording.
- [ ] Demo D2 is achievable.

### Phase 3 Risks

- [HIGH-RISK] Platform-specific recording issues. Linux Wayland support is the biggest concern. Accept known limitations documented in Spike 0.2.
- Electron + Vite configuration complexity. Many moving parts (main process, preload, renderer, PixiJS). Budget extra time for build tooling.

### Phase 3 Parallelization

```
3.1 (Electron shell) ──────────────────────┐
3.2 (IPC package) ──▶ 3.3 (capture) ──────┤
                                            ├──▶ 3.4 (Record UI) ──▶ 3.5 (vertical slice)
Phase 2.1 (preview-renderer, if not done) ─┘
```

3.1 and 3.2 can start in parallel. 3.3 depends on 3.2. 3.4 depends on 3.1, 3.3, and 2.1.

---

## Phase 4: Edit Tab

**Goal**: Build the core editor -- the product's reason for being. At the end of this phase, a user can record their screen, edit the recording on a timeline with effects and transitions, and preview the result. This is Demo D3.

**Entry criteria**: Phase 3 complete.

**Time budget**: 3-4 weeks.

### 4.1 Timeline UI Component

**Package**: `@rough-cut/ui` (components/timeline/)
**Effort**: 5-7 days
**Dependencies**: 1.5, 3.1

**Tasks**:
1. Implement `Timeline` container component: horizontal track lanes with a shared time ruler at the top.
2. Implement `TimeRuler`: frame/timecode markings that scale with zoom. Shows both frame numbers and `HH:MM:SS:FF` timecode.
3. Implement `TrackLane` component: renders a horizontal lane for a single track. Shows track header on the left (name, mute/solo, lock, volume slider for audio).
4. Implement `ClipBlock` component: renders a clip as a rectangular block with correct position and width (derived from `timelineIn`, `timelineOut`, and timeline zoom). Video clips show thumbnail strips (lazy-loaded). Audio clips show waveforms (generated on demand).
5. Implement `Playhead` component: vertical line spanning all tracks, draggable and click-positionable on the ruler. Updates `playbackStore.currentFrame`.
6. Implement timeline zoom: Ctrl+scroll or slider to scale the time axis. Store zoom level in UI slice.
7. Implement virtual scrolling: only render clips and thumbnails that are visible in the viewport. Critical for performance with many clips.
8. Implement clip selection: click to select (highlight), Shift+click for multi-select, Ctrl/Cmd+click to toggle. Selection state stored in selection slice.
9. Wire the timeline to the store: subscribe to `composition` slice for clips/tracks, `playback` slice for playhead position, `selection` slice for highlights.
10. Write component tests: clips render at correct positions, zoom scales correctly, selection highlights correctly, playhead positions correctly.

**Done criteria**:
- Timeline displays 4 tracks (2V + 2A) with clips at correct positions.
- Playhead is draggable and click-positionable.
- Zoom works smoothly from overview to frame-level detail.
- Virtual scrolling keeps render count bounded regardless of clip count.
- Clip selection works with single and multi-select.

**Risks**:
- [HIGH-RISK] Timeline rendering performance. This is the most complex UI component in the app. Thumbnail generation and waveform rendering must be lazy and cached. Spike 0.3 results should guide the subscription strategy.

---

### 4.2 Clip Operations UI

**Package**: `@rough-cut/ui` (components/timeline/)
**Effort**: 4-5 days
**Dependencies**: 1.3, 4.1

**Tasks**:
1. Implement clip drag-to-move: horizontal dragging repositions the clip (updates `timelineIn`/`timelineOut`). Vertical dragging moves to another track (same type only). Snap to clip edges and playhead when snap is enabled.
2. Implement trim handles: dragging the left or right edge of a clip trims it. Left trim adjusts `sourceIn` and `timelineIn`. Right trim adjusts `sourceOut` and `timelineOut`. Clamp to source duration. Show a live preview of the trim frame during drag.
3. Implement split at playhead: keyboard shortcut `S` or toolbar button. Calls `splitClip()` from timeline-engine via store action. Visual feedback: the clip divides into two at the playhead.
4. Implement delete: `Delete`/`Backspace` removes selected clip(s). Toggle between normal delete (leave gap) and ripple delete (shift subsequent clips).
5. Implement ripple mode toggle in toolbar: when enabled, deleting or trimming shifts subsequent clips.
6. Implement snap toggle: magnetic snapping to clip edges, playhead, and frame grid.
7. Wire all operations through the store: each drag/trim/split/delete calls a store action that delegates to timeline-engine, then updates the store state. This ensures undo/redo captures all operations.
8. Write component tests and integration tests: drag a clip, verify new position in store. Trim a clip, verify new source in/out. Split a clip, verify two clips with correct properties. Delete with ripple, verify subsequent clips shift.

**Done criteria**:
- All clip operations (move, trim, split, delete) work via direct manipulation on the timeline.
- Snap magnetism works for clip edges and playhead.
- Ripple mode toggle changes delete/trim behavior.
- All operations are undoable (verified via store inspection).

---

### 4.3 Preview Playback Integration

**Package**: `@rough-cut/ui` (components/preview/), `@rough-cut/preview-renderer`
**Effort**: 3-4 days
**Dependencies**: 2.1, 4.1

**Tasks**:
1. Implement `PreviewCanvas` component in the Edit tab: hosts the PixiJS canvas, manages `PreviewCompositor` lifecycle (create on mount, destroy on unmount).
2. Wire the compositor to the store: subscribe to `composition` and `playback` slices. On `currentFrame` change, call `compositor.seekTo(frame)`. On composition change, call `compositor.setProject()`.
3. Implement transport controls: Play/Pause button, step forward/backward (frame-by-frame), skip to start/end. Display current timecode.
4. Implement J/K/L scrubbing: J = reverse at increasing speeds, K = pause, L = forward at increasing speeds.
5. Implement audio playback during preview: create Web Audio nodes for audio clips, schedule playback in sync with the visual playhead. Mix multiple audio tracks.
6. Test playback at 30fps: verify frame timing accuracy (no drift over a 1-minute composition).

**Done criteria**:
- Preview canvas renders the correct frame when the playhead moves.
- Play/Pause advances the playhead at project FPS with frame-accurate timing.
- Audio plays in sync with video preview.
- J/K/L scrubbing works at variable speeds.
- Scrubbing the timeline updates the preview within 100ms.

---

### 4.4 Effects + Inspector Panel

**Package**: `@rough-cut/ui` (components/inspector/), `@rough-cut/effect-registry`
**Effort**: 4-5 days
**Dependencies**: 1.4, 4.1

**Tasks**:
1. Implement `ClipInspector` component: displays when a clip is selected. Shows clip name, source info, in/out points, opacity, blend mode.
2. Implement `EffectStack` component: lists the clip's effects. Each effect is an expandable section showing parameter controls. Drag to reorder.
3. Implement `EffectControls` component: renders type-appropriate controls for each parameter (slider for numbers, color picker for colors, dropdown for enums, checkbox for booleans). Values update the store on change.
4. Implement "Add Effect" dropdown: lists all registered effects from the effect registry. Selecting one adds an `EffectInstance` to the clip.
5. Implement keyframe toggle per parameter: a diamond icon next to each animatable parameter. When enabled, the current value is captured as a keyframe at the current playhead frame. Show keyframe markers on the timeline at the clip's row.
6. Implement `KeyframeEditor`: basic keyframe manipulation -- click to select, drag to move in time, delete, change easing type.
7. Complete all 8 built-in effect preview implementations: `gaussian-blur`, `zoom-pan`, `color-correct`, `drop-shadow`, `rounded-corners`, `background-blur`, `fade`, `cursor-highlight`.
8. Wire effect changes to preview: when effect params change in the inspector, the store updates, the preview compositor picks up the change and re-renders.
9. Write component tests: adding an effect updates the store, changing a parameter updates the store and triggers preview refresh, keyframe creation captures the current value.

**Done criteria**:
- Inspector shows clip properties and effect stack when a clip is selected.
- All 8 built-in effects can be added, configured, and previewed.
- Keyframe animation works: user can set keyframes at different frames and see the effect animate during playback.
- Effect parameter changes are reflected in the preview within one frame.

---

### 4.5 Undo/Redo Integration

**Package**: `@rough-cut/store`, `@rough-cut/ui`
**Effort**: 2-3 days
**Dependencies**: 1.5, 4.2

**Tasks**:
1. Wire keyboard shortcuts: Ctrl/Cmd+Z for undo, Ctrl/Cmd+Shift+Z for redo. Add toolbar buttons.
2. Verify that all composition mutations are captured: move, trim, split, delete, add/remove effect, change effect param, add/remove keyframe, add/remove transition.
3. Verify that drag operations are grouped: dragging a clip across 20 intermediate positions produces only 1 undo step.
4. Verify that playback state (currentFrame, isPlaying) is NOT captured in undo history.
5. Verify that UI state (tab selection, panel sizes) is NOT captured in undo history.
6. Implement undo/redo state display: show a count of available undo/redo steps in the toolbar (or disable buttons when empty).
7. Stress test: perform 100 random operations, undo all, verify state matches initial state.

**Done criteria**:
- Every timeline/effect mutation is undoable.
- Undo/redo keyboard shortcuts work.
- Drag operations are grouped into single steps.
- Ephemeral state is excluded from history.
- 100-operation undo/redo round-trip produces clean initial state.

---

### 4.6 Transitions

**Package**: `@rough-cut/ui`, `@rough-cut/effect-registry`, `@rough-cut/preview-renderer`
**Effort**: 3-4 days
**Dependencies**: 1.4, 4.2

**Tasks**:
1. Implement transition creation UX: when the user drags a clip to overlap another clip on the same track, create a `Transition` entity. Show a visual indicator (crossfade icon) at the overlap zone.
2. Implement transition rendering in the preview compositor: when the playhead is within a transition zone, render both clips and blend using the `TransitionDefinition.blend()` function.
3. Complete the 3 built-in transition definitions: `cross-dissolve`, `wipe`, `slide`. Implement both preview and export render functions.
4. Implement transition inspector: when clicking a transition zone, show controls for transition type and duration.
5. Implement transition rendering in the export pipeline (ensure parity with preview).
6. Write tests: transition creation on overlap, rendering blends correctly at progress=0, progress=0.5, progress=1.

**Done criteria**:
- Transitions can be created by overlapping clips.
- Cross-dissolve, wipe, and slide transitions render correctly in preview and export.
- Transition type and duration are configurable in the inspector.

---

### 4.7 Vertical Slice: Record to Edit to Preview [VALIDATION]

**Effort**: 1-2 days
**Dependencies**: 4.1-4.6

This is Demo D3. Walk through the full editing workflow:

**Tasks**:
1. Record a 30-second screen capture with webcam and audio.
2. Switch to Edit tab. Verify clips on the timeline.
3. Trim the beginning and end of the screen recording clip.
4. Split the clip at a point and delete the middle section (ripple).
5. Add a zoom effect to a section, set keyframes for zoom in and zoom out.
6. Add a cross-dissolve transition between two clips.
7. Play back the result. Verify effects and transitions render correctly.
8. Undo all operations. Verify clean state. Redo all. Verify final state.
9. Document any issues.

**Done criteria**:
- Full Record → Edit → Preview workflow works.
- All clip operations, effects, transitions, and undo/redo function correctly.
- Preview renders the edited composition accurately.

---

### Phase 4 Done Criteria

- [ ] Timeline displays clips with thumbnails/waveforms.
- [ ] All clip operations (move, trim, split, delete, ripple) work.
- [ ] Preview playback runs at target FPS with audio sync.
- [ ] 8 built-in effects are functional.
- [ ] Keyframe animation works.
- [ ] 3 transition types work.
- [ ] Undo/redo covers all mutations.
- [ ] Demo D3 is achievable.

### Phase 4 Risks

- [HIGH-RISK] Timeline performance with thumbnails and waveforms. Lazy generation and virtual scrolling are essential. Budget time for optimization.
- Preview playback FPS on integrated GPUs. May need quality degradation during playback.
- Undo/redo grouping edge cases with concurrent drag + effect changes.

### Phase 4 Parallelization

```
4.1 (Timeline UI) ──▶ 4.2 (Clip operations) ──▶ 4.5 (Undo/redo)
                  └──▶ 4.3 (Preview integration)
                  └──▶ 4.4 (Effects + Inspector) ──▶ 4.6 (Transitions)
```

4.3, 4.4, and 4.2 can start in parallel once 4.1 is complete. 4.5 depends on 4.2. 4.6 depends on 4.4 and 4.2.

---

## Phase 5: Motion + AI + Export Tabs

**Goal**: Complete the remaining three tabs. At the end of this phase, all 5 tabs are functional. This is Demo D4.

**Entry criteria**: Phase 4 core complete (4.1-4.5 minimum; 4.6 transitions are nice-to-have).

**Time budget**: 3-4 weeks (partially parallelizable across 3 tracks).

The three sub-phases (5A, 5B, 5C) can be worked on concurrently by separate developers. They share the project model and store but have minimal code dependencies on each other.

---

### Track 5A: Motion Tab

#### 5A.1 Motion Template Data Model

**Package**: `@rough-cut/project-model` (extension), `@rough-cut/effect-registry`
**Effort**: 2-3 days
**Dependencies**: 1.2, 1.4

**Tasks**:
1. Define `MotionTemplate` type with full fidelity: `id`, `name`, `category`, `thumbnail`, `parameters` (schema with types/defaults/constraints), `composition` (mini-composition with layers and keyframed properties).
2. Define `TemplateParameter` type: `name`, `type` (string, number, color, enum, boolean), `default`, `min`, `max`, `options`, `label`.
3. Create 8 template definitions as JSON/TS data: 2 intros, 2 outros, 2 lower thirds, 1 call-to-action, 1 zoom emphasis. Each template has a mini-composition with sprites/text and keyframed transforms.
4. Implement template parameter resolution: given a template definition and user-provided parameter values, produce a resolved composition ready for rendering.
5. Implement template-to-clip conversion: `createClipFromTemplate(template, params, projectSettings)` produces an `Asset` and `Clip` pair.

**Done criteria**:
- 8 template definitions exist as data.
- Template parameters are validated against their schemas.
- Templates convert to clips with correct duration and effects.

---

#### 5A.2 Template Renderer

**Package**: `@rough-cut/preview-renderer`, `@rough-cut/export-renderer`
**Effort**: 2-3 days
**Dependencies**: 2.1, 2.2, 5A.1

**Tasks**:
1. Extend the preview compositor to handle `motion-template` asset type: when encountering a template clip, evaluate the template's internal composition at the relative frame. Create PixiJS sprites and text objects for each layer. Apply keyframed transforms.
2. Implement text rendering in PixiJS: use `PIXI.Text` or `PIXI.BitmapText` for template text layers. Handle font loading, sizing, and color from template parameters.
3. Extend the export renderer to handle template clips: same composition evaluation, rendered via Canvas2D. Text rendered via `ctx.fillText()` at export resolution.
4. Verify preview/export parity for template clips (extend the parity test from 2.3).

**Done criteria**:
- Template clips render correctly in both preview and export.
- Text is crisp at project resolution.
- Template animations play smoothly with correct keyframe interpolation.

---

#### 5A.3 Motion Tab UI

**Package**: `@rough-cut/ui` (components/motion/)
**Effort**: 3-4 days
**Dependencies**: 3.1, 5A.1, 5A.2

**Tasks**:
1. Implement `MotionTab` container with the layout from the MVP spec: left sidebar (template library), center canvas (template preview), right panel (parameter editor).
2. Implement `TemplateLibrary` component: scrollable grid of template cards with thumbnail, name, and category badge. Implement search filtering and category filtering.
3. Implement `TemplatePreview` component: PixiJS canvas that plays the selected template's animation. Playback controls (play, pause, loop). Uses the preview compositor with the template's mini-composition.
4. Implement `ParameterEditor` component: renders type-appropriate controls for each template parameter. Changes update the preview in real-time.
5. Implement "Apply to Timeline" button: creates the asset and clip via store action, optionally switches to Edit tab.
6. Write component tests: template selection loads preview, parameter changes update preview, apply creates clip in store.

**Done criteria**:
- User can browse, search, and filter 8 templates.
- Template preview plays with correct animation.
- Parameter editing updates the preview in real-time.
- "Apply to Timeline" creates a clip that renders correctly in the Edit tab.

---

### Track 5B: AI Tab

#### 5B.1 AI Bridge Package

**Package**: `@rough-cut/ai-bridge`
**Effort**: 2-3 days
**Dependencies**: 1.2

**Tasks**:
1. Define `AiProvider` interface: `analyzeForCaptions(assetPath, options): AsyncGenerator<CaptionAnnotation>`, `analyzeForZoom(assetPath, options): AsyncGenerator<ZoomAnnotation>`.
2. Define `CaptionAnnotation` and `ZoomAnnotation` types that map to `AIAnnotation` in the project model.
3. Implement `LocalWhisperProvider`: spawns whisper.cpp or whisper binary, feeds audio extracted via FFmpeg, parses JSON output into annotations. Runs in a `utilityProcess`.
4. Implement `CloudWhisperProvider` stub: calls an external API (OpenAI Whisper API or similar). Requires API key configuration.
5. Implement provider registry: `registerProvider()`, `getProvider()`, `getAvailableProviders()`.
6. Write unit tests with mocked whisper output: verify annotation parsing, frame number conversion at different FPS values.

**Done criteria**:
- `AiProvider` interface is defined and extensible.
- Local Whisper provider produces caption annotations from an audio file.
- Provider errors (missing binary, timeout) are handled gracefully.
- Annotations conform to the project model's `AIAnnotation` type.

**Risks**:
- [HIGH-RISK] Whisper binary bundling and cross-platform compatibility. whisper.cpp builds are platform-specific. May need to download on first use or bundle per platform.

---

#### 5B.2 Whisper Integration (Auto-Captions)

**Package**: `@rough-cut/ai-bridge`, `apps/desktop`
**Effort**: 3-4 days
**Dependencies**: 5B.1

**Tasks**:
1. Implement audio extraction from video assets: use FFmpeg to extract audio track to WAV (16kHz mono, Whisper's expected format).
2. Implement Whisper invocation: spawn the whisper binary with the audio file, capture JSON output with word-level timestamps.
3. Implement streaming progress: parse whisper stderr for progress updates, report to the UI.
4. Implement annotation post-processing: convert word timestamps to frame numbers at project FPS, group words into sentence-level captions with configurable grouping (by pause duration or max words).
5. Wire the IPC handlers: `ai.analyze-captions` channel that triggers the pipeline and streams results back to the renderer.
6. Test with real audio: verify caption accuracy and timing on a 2-minute test recording.

**Done criteria**:
- Captions are generated from a video/audio asset.
- Word-level timestamps are accurate within 1 frame.
- Progress is reported during analysis.
- Analysis can be cancelled mid-process.

---

#### 5B.3 Smart Zoom Analysis

**Package**: `@rough-cut/ai-bridge`
**Effort**: 3-4 days
**Dependencies**: 5B.1

**Tasks**:
1. Implement frame sampling: extract frames at 2-5fps from the source video via FFmpeg (not every frame -- performance optimization).
2. Implement cursor/mouse movement detection: analyze frame differences to identify regions of activity. Use simple heuristics -- large cursor movements, clicks (if cursor click highlighting is detectable), pauses after movement.
3. Implement zoom suggestion generation: for each detected point of interest, create a `ZoomAnnotation` with `centerX`, `centerY`, `scale`, `durationFrames`. Use heuristics for scale (zoom closer for small UI elements, less zoom for large movements).
4. Implement confidence scoring: assign a confidence score based on movement magnitude, pause duration, and click detection certainty.
5. Wire IPC handlers: `ai.analyze-zoom` channel.
6. Test with a screen recording containing known cursor interactions.

**Done criteria**:
- Zoom suggestions are generated for a screen recording.
- Suggestions identify regions of cursor activity.
- Confidence scores differentiate strong and weak suggestions.
- Analysis completes within 2x real-time for a 5-minute recording.

---

#### 5B.4 AI Tab UI

**Package**: `@rough-cut/ui` (components/ai/)
**Effort**: 4-5 days
**Dependencies**: 3.1, 5B.2, 5B.3

**Tasks**:
1. Implement `AiTab` container with the layout from the MVP spec: top toolbar (feature selector, provider picker), left panel (source selector + preview), right panel (results list).
2. Implement `FeatureSelector`: toggle between Auto-Captions and Smart Zoom views.
3. Implement `SourceSelector`: list project assets valid for the selected feature. Checkboxes for multi-select.
4. Implement `AnalyzeButton`: triggers analysis, shows progress bar during processing.
5. Implement `CaptionResultsList`: scrollable list of caption annotations. Each entry shows timestamp, text, and Accept/Reject/Edit buttons. Edit opens an inline text editor.
6. Implement `ZoomResultsList`: scrollable list of zoom annotations. Each entry shows timestamp, target region, scale, duration. Accept/Reject/Edit. Edit opens sliders for scale/center/duration.
7. Implement annotation preview: a small PixiJS preview that seeks the source asset to the selected annotation's timestamp. For zoom suggestions, overlay the zoom region rectangle.
8. Implement "Accept All" and "Reject All" bulk actions.
9. Implement "Apply Accepted to Timeline": converts accepted caption annotations to subtitle effects on corresponding clips, converts accepted zoom annotations to zoom effects with keyframes. Uses store actions.
10. Write component tests: annotation list renders correctly, accept/reject updates status, apply creates correct effects in store.

**Done criteria**:
- User can analyze assets for captions and zoom suggestions.
- Results are displayed with accept/reject/edit controls.
- Applying accepted annotations creates correct effects on the timeline.
- Applied effects render correctly in preview and export.

---

### Track 5C: Export Tab

#### 5C.1 Export Pipeline Integration

**Package**: `@rough-cut/export-renderer`, `apps/desktop`
**Effort**: 3-4 days
**Dependencies**: 2.2

**Tasks**:
1. Wire the export pipeline to the Electron main process: `export.start` IPC handler creates an `ExportPipeline` instance, runs it in a background thread or `utilityProcess`.
2. Implement FFmpeg binary resolution: locate the bundled FFmpeg binary per platform. Verify it's executable.
3. Implement export settings validation: resolution must be even numbers, FPS must be positive, output path must be writable, codec must be supported.
4. Implement progress relay: export pipeline emits progress events, main process relays via IPC to the renderer.
5. Implement cancel: `export.cancel` IPC handler calls `pipeline.abort()`, kills FFmpeg, cleans up partial files.
6. Implement completion: on success, `export.complete` event with the output file path. On failure, `export.error` with an error message.
7. Test end-to-end: create a project with clips and effects, trigger export, verify output MP4.

**Done criteria**:
- Export can be triggered from the renderer via IPC.
- Export runs in the background without blocking the UI.
- Progress is reported accurately.
- Cancel works cleanly.
- Output MP4 is valid and matches the project composition.

---

#### 5C.2 Export Tab UI

**Package**: `@rough-cut/ui` (components/export/)
**Effort**: 3-4 days
**Dependencies**: 3.1, 5C.1

**Tasks**:
1. Implement `ExportTab` container with the layout from the MVP spec: left panel (settings), right panel (queue), bottom (output preview).
2. Implement `ExportPresets` dropdown: YouTube 1080p, YouTube 4K, Twitter/X, Instagram, Custom. Selecting a preset auto-fills settings.
3. Implement `ExportSettings` panel: resolution fields (linked aspect ratio), FPS dropdown, codec selector (H.264 only for v1), quality dropdown (Low/Medium/High/Lossless mapping to CRF values), audio codec and bitrate.
4. Implement output path selector: text field + Browse button that opens a native save dialog.
5. Implement estimated file size and render time display (calculated from bitrate * duration, and a brief benchmark of rendering a few frames).
6. Implement "Export Now" and "Add to Queue" buttons.
7. Write component tests: preset selection populates fields, settings validation catches invalid values.

**Done criteria**:
- Settings panel populates correctly from presets.
- All settings fields are validated.
- Export Now triggers the pipeline and shows progress.

---

#### 5C.3 Export Queue

**Package**: `@rough-cut/ui` (components/export/), `@rough-cut/store`
**Effort**: 2-3 days
**Dependencies**: 5C.2

**Tasks**:
1. Implement `exportStore`: job management with `addJob()`, `startNext()`, `cancelJob()`, `getJobs()`. Each job has: id, settings, status (queued/processing/complete/failed), progress.
2. Implement `ExportQueue` component: list of jobs with status, progress bar (for processing job), frame counter, ETA. Complete jobs show "Open File" / "Open Folder" links. Failed jobs show error and "Retry".
3. Implement sequential processing: when a job completes, automatically start the next queued job.
4. Implement live thumbnail: during export, show the current frame being rendered as a thumbnail in the job card (optional -- depends on performance impact).
5. Test queue behavior: add 3 jobs, verify sequential processing, cancel mid-job, verify next job starts.

**Done criteria**:
- Multiple export jobs can be queued.
- Jobs process sequentially.
- Progress, completion, and failure states display correctly.
- Cancel works for any job in the queue.

---

### Phase 5 Done Criteria

- [ ] Motion tab: 8 templates browsable, customizable, and applicable to timeline.
- [ ] AI tab: captions generated from audio, zoom suggestions generated from video, both applyable to timeline.
- [ ] Export tab: MP4 export with presets, queue, progress, and cancel.
- [ ] All 5 tabs are functional.
- [ ] Demo D4 is achievable.

### Phase 5 Risks

- [HIGH-RISK] Whisper binary bundling and availability. If local Whisper is too complex to bundle, fall back to cloud-only for v1.
- Smart Zoom heuristics may produce low-quality suggestions. Acceptable for v1 if the user can easily accept/reject.
- Template rendering complexity. 8 templates is a significant content creation effort.

### Phase 5 Parallelization

The three tracks (5A, 5B, 5C) are largely independent and can be built in parallel:

```
Track 5A (Motion):  5A.1 ──▶ 5A.2 ──▶ 5A.3
Track 5B (AI):      5B.1 ──▶ 5B.2 ──┐
                              5B.3 ──┼──▶ 5B.4
Track 5C (Export):  5C.1 ──▶ 5C.2 ──▶ 5C.3
```

5B.2 (captions) and 5B.3 (zoom) can be built in parallel within the AI track.

---

## Phase 6: Integration + Polish

**Goal**: Cross-cutting concerns, edge cases, performance, and final quality pass. This phase hardens the product for release.

**Entry criteria**: Phase 5 complete (all 5 tabs functional).

**Time budget**: 2-3 weeks.

### 6.1 Project Save/Load

**Effort**: 3-4 days
**Dependencies**: All phases

**Tasks**:
1. Implement `file.save` IPC handler: serialize the project store to JSON, write to a `.roughcut` file. Include `CURRENT_SCHEMA_VERSION` in the output.
2. Implement `file.load` IPC handler: read `.roughcut` file, run through `migrate()` pipeline, validate with `validateProject()`, load into store.
3. Implement asset path resolution: store asset paths as relative to the project file. Resolve to absolute on load.
4. Implement autosave: save every 60 seconds to a `.roughcut.autosave` file. Detect autosave on launch and offer recovery.
5. Implement "Save As": native save dialog, copy project file and update paths.
6. Implement recent projects list: stored in app settings (`electron-store` or similar). Show on a home screen or in the File menu.
7. Implement unsaved changes detection: track dirty state, prompt on close/quit.
8. Handle edge cases: corrupted project file (graceful error + offer autosave recovery), missing media files (relink dialog), project file from a future version (error message).

**Done criteria**:
- Projects save and load correctly with all data intact.
- Autosave runs and recovery works.
- Missing media prompts for relinking.
- Corrupted files are handled gracefully.

---

### 6.2 Keyboard Shortcuts

**Effort**: 2-3 days
**Dependencies**: Phase 4

**Tasks**:
1. Implement global shortcut system: register shortcuts with actions, handle conflicts between tabs.
2. Wire all shortcuts from the MVP spec: Ctrl/Cmd+Z (undo), Ctrl/Cmd+Shift+Z (redo), Ctrl/Cmd+S (save), Space (play/pause), S (split), Delete/Backspace (delete), Ctrl/Cmd+E (export).
3. Implement J/K/L scrubbing in the Edit tab.
4. Implement I/O for in/out point marking (stretch goal).
5. Implement arrow keys for playhead navigation (left/right by frame, Shift+arrow by 10 frames).
6. Show shortcut hints in tooltips on toolbar buttons.
7. Handle keyboard focus correctly: shortcuts should only fire when the appropriate panel/tab has focus. Prevent shortcuts from firing during text input.

**Done criteria**:
- All shortcuts from the MVP spec are functional.
- Shortcuts don't fire during text input.
- Tooltips show shortcut hints.

---

### 6.3 Cross-Platform Testing

**Effort**: 3-5 days
**Dependencies**: All phases

**Tasks**:
1. Build and test on Linux (primary development platform): full test pass.
2. Build and test on macOS (if available): recording with TCC permissions, preview rendering, export, file I/O.
3. Build and test on Windows (if available): recording with DXGI, all tabs, file paths with backslashes.
4. Document platform-specific issues with workarounds or "known limitation" labels.
5. Verify FFmpeg binary works on each platform.
6. Verify native dialogs (file picker, save dialog) work on each platform.
7. Verify keyboard shortcuts (Ctrl vs. Cmd) work correctly per platform.

**Done criteria**:
- App builds and runs on all target platforms.
- Recording works on all platforms (with documented limitations from Spike 0.2).
- Platform-specific issues are documented.

---

### 6.4 Performance Profiling + Optimization

**Effort**: 3-5 days
**Dependencies**: All phases

**Tasks**:
1. Profile preview playback on weakest target hardware (integrated GPU laptop): identify frame budget overruns using Chrome DevTools Performance panel and PixiJS stats overlay.
2. Profile timeline rendering with 50+ clips: identify re-render storms, unnecessary React updates.
3. Profile memory usage during a full session: record → edit (add effects, keyframes) → export. Track heap growth, texture cache size, undo history size.
4. Optimize the top 3 bottlenecks identified in profiling.
5. Implement performance budgets in CI: preview render time per frame < 33ms (30fps target), timeline re-render < 16ms, store action dispatch < 5ms.
6. Implement memory budget system: LRU eviction for texture cache, undo history cap (100 entries), lazy thumbnail/waveform generation.
7. Test on an 8GB system: verify total RAM usage stays under 1.5GB during normal operation.

**Done criteria**:
- Preview sustains 30fps on target hardware.
- Timeline renders smoothly with 50+ clips.
- Memory usage stays under 1.5GB on an 8GB system.
- Top 3 bottlenecks are resolved.

---

### 6.5 Error Handling + Edge Cases

**Effort**: 2-3 days
**Dependencies**: All phases

**Tasks**:
1. Implement toast notification system for recoverable errors.
2. Implement error boundaries in React for crash recovery.
3. Handle all edge cases from the RISKS doc: crash recovery for partial WebM files, source media moved/deleted (relink dialog), disk space exhaustion during recording, audio device changes mid-recording, very long recordings (2+ hours), empty timeline export prevention, corrupted project file recovery, app update during active project.
4. Implement graceful degradation: if FFmpeg is not found, disable export with a clear message. If webcam is unavailable, disable webcam toggle.
5. Write tests for edge cases.

**Done criteria**:
- All edge cases from the RISKS doc are handled.
- Error messages are clear and actionable.
- No silent failures -- every error is surfaced to the user.

---

### 6.6 Final Integration Test

**Effort**: 2-3 days
**Dependencies**: 6.1-6.5

**Tasks**:
1. Full end-to-end workflow test: create a new project → record screen with webcam and audio → switch to Edit tab → trim, split, add effects (zoom, blur, rounded corners), add a transition → switch to Motion tab → add a lower third template → switch to AI tab → generate captions → apply accepted captions → switch to Export tab → export as YouTube 1080p preset → verify output MP4.
2. Save the project. Close the app. Reopen. Load the project. Verify all state is preserved.
3. Test undo/redo across the entire editing session (50+ operations).
4. Verify preview/export parity on the final composition.
5. Performance check: the full workflow should not reveal new performance issues.
6. Document any remaining issues as known limitations for v1.

**Done criteria**:
- Full end-to-end workflow completes without errors.
- Project save/load round-trips perfectly.
- Preview matches export output.
- Performance is within budget.
- Known limitations are documented.

---

### Phase 6 Done Criteria

- [ ] Projects save, load, and autosave correctly.
- [ ] All keyboard shortcuts work.
- [ ] App runs on all target platforms.
- [ ] Performance is within budget on target hardware.
- [ ] Edge cases are handled gracefully.
- [ ] Full end-to-end integration test passes.

### Phase 6 Parallelization

```
6.1 (Save/load) ──────────┐
6.2 (Keyboard shortcuts) ──┤
6.3 (Cross-platform) ──────┼──▶ 6.6 (Final integration)
6.4 (Performance) ─────────┤
6.5 (Error handling) ──────┘
```

Tasks 6.1-6.5 can all proceed in parallel. 6.6 is the final gate that depends on all of them.

---

## Effort Summary

| Phase | Estimated Duration | Parallel Tracks |
|-------|-------------------|-----------------|
| Phase 0: Spikes | 1-2 weeks | 3 spikes, partially parallel |
| Phase 1: Foundation | 2-3 weeks | 2 parallel after project-model |
| Phase 2: Core Rendering | 2-3 weeks | 2 parallel (preview + export) |
| Phase 3: Electron + Record | 2-3 weeks | 2 parallel initially |
| Phase 4: Edit Tab | 3-4 weeks | 3 parallel after timeline UI |
| Phase 5: Motion + AI + Export | 3-4 weeks | 3 fully parallel tracks |
| Phase 6: Integration + Polish | 2-3 weeks | 5 parallel, then final gate |
| **Total (sequential)** | **15-22 weeks** | |
| **Total (with parallelization, 2 devs)** | **~12-16 weeks** | |

---

## Validation Summary

Tasks marked [VALIDATION] confirm architecture assumptions:

| Task | What It Validates |
|------|-------------------|
| Spike 0.1 | Frame decoding latency determines preview strategy |
| Spike 0.2 | Per-platform recording capabilities determine capture backend |
| Spike 0.3 | Store performance determines state architecture |
| 2.1 task 3 | Video texture loading validates Spike 0.1 findings in production |
| 2.3 | Preview/export parity validates the dual-pipeline architecture |
| 3.5 | Record → Asset → Preview flow validates the end-to-end data path |
| 4.7 | Full editing workflow validates the editing architecture |

## High-Risk Items Summary

| Item | Phase | Risk | Mitigation |
|------|-------|------|------------|
| Frame decoding latency | 0, 2 | Preview may not hit 16ms per frame | LRU cache, two-tier quality, Spike 0.1 findings |
| Platform recording | 0, 3 | Wayland, macOS system audio, DXGI quirks | CaptureBackend interface, per-platform backends |
| PixiJS video compositing | 2 | GPU contention on integrated GPUs | OffscreenCanvas, quality degradation during scrub |
| Timeline UI performance | 4 | Thumbnail/waveform rendering with many clips | Virtual scrolling, lazy generation, LRU cache |
| FFmpeg bundling | 2, 5C | Cross-platform binary resolution, GPL/LGPL | Per-platform static LGPL builds, path abstraction |
| Whisper bundling | 5B | Platform-specific binaries, model download | Cloud fallback, download on first use |
| Preview/export mismatch | 2, 4 | Visual differences between WebGL and Canvas2D | Shared effect math, golden-image parity tests in CI |

---

*Last updated: 2026-03-25*
