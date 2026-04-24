# Rough Cut — Project Constitution

## MANDATORY: Visual Verification Before Claiming "Fixed"

**No agent or instance may claim that a bug is fixed, a feature works, or a UI change is correct without visually verifying it first.** This means launching the app (`pnpm dev`), navigating to the relevant screen, and confirming the fix with your own eyes (via Playwright MCP screenshot, or by asking the user to confirm). Reading code alone is NOT sufficient — if you can't see it, you can't call it done.

---

## MANDATORY: Source Aspect Ratio Is Sacred

Every media frame rect produced by the layout system MUST match the source recording's aspect ratio. If the source is 16:9, every frame is 16:9. The layout controls WHERE and HOW BIG the frame is, never its SHAPE.

- Frame height is ALWAYS `width / sourceAspect` — no exceptions
- NEVER use `object-fit: contain` or `object-fit: cover` on video/canvas elements
- NEVER add letterboxing, pillarboxing, or dark-background gap-filling
- If a frame doesn't match the source, the LAYOUT function is wrong
- Templates arrange 16:9 blocks. They do not reshape them.

## MANDATORY: Template Layout Architecture Rules

These rules govern the preview rendering system and must never be violated:

### Card vs Frame distinction
- **Card shape** = determined by the TEMPLATE aspect ratio (16:9, 9:16, 1:1, 4:3)
- **Frame shapes inside** = determined by the SOURCE recording (always 16:9 for screen recordings)
- Example: Social Vertical = 9:16 card containing two 16:9 frames stacked vertically

### Each video gets its own outline
- Selection borders and resize handles render INSIDE each MediaFrame, directly on the video edges
- NEVER create a shared outline around multiple videos or the entire card inner area
- CardChrome's inner padded div must be invisible (no border, no shadow, no borderRadius)

### PixiJS compositor rules
- Compositor canvas is always created at source resolution (1920x1080), NOT project.settings.resolution
- Canvas CSS uses `!important` to prevent PixiJS `renderer.resize()` from overwriting fill styles
- The canvas must fill its host frame: `position:absolute; inset:0; width:100%; height:100%`
- After `renderer.resize()`, PixiJS overwrites inline styles — CSS `!important` is the only reliable defense

### Layout functions
- All layout functions accept `sourceAspect` parameter and produce frames where `height = width / sourceAspect`
- Layout functions never know about media fitting — they produce correctly-shaped rects
- `getLayoutRects(kind, canvas, sourceAspect)` is the only entry point

## MANDATORY: Recording Owns Its Own Streams

Recorder code paths (screen, camera, mic, system audio) MUST acquire their own `MediaStream` via `getUserMedia` / `getDisplayMedia` at REC click. NEVER reuse tracks obtained for the preview.

- Preview streams are owned by UI `useEffect` lifecycles and may end, mute, or churn silently in response to React re-renders, panel show/hide, device selection changes, etc.
- At REC click, always call fresh `navigator.mediaDevices.getUserMedia({...})` using the stored device id. Mirror the preview's constraints so resolution/fps stay consistent.
- Do NOT `sourceTrack.clone()` from a preview stream. An ended source track clones to an ended track.
- If you find yourself reading a preview track ref inside a recorder-start path, stop and re-acquire instead.
- A non-null `MediaStream` object is NOT proof the track inside it is live. Check `track.readyState === 'live'` if you must, or just re-acquire.

This rule was learned the hard way: 2026-04-22, camera recordings silently returned no file because the recorder tried to clone the preview's sourceTrack, which had transitioned to `readyState === 'ended'` between preview setup and REC click.

---

## MANDATORY: Check Runtime Log Before Asking For Logs

Agents must treat `.logs/app-runtime.log` as the first place to inspect when diagnosing app behavior seen in the terminal.

- Check `.logs/app-runtime.log` before asking the user for terminal output
- Do not ask the user to paste logs from the terminal unless the needed output is missing from that file
- Prefer tailing or reading `.logs/app-runtime.log` directly from the workspace
- This file mirrors the Electron app runtime stream, including main-process output and renderer console forwarded through main

---

You are working on the Rough Cut project (desktop screen recording + editor).

Before doing anything else in this session, read and obey these docs (collectively called **"the pillars"**):

- .claude/CLAUDE.md
- docs/ARCHITECTURE.md
- docs/MVP_SPEC.md
- docs/RISKS_AND_NEXT_STEPS.md
- docs/SPIKE_PLAN.md
- docs/INVARIANTS.md
- docs/IMPLEMENTATION_PLAN.md
- docs/MASTER_PLAN.md

These files are the project constitution and the ultimate source of truth.
When the user says "pillars", "pillar files", or "the docs", they mean these files.

Rules for this and all future tasks in this repo:
- Always base your decisions on these docs.
- If my request ever conflicts with these docs, STOP and explain the conflict
  instead of silently following my request. Propose options that keep the docs
  and my request in sync.
- For any significant task (planning, spikes, new feature, refactor):
  1) Re‑summarize the relevant constraints from these docs in your own words.
  2) Propose a short plan.
  3) Only then write or modify code.
- Do NOT modify the docs above unless I explicitly ask.

For this session, your job is:
[describe clearly: e.g. “design and scaffold the three Phase 0 spikes” /
“implement the minimal Record tab vertical slice” / “refine the timeline engine API”].

## What This Is

Rough Cut is a desktop screen recording and editing studio built with Electron + React + TypeScript + PixiJS. It combines Screen Studio-style recording, a multi-channel timeline editor, programmable motion graphics, and AI-powered editing features.

## Tech Stack

- Runtime: Electron (main + renderer processes)
- UI: React 18+ with TypeScript (strict mode)
- Preview Rendering: PixiJS (GPU-accelerated compositor)
- Export Rendering: Custom frame-by-frame pipeline into FFmpeg
- State Management: TBD — Zustand + zundo + immer is the current recommendation, but not locked in until the first store slice proves the pattern
- Monorepo: Turborepo + pnpm workspaces
- Bundler: Vite (renderer), tsc (packages)
- Testing: Vitest
- Linting: ESLint + Prettier
- Validation: Zod (project model schemas)

## Architecture Principles (MUST follow)

1. **The project document is the single source of truth.** Every subsystem reads from or writes to the declarative ProjectDocument. No subsystem communicates with another directly — they go through the project model.

2. **UI does NOT own rendering logic.** Rendering logic (compositing, effects, frame decoding) lives outside React. The PreviewCompositor is a standalone class that subscribes to the store. A thin `PreviewCanvas` adapter component may host the canvas element and manage the compositor lifecycle, but it must not contain rendering logic itself.

3. **Preview and Export are fundamentally different pipelines.** Preview (PixiJS, real-time, renderer process) is optimized for interactive feedback — it may skip frames, use draft quality, and run at display refresh rate. Export (frame-by-frame, headless, main process) is optimized for correctness — it renders every frame at full quality, deterministically. They share the same EffectDefinition registry and keyframe interpolation math, but their rendering implementations are independent. Never try to reuse the preview renderer for export or vice versa.

4. **Frame-based, not time-based.** All internal temporal positions are integer frame numbers. Frame rate is a project-level constant. Conversion to seconds/milliseconds happens only at the display layer. This prevents floating-point drift and rounding bugs.

5. **The project document is inert data.** No methods, no classes, no circular references. It must serialize to/from JSON. This enables trivial undo/redo, save/load, IPC transport, and testing.

6. **Recording produces assets + metadata, not clips.** The capture system writes media files and creates Asset entries with probed metadata (duration, resolution, codec, frame count). Timeline clips are a separate authoring concern — the UI creates Clip entries on tracks by referencing assets. Capture never touches timeline logic; the timeline never touches capture logic.

7. **Effects are data, not code.** An EffectInstance in the project model is a bag of params keyed by effectType. Rendering logic lives in the EffectDefinition registry, never in the save file.

8. **Main process owns all I/O.** File system operations, FFmpeg spawning, recording, AI workers — all in main. The renderer is a pure UI + preview layer.

9. **Every effect is serializable and testable.** If you can't JSON.stringify() an effect's params and test its output in Vitest without a DOM, the design is wrong.

10. **Clean abstractions over quick hacks.** Prefer correct architecture even if it takes longer. This codebase must support years of growth.

## Package Boundaries (MUST enforce)

```
@rough-cut/project-model    -> ZERO dependencies. Types, schemas, factories, schema versioning + migrations.
@rough-cut/timeline-engine  -> Depends only on project-model. Pure functions.
@rough-cut/effect-registry  -> Depends only on project-model. Effect defs + interpolation.
@rough-cut/preview-renderer -> Depends on project-model, effect-registry, pixi.js
@rough-cut/export-renderer  -> Depends on project-model, effect-registry. NO PixiJS.
@rough-cut/store            -> Depends on project-model, timeline-engine. State lib TBD.
@rough-cut/ipc              -> Depends on project-model, electron.
@rough-cut/ai-bridge        -> Depends on project-model only.
@rough-cut/ui               -> Tab shell + shared components. Each tab owns its own submodules.
apps/desktop                -> Electron shell. Wires everything together.
```

**Hard rules:**

- `project-model` depends on NOTHING.
- `preview-renderer` and `export-renderer` NEVER depend on each other.
- `ui` NEVER imports from `preview-renderer` directly (use store + PreviewCanvas wrapper).
- Capture runs exclusively in main process.
- `store` NEVER imports from `ui`.
- No circular dependencies between packages (enforce in CI).

## Coding Conventions

### TypeScript

- Strict mode, no `any` (use `unknown` + type narrowing).
- Prefer interfaces for public API contracts, types for unions/intersections.
- All project model types defined in `@rough-cut/project-model`.
- Export types separately from runtime code.
- Use branded types for IDs: `type ClipId = string & { readonly __brand: 'ClipId' }`.

### React

- Functional components only.
- Prefer composition over prop drilling.
- Use Zustand selectors, not full-store subscriptions.
- No business logic in components — delegate to store actions.
- Timeline components must use virtualization (only render visible clips).

### State Management

- All mutations go through store actions (implementation TBD — Zustand recommended, not locked).
- Never mutate state directly — use immutable update patterns.
- Separate transport state (playhead, 30-60Hz) from project state (undo-able, lower frequency).
- Group compound mutations for undo/redo (e.g., drag produces one undo step).
- The store must be accessible outside React (for PreviewCompositor, IPC handlers).

### File Naming

- Components: `PascalCase.tsx` (e.g., `ClipInspector.tsx`)
- Logic modules: `kebab-case.ts` (e.g., `clip-operations.ts`)
- Test files: `*.test.ts` or `*.test.tsx` colocated with source
- Types-only files: `types.ts`

### IPC

- All IPC goes through the typed contract in `@rough-cut/ipc`.
- No raw `ipcRenderer.send()` or `ipcMain.on()` calls.
- Main-to-renderer events use typed event emitters.
- Large data (frames, buffers) use SharedArrayBuffer, not JSON serialization.

### Testing

- `timeline-engine`: extensive unit tests, property-based tests.
- `effect-registry`: unit tests for interpolation, golden-image tests for effects.
- `store`: unit tests for actions and selectors.
- `ui`: component tests with React Testing Library.
- `export`: integration tests verifying FFmpeg output with ffprobe.
- No testing of desktopCapturer in CI (mock-based only).

## Lifecycle Seam Checklist

When integrating any external subsystem (preview compositor, export pipeline, recording session, AI worker):

1. **Create in a mount effect**, store in a ref.
2. **Expose an explicit `ready` flag** — never infer readiness from mount order.
3. **Buffer incoming state until ready** — `setProject()` before `init()` must not crash.
4. **Flush buffered state once initialized** — apply pending project/frame after init completes.
5. **Wire store subscriptions only after readiness** — not during initial mount.
6. **Handle teardown cleanly** — dispose on unmount, ignore late callbacks via a `disposed` flag.

**Rule**: No store action should directly call into an external subsystem unless that subsystem has explicitly signaled readiness. Store updates may arrive before UI readiness — the bridge must queue or no-op until ready.

## Timeline UX Rules

- The same underlying timeline engine (`@rough-cut/timeline-engine`) is used in both Record and Edit views.
- On Record, the timeline is used only for presentation events (zoom keyframes, cursor highlights, shortcut titles, background/look presets) — no structural edits.
- On Edit, the timeline exposes full clip/track editing tools (clip CRUD, splitting, trimming, reordering, track management). Presentation events from Record are also editable here.
- Never expose structural editing operations (cut, split, trim, track management) in the Record view.

## What NOT To Do

- Don't put rendering logic in React components (thin canvas adapter is OK).
- Don't let AI-bridge mutate clips directly — AI writes metadata (marks, labels, suggested cuts) into the project model; mutations go through store/timeline-engine.
- Don't use time-based (ms) values in the project model.
- Don't add methods to project model types (keep them plain objects).
- Don't import PixiJS outside of `preview-renderer` package.
- Don't send video frame data over standard Electron IPC (use SharedArrayBuffer).
- Don't use `any` type.
- Don't write effects that can't be serialized to JSON.
- Don't use class inheritance for effects (use the registry pattern).
- Don't add runtime dependencies to `project-model`.
- Don't mix capture logic with timeline logic.
- Don't skip the effect registry and hardcode effect logic in renderers.

## App Workspaces (Tabs)

The app is organized into 5 workspaces, each a top-level tab:

| Tab | Purpose | Primary Model Concern |
|-----|---------|----------------------|
| **Record** | Capture screen, webcam, audio | Creates Assets |
| **Edit** | Timeline editing, clip arrangement | Reads/writes Composition (tracks, clips) |
| **Motion** | Animated templates, keyframes | Reads/writes MotionPresets, clip keyframes |
| **AI** | AI-powered suggestions | Creates AIAnnotations, proposes edits |
| **Export** | Render final output | Reads entire ProjectDocument, writes output |

`@rough-cut/ui` owns the tab shell (AppShell, TabBar, shared layout). Each tab owns its own submodule directory (`components/record/`, `components/edit/`, etc.) with tab-specific components, hooks, and local state.

## Project Model Quick Reference

```
ProjectDocument
+-- version: number                    ← schema version for migrations
+-- settings: { resolution, frameRate, backgroundColor, sampleRate }
+-- assets: Asset[] (media registry -- video, audio, image, recording)
+-- composition: Composition
|   +-- tracks: Track[] (video | audio, each with clips)
|   |   +-- clips: Clip[] (assetId, timeline in/out, source in/out, transform, effects, keyframes)
|   +-- transitions: Transition[] (between clips, with type, params, easing)
+-- motionPresets: MotionPreset[] (reusable animation templates)
+-- exportSettings: ExportSettings
```

All temporal values in frames. All IDs are UUIDs.

### Schema Versioning

The project model includes a `version` field from day one. The `@rough-cut/project-model` package exports:
- `CURRENT_SCHEMA_VERSION: number` — incremented on any breaking schema change
- `migrate(doc: unknown): ProjectDocument` — runs the migration chain to bring any older version to current
- Each migration is a pure function: `(v: N) => (v: N+1)`, tested independently
- Project load always runs through the migration pipeline before validation

## Commands

```bash
# Workspace-wide
pnpm install                              # Install all dependencies
pnpm build                                # Build all packages (via Turborepo)
pnpm test                                 # Run all tests
pnpm lint                                 # Lint all packages
pnpm format                               # Format all packages (Prettier)
pnpm typecheck                            # Type-check all packages
pnpm dev                                  # Start Electron in dev mode

# Per-package (scoped)
pnpm -F @rough-cut/project-model test     # Test a specific package
pnpm -F @rough-cut/timeline-engine test   # Test timeline engine
pnpm -F @rough-cut/effect-registry build  # Build effect registry
pnpm -F @rough-cut/ui lint                # Lint UI package
pnpm -F @rough-cut/store typecheck        # Type-check store
```
