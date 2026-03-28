---
id: record-tab-development
name: Record Tab Development Guide
description: Complete architectural context for building features in the Rough Cut Record tab — inspector categories, layout patterns, store wiring, effect pipeline, and industry reference from Focusee/Screen Studio
source: conversation
triggers:
  - "record tab"
  - "record inspector"
  - "record category"
  - "recording sidebar"
  - "add recording feature"
  - "background panel"
  - "highlights panel"
  - "titles panel"
  - "RecordRightPanel"
  - "RecordTab"
  - "presentation events"
quality: high
---

# Record Tab Development Guide

## Canonical Documents (MUST READ BEFORE ANY WORK)

Before making any change to the Record tab, re-read these files — they are the project constitution:

- **`.claude/CLAUDE.md`** — Project rules, architecture principles, coding conventions, package boundaries, what NOT to do. Every decision must be checked against this.
- **`docs/ARCHITECTURE.md`** — Module boundaries, lifecycle seam checklist, effect system design, preview vs export pipeline separation.
- **`docs/MVP_SPEC.md`** — Feature specifications, data model details, tab responsibilities. Lines 100-206 define Record tab features and sidebar controls.
- **`docs/RISKS_AND_PLAN.md`** — Known risks, phase plan, what's deferred.
- **`docs/SPIKES_PHASE0.md`** — Phase 0 spike results and learnings.

**Rule from CLAUDE.md:** If a request conflicts with these docs, STOP and explain the conflict instead of silently following the request.

## Big Picture: How Rough Cut Works

Rough Cut is a desktop screen recording + editing studio. Five tabs, each with a specific responsibility:

| Tab | Creates/Reads | Never Touches |
|-----|--------------|---------------|
| **Record** | Creates Assets, writes presentation metadata | Timeline clips, track structure |
| **Edit** | Reads/writes Composition (tracks, clips) | Capture logic, asset creation |
| **Motion** | Reads/writes MotionPresets, clip keyframes | Capture, track structure |
| **AI** | Creates AIAnnotations, proposes edits | Direct clip mutation |
| **Export** | Reads entire ProjectDocument, writes output | Everything else |

**The ProjectDocument is the single source of truth.** Every subsystem reads from or writes to it. No subsystem communicates with another directly.

### Core Principles That Affect Record Tab Work

1. **UI does NOT own rendering logic.** The PreviewCompositor is a standalone class. React components don't contain rendering code.
2. **Frame-based, not time-based.** All temporal positions are integer frame numbers. Conversion to ms happens only at display layer.
3. **Recording produces assets + metadata, not clips.** Capture creates Asset entries. Timeline clips are a separate authoring concern created in the UI after recording stops.
4. **Effects are data, not code.** An EffectInstance is a bag of params. Rendering logic lives in EffectDefinition registry.
5. **Main process owns all I/O.** Recording, FFmpeg, file system — all in main. Renderer is pure UI + preview.
6. **Preview and Export are independent pipelines.** They share effect definitions and interpolation math but NOT rendering implementations.

### Package Boundaries (MUST enforce)

```
@rough-cut/project-model    → ZERO dependencies
@rough-cut/timeline-engine  → depends only on project-model
@rough-cut/effect-registry  → depends only on project-model
@rough-cut/preview-renderer → depends on project-model, effect-registry, pixi.js
@rough-cut/export-renderer  → depends on project-model, effect-registry. NO PixiJS.
@rough-cut/store            → depends on project-model, timeline-engine
apps/desktop                → wires everything together
```

**Hard rules:**
- `project-model` depends on NOTHING
- `preview-renderer` and `export-renderer` NEVER depend on each other
- `ui` NEVER imports from `preview-renderer` directly
- `store` NEVER imports from `ui`
- No circular dependencies

## The Insight

The Record tab is a **presentation layer**, not a structural editor. All features here are visual enhancements applied to recordings — zoom emphasis, cursor styling, click highlights, text overlays, background framing. These live on `Asset.presentation` (per-recording metadata) or as `EffectInstance[]` on clips. The Record tab never creates, splits, trims, or reorders clips — that's the Edit tab's job.

## Why This Matters

Adding features to the Record tab requires understanding three layers: (1) where data lives in the project model, (2) how the inspector UI is structured, (3) how effects reach the preview/export renderers. Getting any of these wrong causes architectural violations that the CLAUDE.md constitution explicitly prohibits.

## Architecture: Data Ownership

### Presentation data (zoom, cursor, highlights, titles)
- Lives on: `Asset.presentation: RecordingPresentation`
- Package: `@rough-cut/project-model`
- Store actions: `projectStore.getState().setRecordingAutoZoomIntensity(assetId, value)` etc.
- Pattern: Each category gets typed marker arrays + settings on the `RecordingPresentation` interface
- Types file: `packages/project-model/src/types.ts` (line ~64, `RecordingPresentation`)

### Visual framing (background, padding, corners, shadow)
- Lives on: `Clip.effects: EffectInstance[]` (applied at recording stop)
- During recording: ephemeral UI state (local `useState` or a `recordingStore`)
- At stop: translated into `EffectInstance[]` on the newly created clip
- Effects registered in: `packages/effect-registry/src/effects/`
- MVP spec reference: MVP_SPEC.md lines 160-164

### Project-level settings (background color, resolution)
- Lives on: `ProjectDocument.settings`
- Store action: `projectStore.getState().updateSettings({ resolution, backgroundColor })`
- Already working: resolution changes via template selection

## Architecture: Inspector UI Pattern

### InspectorShell (shared component)
- File: `apps/desktop/src/renderer/ui/InspectorShell.tsx`
- Pattern: icon rail (36px) + single active panel + category header with optional Reset
- DO NOT MODIFY this component when adding categories

### Adding a new Record inspector category

1. **Create the panel component**: `apps/desktop/src/renderer/features/record/Record[Name]Panel.tsx`
   - Props-driven, no direct store access
   - Uses shared controls: `ControlLabel`, `RcSlider`, `RcSelect`, `PillRadioRow`, `RcToggleButton`
   - Import from `../../ui/index.js`

2. **Add to categories array** in `RecordRightPanel.tsx`:
   ```tsx
   { id: 'your-id', label: 'Label', icon: <Icon />, onReset: handler, panel: <Panel ... /> }
   ```

3. **Icons**: 16×16 inline SVGs, stroke-based, single color
   - Active: `rgba(255,255,255,0.80)`
   - Inactive: `rgba(255,255,255,0.35)`

### Current categories (in order):
1. **Templates** — layout presets (aspect ratio + camera position), 2-column grid grouped by Landscape/Portrait/Square. Selection updates `project.settings.resolution` via `updateSettings`.
2. **Zoom** — auto intensity slider + markers lane. Data: `Asset.presentation.zoom`
3. **Cursor** — style pills, click effect, size, click sound. Data: `Asset.presentation.cursor`
4. **Highlights** — PLACEHOLDER ("Coming soon"). Needs: `HighlightPresentation` type + markers
5. **Titles** — PLACEHOLDER ("Coming soon"). Needs: `TitlePresentation` type + markers

### Missing categories (per Focusee/Screen Studio research):
- **Background/Canvas** — background fill (color/gradient/image), padding, corner radius, shadow. Both Focusee and Screen Studio have this. Highest priority gap.
- **Camera shape** — circle/rectangle + corner roundness for webcam overlay
- **Spotlight** — darkness layer outside focus area (Focusee has this)

## Architecture: Layout (LOCKED — do not modify)

### WorkspaceRow
- File: `apps/desktop/src/renderer/ui/WorkspaceRow.tsx`
- Owns all horizontal math: main content (flex: 1, minWidth: 0, overflow: hidden) + sidebar (fixed width)
- The main content div MUST have `overflow: hidden` — this is what prevents the sidebar from being clipped
- `data-testid="workspace-row"` for Playwright testing

### RecordTab structure
```
RecordScreenLayout (100vh, overflow: hidden)
  AppHeader
  ModeSelectorRow (padded wrapper)
  WorkspaceRow
    main → PreviewStage > PreviewCard > compositor canvas
    inspector → RecordRightPanel > InspectorShell
  RecordTimelineShell (full width, outside WorkspaceRow)
  ErrorBanner (conditional)
  BottomBar
```

### Key layout rules
- Timeline is OUTSIDE WorkspaceRow (spans full viewport width)
- Left column: `flex: 1 1 0%, minWidth: 0, overflow: hidden`
- Sidebar wrapper: explicit pixel `width`, `flexShrink: 0`
- `VerticalWorkspaceSplit` panes need `minWidth: 0, overflow: hidden`
- Never add `width: 100%` + `flexShrink: 0` on the same element inside a flex container

## Architecture: Preview Rendering (Layered Hybrid — from Recordly/Screen Studio research)

The preview uses a **3-layer hybrid approach** — NOT everything in PixiJS:

1. **Background layer** (CSS div) — gradient, wallpaper, solid color via CSS `background`. Independent of video.
2. **Video layer** (PixiJS canvas or `<video>`) — screen recording frames. PixiJS handles zoom transforms, motion blur. Canvas sits INSIDE a CSS wrapper that applies padding, border-radius, shadow, inset.
3. **Overlay layer** (HTML divs) — captions, webcam bubble, annotations. Absolutely positioned over video.

**Critical:** Background, padding, shadow, rounded corners are ALL CSS on wrapper divs. PixiJS only handles video content + zoom transforms. This is how Recordly and Screen Studio work.

**PreviewCard architecture:**
```
PreviewCard (outer, CSS aspectRatio from resolution)
  ├── Background div (position: absolute, inset: 0, background: gradient/color)
  │     └── Content frame div (inset: padding, borderRadius, boxShadow, border: inset)
  │           └── children (<video> or <canvas>, position: absolute, inset: 0)
  └── Empty state (when no source)
```

Source: [Recordly VideoPlayback.tsx](https://github.com/webadderall/Recordly/blob/main/src/components/video-editor/VideoPlayback.tsx) — AGPL-3.0, reference only, do not copy code.

## Architecture: Effect Pipeline

### Adding a new effect type

1. **Define in effect-registry**: `packages/effect-registry/src/effects/[name].ts`
   ```ts
   export const [name]Effect: EffectDefinition = {
     type: '[name]',
     displayName: 'Display Name',
     category: 'stylize', // or 'blur', 'color', 'transform', 'motion'
     params: { paramName: { type: 'number', default: 0, min: 0, max: 100 } },
   };
   ```

2. **Register**: `packages/effect-registry/src/effects/index.ts` → add to `registerBuiltinEffects()`

3. **Preview render**: `packages/preview-renderer/src/preview-compositor.ts` → handle in `renderLayer()`
   - Uses PixiJS filters/sprites
   - Currently renders placeholders only (no real effect rendering yet)

4. **Export render**: `packages/export-renderer/src/frame-renderer.ts` → handle in render pipeline
   - Uses Canvas2D
   - `round-corners` already has a Canvas2D implementation here

### Current effects:
- `zoom-pan` (category: transform)
- `round-corners` (category: stylize) — has Canvas2D export impl
- `gaussian-blur` (category: blur)
- Missing: `shadow`, `background-pad`, `subtitle`

## Store Patterns

### Project store actions
- File: `packages/store/src/project-store.ts`
- All actions go through `updateProject(fn)` for automatic undo via zundo
- Selectors in `packages/store/src/selectors.ts`
- Test file: `packages/store/src/project-store.test.ts` — follow existing `describe/it` pattern

### Missing store actions needed:
- `addClipEffect(trackId, clipId, effect)`
- `updateClipEffect(trackId, clipId, effectId, patch)`
- `removeClipEffect(trackId, clipId, effectId)`
- Highlight/title marker CRUD actions

## Industry Reference: Focusee & Screen Studio (Detailed)

### Focusee — Full Sidebar Breakdown

**Editor structure:** Left sidebar for all settings, central preview, timeline below.

**Sidebar categories (icon-based tab switching):**

1. **Video Enhancement (Canvas/Background)**
   - Four aspect ratio presets: 16:9, 4:3, 1:1, 9:16
   - Dropdown labeling which platform each ratio is best for (YouTube, TikTok, etc.)
   - Padding control (inset the recording within the canvas)
   - Corner roundness slider
   - Shadow toggle + controls
   - Background library: macOS-style gradient presets + custom image upload
   - This is the most feature-rich panel

2. **Cursor**
   - Mouse cursor style selection
   - Click effect options (ripple, highlight ring, etc.)
   - Cursor size adjustment
   - Click sound toggle

3. **Camera (Layout Selector)**
   - Six predefined camera layout options, split by canvas orientation
   - Horizontal canvases: camera above screen, camera behind/overlaid, side-by-side
   - Vertical canvases: camera centered over screen in vertical sequence
   - Layouts shown as **small thumbnail icons** (schematic previews, ~60-80px each, 3 per row)
   - Each layout can be flipped horizontally
   - "Adjust Layout" button opens custom drag-and-drop repositioning
   - Camera shape: circle or rectangle with adjustable corner roundness

4. **Crop** — crop the recording area
5. **Clip** — basic trimming
6. **Zoom** — zoom emphasis with markers
7. **Spotlight** — darkness layer outside focus area with adjustable shape

**Recording Presets (whole-project bundles):**
- Saved via "Preset" button in upper-right corner
- A preset bundles: canvas ratio + background, mouse style, click effects, camera layout, watermark
- Named text list (not visual thumbnails)
- Can rename, delete, set as default, or apply

**Sources:** [FocuSee Camera Layout Guide](https://focusee.imobie.com/guide/camera-layout.htm), [FocuSee Recording Preset Guide](https://focusee.imobie.com/guide/recording-preset.htm), [FocuSee Edit Guide](https://focusee.imobie.com/guide/edit-the-recording.htm)

---

### Screen Studio — Full Sidebar Breakdown

**Editor structure:** Right-panel-dominant. Video preview on left/center, all controls in right sidebar.

**Aspect ratio selector (ABOVE the canvas, not in sidebar):**
- Six labeled buttons in a segmented control: Auto, Wide (16:9), Vertical (9:16), Square (1:1), Classic (4:3), Tall (3:4)
- Most prominent and accessible UI element in the editor

**Right sidebar sections:**

1. **Background and Screen**
   - Four background types: Wallpaper (macOS native + curated), Gradient, Color (hex input), Image (upload)
   - Wallpaper options shown as small grid of thumbnails
   - Padding slider (inset recording within canvas)
   - Rounded corners slider
   - Shadow controls (blur, offset, color)

2. **Camera (Dynamic Layouts — added v3.0, Dec 2024)**
   - Accessed via "Layouts timeline" below main timeline (per-segment)
   - Also in right sidebar via "Camera" section
   - Layout modes per segment: Fullscreen (camera fills frame), Default (PIP overlay), Hidden
   - Camera position: four corner presets only (no free drag)
   - Camera shape: adjustable roundness (square to circular)
   - Camera can mirror, resize, auto-shrink during zoom
   - No split-screen/side-by-side option

3. **Zoom** — auto zoom with intensity control

4. **Cursor** — click effects, styling

**Presets:** Named dropdown list, bundles all editor settings. No visual thumbnails.

**Sources:** [Screen Studio Aspect Ratio](https://screen.studio/guide/aspect-ratio), [Screen Studio Background](https://screen.studio/guide/background), [Screen Studio Dynamic Camera Layouts](https://screen.studio/guide/dynamic-camera-layouts-), [Screen Studio 3.0 Release](https://alternativeto.net/news/2024/12/screen-studio-3-0-launched-with-shareable-links-dynamic-layouts-command-menu-and-more/)

---

### Other Apps

**Tella:** Layouts via sidebar list (12+ options). Layouts depend on clip type. Crop: 16:9, 1:1, Custom. Elements can be moved/resized within layout.

**Loom:** Minimal — three mode toggles (Screen+Camera, Screen Only, Camera Only). Camera is always a bubble. No post-recording layout presets.

---

### Feature Parity Matrix: Us vs Industry

| Feature | Rough Cut | Focusee | Screen Studio |
|---------|-----------|---------|---------------|
| Templates/Layouts | ✅ 8 presets | ✅ 6 presets | ✅ 3 modes + timeline |
| Aspect ratios | ✅ via templates | ✅ 4 presets + dropdown | ✅ 6 presets |
| Zoom | ✅ intensity + markers | ✅ | ✅ auto |
| Cursor | ✅ style, click, size, sound | ✅ | ✅ |
| **Background/Canvas** | ❌ MISSING | ✅ full (gradient, image, color) | ✅ full (wallpaper, gradient, color, image) |
| **Padding** | ❌ MISSING | ✅ slider | ✅ slider |
| **Corner radius** | ❌ UI missing (effect exists) | ✅ slider | ✅ slider |
| **Shadow** | ❌ MISSING | ✅ | ✅ |
| **Camera shape** | ❌ | ✅ circle/rect + roundness | ✅ roundness |
| **Spotlight** | ❌ | ✅ | ❌ |
| Highlights | placeholder | ✅ click highlights | ❌ |
| Titles | placeholder | ❌ | ❌ |
| Captions | ❌ (AI tab future) | ❌ | ✅ auto-transcription |
| Presets (saved bundles) | ❌ | ✅ | ✅ |

### Priority order based on industry parity:
1. **Background/Canvas** — both competitors have it, biggest visual impact
2. **Highlights** — Focusee has it, key for professional recordings
3. **Titles** — neither competitor has it in sidebar (Rough Cut differentiator)
4. **Camera shape** — both have it, expected feature
5. **Spotlight** — only Focusee, nice-to-have
6. **Saved presets** — both have it, quality-of-life feature

### Background/Wallpaper Selector — Visual Design Reference (from Recordly/Screen Studio)

The background picker UI follows a specific pattern used by Screen Studio and Recordly:

**Tab switcher:**
- 3-tab pill-style toggle: Gradient / Color / Image
- Active tab: accent-colored background (we use #ff6b5a)
- Container: rounded border, subtle dark background
- Height ~28px, grid layout (3 equal columns)

**Tile grid (shared by gradients and colors):**
- 6-column grid (we use 6; Recordly uses 8 but their panel is wider)
- Square aspect ratio tiles (`aspect-ratio: 1`)
- Rounded corners (8px)
- Gap: 3px between tiles
- Selected tile: accent border (2px solid #ff6b5a) + subtle scale(1.05) + glow shadow
- Unselected: thin border (1px solid rgba(255,255,255,0.08))
- No checkmarks — selection indicated purely by border color

**Gradient presets:**
- 24 CSS `linear-gradient` strings, pre-rendered as tile backgrounds
- Organized in rows: dark/moody → cool blues → vibrant → soft/warm
- All 135deg angle for consistency
- Source: curated from uiGradients (MIT license)

**Solid colors:**
- Same tile grid, 24 dark color presets
- Includes dark blacks, navy blues, deep purples, forest greens

**Image section:**
- Dashed border drop zone with upload icon
- Support for user image upload (stores as project asset, main process handles I/O)
- Wallpaper images can be AI-generated or sourced from Unsplash (free commercial license)

**Framing controls (below the grid):**
- Padding slider (0-200px, step 5)
- Corner radius slider (0-40px)
- Shadow toggle + blur slider (0-50px when enabled)
- All use ControlLabel + RcSlider pattern

## Design Tokens (from tokens.ts)
```
RECORD_PANEL_WIDTH = 260
CARD_GAP = 12
CARD_RADIUS = 16
ACCENT_COLOR = '#ff6b5a'
TEXT_SECONDARY = rgba(255,255,255,0.68)
TEXT_TERTIARY = rgba(255,255,255,0.55)
BG_CARD = rgba(0,0,0,0.75)
BG_CARD_HEADER = rgba(0,0,0,0.9)
BG_CONTROL = rgba(255,255,255,0.05)
```

## What Can Go Wrong (Lessons Learned)

### Layout regressions
- **Never rewrite working layout code for aesthetics.** The WorkspaceRow was rewritten from a working 2-div pattern to a "cleaner" 3-column pattern, which broke vertical scrolling. Always commit working layout immediately.
- **Playwright browser ≠ Electron.** Tests pass in Playwright MCP browser but fail in real Electron due to canvas intrinsic sizes, DevTools docking, and `min-width: auto` propagation. Use `tests/electron/debug-layout.mjs` for real verification.
- **The left column MUST have `overflow: hidden`.** Without it, content with intrinsic width (PixiJS canvas at 1920px, timeline tracks) forces the flex item wider than available space, pushing the sidebar off-screen.

### Store/model violations
- **Don't add runtime deps to `project-model`.** It's types, schemas, factories, and migrations only. Pure data.
- **Don't put presentation logic in components.** All mutations go through store actions. Components are props-in, callbacks-out.
- **Sidebar values during recording are NOT project model data.** They're ephemeral UI state. Only the resulting EffectInstances written to clips at stop-time enter the project model.

### Effect system
- **Don't hardcode effect logic in renderers.** Use the registry pattern. Define the effect in `effect-registry`, implement rendering separately in `preview-renderer` (PixiJS) and `export-renderer` (Canvas2D).
- **Don't share rendering code between preview and export.** They're fundamentally different pipelines. They share only type definitions and interpolation math.

## Testing

### Playwright Electron test
- Script: `tests/electron/debug-layout.mjs`
- Launches real Electron app, measures DOM elements
- Key assertion: `aside.right <= window.innerWidth` (no sidebar clipping)
- Run: `node tests/electron/debug-layout.mjs`

### Store tests
- `pnpm -F @rough-cut/store test` — 58 tests
- Pattern: `createProjectStore()`, call action, assert state, test undo

### Model tests
- `pnpm -F @rough-cut/project-model test` — factory + schema validation tests
