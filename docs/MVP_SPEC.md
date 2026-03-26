# Rough Cut -- MVP Specification

## Overview

Rough Cut is a desktop screen recording and editing studio built on Electron + React + TypeScript. It combines Screen Studio-style recording with a multi-track timeline editor, programmable motion graphics, AI-assisted editing, and a frame-accurate export pipeline.

### Architecture Summary

The application is organized around a **declarative project model** that serves as the single source of truth. Two independent rendering pipelines consume this model:

- **Preview pipeline** (PixiJS): Real-time, GPU-accelerated rendering for interactive preview in the UI. Trades fidelity for speed -- may drop frames, approximate effects, or reduce resolution.
- **Export pipeline** (frame-by-frame + FFmpeg): Offline, deterministic rendering that processes every frame at full quality. Produces final MP4 output.

The UI never renders video content directly. It manipulates the project model; the preview pipeline reflects changes in real time. This separation ensures that what the user sees during editing matches what they get on export, because both pipelines interpret the same data.

### State Management

Zustand stores own the project model and UI state. Stores are modular -- one per domain (project, timeline, recording, export, AI). The project store holds the serializable `Project` and exposes actions that produce undo-able state transitions.

### Tab Structure

The app has 5 top-level tabs: **Record**, **Edit**, **Motion**, **AI**, **Export**. Each tab is a different *view* over the same shared project model — they are surfaces, not mini-apps. All tabs read from and write to the same `ProjectDocument`. A clip created in Record appears in Edit; an effect added in Edit is visible in Motion; an AI annotation applied in AI becomes a standard effect in Edit; Export reads the entire model to render final output. Each tab owns its own UI state (panel sizes, selection, local controls) but never its own copy of project data.

---

## Declarative Project Model Reference

```
Project
  schemaVersion: number          // incremented on breaking changes; migrate() pipeline brings old docs to current
  metadata: { name, createdAt, modifiedAt }
  settings: { fps: number, resolution: { width, height }, background: BackgroundConfig }
  compositions: Composition[]
  assets: Asset[]

Composition
  id, name
  tracks: Track[]
  duration: number (frames)

Track
  id, name, type: 'video' | 'audio'
  clips: Clip[]
  effects: Effect[]        // track-level effects
  muted: boolean
  locked: boolean

Clip
  id
  trackId: string
  assetId: string          // reference to Asset
  position: number         // start frame on timeline
  duration: number         // frames on timeline
  sourceIn: number         // in-point in source media (frames)
  sourceOut: number        // out-point in source media (frames)
  effects: Effect[]
  transitions: { in?: Transition, out?: Transition }

Effect
  id, type: string         // 'zoom', 'blur', 'color-correction', 'rounded-corners', 'shadow', 'background-pad', etc.
  enabled: boolean
  parameters: Record<string, any>
  keyframes: Keyframe[]

Keyframe
  frame: number            // absolute frame in composition
  value: any
  easing: EasingType       // 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'cubic-bezier'

Transition
  type: string             // 'crossfade', 'wipe', 'slide'
  duration: number         // frames
  parameters: Record<string, any>

Asset
  id
  type: 'screen-recording' | 'webcam' | 'audio' | 'image' | 'import'
  filePath: string
  duration: number         // frames
  metadata: { width?, height?, sampleRate?, channels?, codec? }

MotionTemplate
  id, name, category: string
  parameters: TemplateParameter[]  // { name, type, default, constraints }
  composition: Composition         // the template's internal composition
  thumbnail: string

AIAnnotation
  id
  type: 'caption' | 'zoom-suggestion' | 'cut-point' | 'highlight'
  sourceAssetId: string
  timeRange: { startFrame: number, endFrame: number }
  data: any                // type-specific payload
  status: 'pending' | 'accepted' | 'rejected'
  confidence: number
```

---

## Tab 1: Record

### 1.1 User Goal

The user wants to capture their screen activity -- a product demo, tutorial, or presentation -- with optional webcam overlay and audio narration. They expect the recording to look polished from the moment of capture: rounded corners on the screen, a styled background, a floating webcam bubble -- like Screen Studio, not a raw screen grab. After stopping, the recording should appear in their project ready for editing.

### 1.2 UI Layout

```
+---------------------------------------------------------------+
|  [Tab Bar: Record | Edit | Motion | AI | Export]              |
+---------------------------------------------------------------+
|                    TOP TOOLBAR                                 |
|  [Source Picker ▼] [Region ▼] [Webcam Toggle] [Mic ▼]        |
|  [System Audio Toggle] [Countdown: 3s ▼] [Settings Gear]     |
+---------------------------------------------------------------+
|                                                                |
|                     CENTER CANVAS                              |
|                                                                |
|    +-----------------------------------------------+          |
|    |                                               |          |
|    |         LIVE PREVIEW (PixiJS)                 |          |
|    |                                               |          |
|    |    Screen capture with background,            |          |
|    |    padding, rounded corners, shadow,          |          |
|    |    webcam bubble overlay                      |          |
|    |                                               |          |
|    +-----------------------------------------------+          |
|                                                                |
+---------------------------------------------------------------+
|                   BOTTOM CONTROLS                              |
|     [REC Button]  [Pause] [Stop]   00:00:00 elapsed           |
+---------------------------------------------------------------+
|  RIGHT SIDEBAR (collapsible)                                  |
|  -- Background: [color picker / gradient / image]             |
|  -- Padding: [slider 0-200px]                                 |
|  -- Corner Radius: [slider 0-40px]                            |
|  -- Shadow: [toggle, blur, offset, color]                     |
|  -- Webcam: [size, position preset, shape, border]            |
|  -- Audio Levels: [mic meter] [system meter]                  |
+---------------------------------------------------------------+
```

**Source Picker**: Dropdown listing available screens and windows, populated via `desktopCapturer.getSources()`. Shows thumbnail previews. Includes a "Custom Region" option that opens a draggable selection overlay.

**Live Preview**: A PixiJS canvas showing the composed output in real time. During idle (before recording), it shows a live feed of the selected source with all styling applied. During recording, it continues showing the composed feed. This is NOT the raw capture -- it includes background, padding, rounded corners, shadow, and webcam overlay.

**Webcam bubble**: Circular or rounded-rect overlay. User can drag to reposition within the preview. Position is stored as a relative coordinate (percentage of canvas). Size is adjustable via the sidebar.

**Audio meters**: Real-time VU meters for mic and system audio. Shown in the sidebar. Audio sources are selected via dropdown in the toolbar.

**Recording controls**: The REC button starts the countdown timer, then begins capture. Pause suspends capture (media recorder pause). Stop finalizes the recording. Elapsed time displays during recording.

### 1.3 Data Model Impact

**Reads:**
- `Project.settings` -- to determine target resolution, FPS, and default background for the recording preview.

**Writes:**
- Creates a new `Asset` of type `screen-recording` (and optionally `webcam`, `audio`) when recording stops. The asset's `filePath` points to the raw file saved to the project's media directory.
- Creates a new `Clip` on the first available video track referencing the new screen-recording asset. Sets `sourceIn = 0`, `sourceOut = asset.duration`, `position` = end of existing content on the track.
- If webcam was enabled, creates a second `Asset` (type `webcam`) and a `Clip` on video track 2 with a `picture-in-picture` `Effect` storing position, size, and shape parameters.
- If audio was captured, creates `Asset`(s) of type `audio` and `Clip`(s) on audio tracks.
- Applies default `Effect` entries to the screen-recording clip: `rounded-corners`, `shadow`, `background-pad` -- matching whatever the user configured in the sidebar. These effects are serialized so the Edit tab can modify them later.

**Recording config (UI state, not persisted to project model):**
- Selected source ID, region bounds, webcam device ID, mic device ID, system audio enabled, countdown duration, sidebar styling values. Stored in a Zustand `recordingStore` separate from the project store. Last-used config is persisted to `localStorage` for convenience.

### 1.4 Rendering Responsibilities

**Preview pipeline (PixiJS):**
- Renders a real-time composed preview during idle and recording states.
- Takes the raw `MediaStream` from `desktopCapturer` and draws it as a texture on a PixiJS sprite.
- Applies visual effects in the GPU pipeline: background fill/gradient behind the capture, padding (inset the capture sprite), rounded corner mask (shader or mask sprite), drop shadow (blur filter on a shadow sprite beneath the capture).
- Composites the webcam stream as a second sprite with its own mask (circle or rounded rect), border, and position.
- Runs at display refresh rate. Does not need to match project FPS exactly.

**Export pipeline:**
- Not involved during recording. The raw streams are written to disk by `MediaRecorder`. The export pipeline consumes the resulting assets later, during export.

**Boundary:** The Record tab does NOT call FFmpeg or process frames. It writes raw WebM/MKV via `MediaRecorder`. The preview pipeline only provides visual feedback -- it does not produce the recording file.

### 1.5 Acceptance Criteria

- User can open the Record tab and see a live preview of their selected screen/window with background, padding, rounded corners, and shadow applied.
- User can switch between available screens and windows via the source picker; the preview updates within 500ms.
- User can select a custom region; a draggable/resizable overlay appears on the target screen, and the preview shows only that region.
- User can enable/disable webcam; when enabled, a circular webcam overlay appears in the preview and can be repositioned by dragging.
- User can select mic and toggle system audio; audio levels show on VU meters in real time.
- User can adjust background color/gradient, padding, corner radius, shadow, and webcam size/position via the sidebar; changes reflect in the live preview immediately.
- User can click REC; a countdown (configurable: 0/3/5/10 seconds) plays, then recording begins. Elapsed time displays.
- User can pause and resume recording; the resulting file contains no gap at the pause point.
- User can stop recording; the raw media files are saved to the project directory.
- After stopping, a new `Asset` and `Clip` appear in the project model. The user is optionally navigated to the Edit tab where the new clip is visible on the timeline.
- Recording at 30fps and 60fps produces files that play back at the correct speed.
- If the webcam or mic is disconnected mid-recording, the recording continues with remaining sources, and a warning toast appears.
- Audio sync between screen capture, webcam, and mic is within 1 frame (33ms at 30fps) on playback.

### 1.6 Non-Goals

- No live streaming or RTMP output.
- No multi-monitor simultaneous capture (user picks one source at a time).
- No real-time effects beyond the fixed set (background, padding, corners, shadow, webcam PiP). Arbitrary PixiJS effects during recording are deferred to Edit.
- No recording annotations or drawing tools during capture.
- No automatic silence detection or segment splitting during recording.
- No cloud upload directly from the Record tab.
- No virtual background or background removal on webcam in v1.

### 1.7 Test Strategy

**Unit tests:**
- Recording config store: test that changing source, toggling webcam, adjusting sidebar values updates state correctly.
- Asset creation logic: given a completed recording (mock file path, duration, metadata), verify correct `Asset` and `Clip` objects are produced with correct field values.
- Countdown timer logic: verify it counts down from the configured value and fires the start callback at zero.

**Integration tests:**
- Source enumeration: mock `desktopCapturer.getSources()` and verify the source picker populates correctly.
- Recording lifecycle: mock `MediaRecorder`, trigger start -> pause -> resume -> stop, verify the correct sequence of API calls and that the final file path is valid.
- Asset-to-timeline flow: after a mock recording completes, verify the project store contains the new asset and clip with correct references.

**E2E tests:**
- Full recording flow: open Record tab, select a source, enable webcam (mocked), click REC, wait 2 seconds, click Stop. Verify a file exists in the project directory and a clip appears on the timeline.
- Settings persistence: adjust sidebar values, switch tabs, return to Record, verify values are restored.

**Visual/snapshot tests:**
- Snapshot the PixiJS preview canvas with a static test image as the capture source. Verify rounded corners, shadow, background, and webcam bubble render correctly against a baseline image.

---

## Tab 2: Edit

### 2.1 User Goal

The user wants to trim, arrange, and polish their recordings into a finished video. They need a familiar timeline-based editor where they can cut out mistakes, rearrange sections, layer webcam and screen recordings, adjust audio levels, apply visual effects (zoom, blur, color correction), add transitions between clips, and preview the result in real time -- all with frame-level precision and full undo/redo support.

### 2.2 UI Layout

```
+---------------------------------------------------------------+
|  [Tab Bar: Record | Edit | Motion | AI | Export]              |
+---------------------------------------------------------------+
|  TOP TOOLBAR                                                   |
|  [Undo] [Redo] | [Split] [Delete] [Ripple ▼] | [Snap] [Zoom]|
|  [Playback: |<< < [Play/Pause] > >>|] [Timecode: 00:00:00:00]|
+---------------------------------------------------------------+
|                         |                                      |
|    CENTER CANVAS        |   RIGHT INSPECTOR PANEL              |
|                         |                                      |
|  +-------------------+  |   [Clip Properties]                  |
|  |                   |  |   -- Name, source info               |
|  |  PREVIEW PLAYER   |  |   -- In/Out points                   |
|  |  (PixiJS canvas)  |  |   -- Opacity, blend mode             |
|  |                   |  |   [Effects Stack]                    |
|  +-------------------+  |   -- [+ Add Effect]                  |
|                         |   -- Zoom: { scale, center, ... }    |
|                         |   -- Blur: { radius }                |
|                         |   -- Each with keyframe toggles      |
|                         |   [Audio]                             |
|                         |   -- Volume: [slider + keyframes]    |
|                         |   -- Waveform visualization          |
+---------------------------------------------------------------+
|  BOTTOM TIMELINE                                               |
|  [Ruler with frame/timecode markings]          [Zoom slider]  |
|  V1 |[====Clip A====][==Clip B==]              |              |
|  V2 |        [==Webcam Clip==]                 |              |
|  A1 |[====Audio Clip====]                      |              |
|  A2 |[====Music/Narration====]                 |              |
|  [Playhead line spanning all tracks]                          |
+---------------------------------------------------------------+
```

**Preview player**: A PixiJS canvas that renders the composed frame at the current playhead position. During playback, it advances the playhead at the project's FPS and renders each frame. Displays the output as it will appear on export (all effects, transitions, compositing applied).

**Timeline**: Horizontal tracks with a shared time ruler. Clips are rectangular blocks that can be dragged horizontally (reposition), dragged at edges (trim), or dragged vertically (move between tracks of the same type). The playhead is a vertical line spanning all tracks, draggable and click-positionable.

**Track headers** (left of timeline): Show track name (V1, V2, A1, A2), mute/solo toggles, lock toggle, and volume slider for audio tracks.

**Clip rendering on timeline**: Video clips show thumbnail strip. Audio clips show waveform. Clips with effects show a small effect icon. Transitions show a crossfade icon at the overlap zone.

**Inspector panel**: Context-sensitive. When a clip is selected, shows its properties and effect stack. When no clip is selected, shows composition-level settings. Each effect in the stack is an expandable section with parameter controls. Parameters that support keyframes show a diamond toggle; when enabled, keyframe markers appear on the timeline at the clip's row.

**Toolbar**: Standard editing tools. Split cuts the selected clip at the playhead. Delete removes the selected clip. Ripple mode controls whether deleting/trimming shifts subsequent clips. Snap toggles magnetic snapping to clip edges and playhead. Zoom controls the timeline zoom level.

### 2.3 Data Model Impact

**Reads:**
- `Project.compositions[active]` -- the currently active composition.
- `Track[]` -- all tracks in the active composition, for timeline rendering.
- `Clip[]` -- all clips, for positioning and rendering on tracks.
- `Asset[]` -- to resolve clip source references (file paths, durations, thumbnails).
- `Effect[]`, `Keyframe[]` -- for the inspector panel and preview rendering.
- `Transition[]` -- for rendering transition zones on the timeline and in preview.

**Writes:**
- `Clip` CRUD: create (import/paste), read (display), update (move, trim, rename), delete.
- `Clip.position` and `Clip.duration` -- on drag-move and edge-trim.
- `Clip.sourceIn` / `Clip.sourceOut` -- on trimming.
- `Effect` CRUD on clips: add, remove, reorder, update parameters.
- `Keyframe` CRUD within effects: add at playhead, move, delete, change easing.
- `Transition` CRUD: add between adjacent clips, configure type and duration.
- `Track` properties: mute, lock, name.
- `Composition.duration` -- recalculated whenever clips change.

**Undo/Redo:**
- Every write operation pushes a state snapshot (or inverse operation) to an undo stack managed by the project store. Undo pops and applies the previous state. Redo re-applies. The stack is capped (e.g., 100 entries) and cleared on project save to free memory.

### 2.4 Rendering Responsibilities

**Preview pipeline (PixiJS):**
- Given the current playhead frame, resolves which clips are active on each track.
- For each active video clip: loads the source frame from the asset (via a frame cache / video decoder), applies the clip's effect stack in order (zoom, blur, rounded corners, color correction, etc.), and composites onto the canvas respecting track order (V1 bottom, V2 top).
- For transitions: when the playhead is within a transition zone, renders both incoming and outgoing clips and blends them according to the transition type and progress.
- For audio: while not "rendering" audio in PixiJS, the preview system must decode and play audio clips in sync with the playhead, mixing multiple audio tracks. This uses the Web Audio API, not PixiJS.
- Frame cache: The preview pipeline maintains a small cache of decoded frames around the playhead for scrubbing performance. On seek, it decodes the nearest keyframe and advances to the target frame.
- Target: 30fps playback for a 30fps project on mid-range hardware. Dropped frames are acceptable during scrubbing.

**Export pipeline:**
- Not directly invoked from the Edit tab, but the Edit tab is where the user builds the composition that the export pipeline will render. The project model written here is exactly what the export pipeline reads.

**Boundary:** The Edit tab provides clip/track/effect data to the preview pipeline via the project model. It does not call PixiJS directly -- it updates the store, and a preview renderer component subscribes to store changes and re-renders.

### 2.5 Acceptance Criteria

- User can see all tracks (V1, V2, A1, A2) on the timeline with correct clip positions.
- User can drag a clip horizontally to reposition it; the clip snaps to adjacent clip edges and the playhead when snap is enabled.
- User can drag a clip's left or right edge to trim it; the clip's `sourceIn`/`sourceOut` and `duration` update accordingly, and the preview reflects the new in/out points.
- User can select a clip and press Split (or keyboard shortcut `S`); the clip divides at the playhead into two clips with correct source references.
- User can delete a clip; in ripple mode, subsequent clips shift left to fill the gap.
- User can drag a clip from V1 to V2 (or vice versa); it moves to the new track.
- User can click anywhere on the timeline ruler to position the playhead; the preview updates to show that frame within 100ms.
- User can press Play; the preview plays back at the project FPS with audio in sync. Pressing Pause stops playback and holds the current frame.
- User can scrub the playhead by dragging; the preview updates in real time (may drop frames during fast scrubs).
- User can select a clip, open the inspector, click "+ Add Effect", choose "Zoom", and configure scale/center. The preview reflects the zoom effect immediately.
- User can enable keyframing on an effect parameter, add keyframes at different playhead positions, and see the parameter animate during playback.
- User can add a crossfade transition between two adjacent clips on the same track by dragging one clip to overlap the other. The preview shows the crossfade.
- User can press Ctrl+Z/Cmd+Z to undo any operation; Ctrl+Shift+Z/Cmd+Shift+Z to redo.
- Undo/redo works for all operations: move, trim, split, delete, effect changes, keyframe changes.
- Audio clips display waveforms on the timeline.
- User can mute/solo individual tracks via track headers.
- User can lock a track to prevent accidental edits.
- Timeline zoom (Ctrl+scroll or slider) smoothly scales the time axis from clip-level overview to frame-level detail.

### 2.6 Non-Goals

- No more than 2 video + 2 audio tracks in v1. The data model supports more, but the UI is fixed at 4 tracks.
- No text/title clip type in the Edit tab (handled by Motion tab).
- No speed ramping or time remapping in v1.
- No multi-composition editing (one active composition at a time).
- No color grading beyond basic correction (brightness, contrast, saturation).
- No audio effects (EQ, compression, noise reduction) in v1 -- volume and mute only.
- No collaborative or multi-user editing.
- No proxy/offline workflow -- the app works with original media files directly.
- No markers or chapter points on the timeline.

### 2.7 Test Strategy

**Unit tests:**
- Clip operations: `splitClip(clipId, frame)` produces two clips with correct `sourceIn`, `sourceOut`, `position`, `duration`. Edge cases: split at frame 0, split at last frame, split when playhead is outside clip bounds (no-op).
- Trim logic: trimming left edge of a clip adjusts `sourceIn` and `position` without exceeding source bounds. Trimming right edge adjusts `sourceOut` and `duration`.
- Move logic: moving a clip updates `position`. Moving to another track updates `trackId`. Collision detection: moving a clip into occupied space either blocks or ripples.
- Undo/redo stack: perform operation, undo, verify state matches pre-operation. Redo, verify state matches post-operation. Perform new operation after undo, verify redo stack is cleared.
- Effect parameter updates: changing a parameter value persists to the clip's effect. Adding/removing keyframes updates the keyframe array.

**Integration tests:**
- Recording-to-edit flow: after a recording completes (mocked), switch to Edit tab, verify the clip appears on V1 with correct duration.
- Effect-to-preview flow: add a zoom effect to a clip, verify the preview pipeline receives the updated project model with the effect included.
- Transition creation: overlap two clips, verify a `Transition` entity is created with correct timing.
- Keyboard shortcuts: press S with a clip selected and playhead within it, verify split occurs.

**E2E tests:**
- Full edit session: import a test video asset, trim it, split it, add a zoom effect, play back, verify no crashes and correct visual output.
- Undo/redo marathon: perform 10+ varied operations, undo all, verify clean state, redo all, verify final state.

**Visual/snapshot tests:**
- Render a specific frame of a test composition (known clip with known effects) via the preview pipeline and compare against a baseline image. Tests zoom, blur, rounded corners, compositing order.
- Timeline component: snapshot the timeline with known clips positioned, verify correct visual layout.

---

## Tab 3: Motion

### 3.1 User Goal

The user wants to add polished motion graphics to their video -- animated intros, outros, lower thirds, call-to-action overlays, zoom emphasis effects -- without writing code or using external tools. They browse a library of pre-built templates, customize text and colors, preview the animation, and place it on their timeline as a regular clip.

### 3.2 UI Layout

```
+---------------------------------------------------------------+
|  [Tab Bar: Record | Edit | Motion | AI | Export]              |
+---------------------------------------------------------------+
|  LEFT SIDEBAR:                |  CENTER CANVAS                |
|  TEMPLATE LIBRARY             |                                |
|                               |  +-------------------------+  |
|  [Search bar]                 |  |                         |  |
|  [Category filter ▼]         |  |   TEMPLATE PREVIEW      |  |
|   - Intros                   |  |   (PixiJS canvas)       |  |
|   - Outros                   |  |                         |  |
|   - Lower Thirds            |  |   Animated preview of   |  |
|   - Call-to-Action           |  |   the selected template |  |
|   - Zoom Emphasis            |  |   with current params   |  |
|   - Transitions              |  |                         |  |
|                               |  +-------------------------+  |
|  [Template card grid]         |  [Play] [Pause] [Loop]        |
|  +------+ +------+           |                                |
|  | Thumb| | Thumb|           +--------------------------------+
|  | Name | | Name |           |  RIGHT PANEL:                  |
|  +------+ +------+           |  TEMPLATE PARAMETERS           |
|  +------+ +------+           |                                |
|  | Thumb| | Thumb|           |  [Template Name]               |
|  | Name | | Name |           |  -- Text: [input field]        |
|  +------+ +------+           |  -- Subtitle: [input field]    |
|  ...                         |  -- Primary Color: [picker]    |
|  ...                         |  -- Accent Color: [picker]     |
|                               |  -- Duration: [slider, 2-10s] |
|                               |  -- Easing: [dropdown]        |
|                               |  -- Font: [dropdown]          |
|                               |  -- Position: [preset grid]   |
|                               |                                |
|                               |  [Apply to Timeline] button   |
+---------------------------------------------------------------+
```

**Template library** (left sidebar): A scrollable grid of template cards. Each card shows a static thumbnail, template name, and category badge. Clicking a card selects it and loads the preview + parameter panel. Search filters by name. Category filter narrows by type.

**Template preview** (center): A PixiJS canvas that plays the selected template's animation at project resolution. Uses the same preview pipeline as Edit. Playback controls allow play, pause, and loop. The preview updates live as the user edits parameters on the right.

**Parameter panel** (right): Displays the selected template's customizable parameters. Each parameter has a type-appropriate control: text input for strings, color picker for colors, slider for numbers, dropdown for enums. The parameter set is defined by the template -- different templates expose different parameters. A "Duration" slider is always present, controlling how long the animation plays. An easing dropdown controls the overall animation curve.

**Apply to Timeline**: Places the configured template onto the timeline as a `Clip` on the first available video track. The user switches to the Edit tab to position it precisely.

### 3.3 Data Model Impact

**Reads:**
- `MotionTemplate[]` -- the template library (bundled with the app, loaded at startup).
- `Project.settings` -- resolution and FPS, so the template preview renders at the correct size and frame rate.

**Writes:**
- When the user clicks "Apply to Timeline":
  - Creates a new `Asset` of type `motion-template` with a reference to the template ID and the user's parameter values. (The asset doesn't point to a media file -- it points to the template definition + parameters. The render pipelines know how to resolve this.)
  - Creates a new `Clip` on a video track referencing this asset. The clip's `duration` matches the configured template duration (in frames). `position` is set to the current playhead or the end of existing content.
  - The `Clip.effects` array may include `Effect` entries generated by the template (e.g., a zoom emphasis template generates a `zoom` effect with keyframes).

**Template definition** (read-only, bundled):
- Each `MotionTemplate` is a JSON/TS definition containing: a mini-`Composition` describing the animation layers and their keyframed properties, a `parameters` schema listing user-configurable fields with types/defaults/constraints, and a thumbnail image path.

### 3.4 Rendering Responsibilities

**Preview pipeline (PixiJS):**
- Renders the template's mini-composition in the Motion tab's preview canvas. This involves:
  - Creating sprites/text objects for each layer in the template composition.
  - Evaluating keyframed properties at the current preview frame (position, scale, opacity, color).
  - Applying easing functions to interpolate between keyframes.
  - Rendering text with the selected font and color.
- The same rendering logic applies when the template clip appears on the Edit tab timeline -- the preview pipeline resolves the `motion-template` asset type by evaluating its internal composition.

**Export pipeline:**
- Renders template clips frame-by-frame, evaluating the same composition/keyframe data as the preview pipeline but at full quality. Text is rasterized at export resolution. All keyframe interpolation is evaluated per-frame without dropping frames.

**Boundary:** The Motion tab does not implement its own renderer. It constructs a `MotionTemplate` configuration (parameters + template ID) and writes it to the project model. The preview pipeline renders it. The template definitions themselves are declarative data -- not imperative rendering code.

### 3.5 Acceptance Criteria

- User can browse a library of at least 8 templates across categories: 2 intros, 2 outros, 2 lower thirds, 1 call-to-action, 1 zoom emphasis.
- User can click a template card and see its animation play in the preview canvas.
- User can edit text, colors, duration, and easing in the parameter panel; the preview updates within 200ms of each change.
- User can search templates by name; the grid filters in real time.
- User can filter templates by category; only matching templates display.
- User can click "Apply to Timeline" and the template appears as a clip on the Edit tab's timeline.
- The template clip in the Edit tab's timeline preview renders identically to the Motion tab's preview.
- Template clips are serializable: saving and reloading the project preserves template clips with all parameter values.
- Template clips can be trimmed and repositioned on the timeline like any other clip.
- All template text renders crisply at the project resolution (no blurry text from upscaling).

### 3.6 Non-Goals

- No user-authored templates or template editor in v1. Users customize parameters, not structure.
- No code editor for templates (Remotion-style JSX editing is a future feature).
- No template import from external sources.
- No 3D effects or 3D text in templates.
- No template marketplace or sharing.
- No audio in templates (templates are visual-only in v1; users add audio on the audio tracks).
- No template chaining or sequencing within the Motion tab (users compose on the timeline).
- No particle effects or physics-based animations.

### 3.7 Test Strategy

**Unit tests:**
- Template parameter validation: given a template schema, verify that out-of-range values are clamped, missing required fields use defaults, and type mismatches are caught.
- Keyframe interpolation: given keyframes at frames 0 and 30 with values 0 and 100 and linear easing, verify frame 15 evaluates to 50. Test ease-in, ease-out, ease-in-out, cubic-bezier.
- Template-to-clip conversion: given a template ID and parameter values, verify the created `Asset` and `Clip` have correct fields.

**Integration tests:**
- Template selection flow: click a template card, verify the preview canvas receives the template composition data and begins rendering.
- Apply-to-timeline flow: configure a template, click Apply, verify the Edit tab's project store contains a new clip with the correct asset reference and parameters.
- Parameter change propagation: change a text parameter, verify the preview pipeline re-renders with the new text.

**E2E tests:**
- Full motion flow: open Motion tab, select a lower-third template, change the text to "Test Title", click Apply, switch to Edit tab, position playhead over the clip, verify the preview shows "Test Title" animated.

**Visual/snapshot tests:**
- Render frame 0 and the midpoint frame of each bundled template with default parameters. Compare against baseline images. This catches regressions in template rendering.

---

## Tab 4: AI

### 4.1 User Goal

The user wants AI to handle tedious editing tasks: generating captions from spoken audio and suggesting zoom keyframes at moments of interest in screen recordings. They want to review AI suggestions before they affect the timeline -- accepting good suggestions and rejecting bad ones. The experience should feel assistive, not autonomous: the AI proposes, the user disposes.

### 4.2 UI Layout

```
+---------------------------------------------------------------+
|  [Tab Bar: Record | Edit | Motion | AI | Export]              |
+---------------------------------------------------------------+
|  TOP TOOLBAR                                                   |
|  [Feature Selector: Auto-Captions | Smart Zoom]              |
|  [Provider: Local (Whisper) | Cloud ▼]  [Settings Gear]      |
+---------------------------------------------------------------+
|                                                                |
|  LEFT: SOURCE SELECTOR            RIGHT: RESULTS PANEL        |
|                                                                |
|  Select asset to analyze:         [Status: Idle / Processing  |
|  +---------------------------+     / Complete]                 |
|  | [v] Screen Recording 1   |                                |
|  | [ ] Webcam Clip 2         |    -- AUTO-CAPTIONS VIEW --    |
|  | [v] Audio Narration       |    +-------------------------+ |
|  +---------------------------+    | 00:05 "Hello everyone"  | |
|                                   |   [Accept] [Reject] [Edit]|
|  [Analyze] button                 | 00:08 "Today we'll..."  | |
|                                   |   [Accept] [Reject] [Edit]|
|  -- PREVIEW --                    | 00:12 "First, let me..."| |
|  +---------------------------+    |   [Accept] [Reject] [Edit]|
|  |                           |    +-------------------------+ |
|  |  Preview player           |                                |
|  |  (shows current asset     |    -- SMART ZOOM VIEW --      |
|  |  at selected annotation   |    +-------------------------+ |
|  |  timecode)                |    | 00:15 Zoom to (320,240) | |
|  |                           |    |  Scale: 2x  Dur: 1.5s   | |
|  +---------------------------+    |  [Accept] [Reject] [Edit]| |
|                                   | 00:32 Zoom to (800,400) | |
|  [Accept All] [Reject All]       |  Scale: 1.8x Dur: 2s    | |
|  [Apply Accepted to Timeline]    |  [Accept] [Reject] [Edit]| |
|                                   +-------------------------+ |
+---------------------------------------------------------------+
```

**Feature selector**: Toggles between Auto-Captions and Smart Zoom views. Each has its own analysis pipeline and result display.

**Source selector**: Lists project assets that are valid inputs for the selected feature. For Auto-Captions: audio assets and video assets with audio tracks. For Smart Zoom: screen recording video assets. Checkboxes allow multi-select for batch analysis.

**Analyze button**: Triggers the AI pipeline on the selected assets. Shows a progress indicator (percentage + elapsed time) during processing. Processing happens in a background worker/process to keep the UI responsive.

**Results panel**: Scrollable list of `AIAnnotation` entries. Each entry shows a timestamp, a preview of the suggestion (caption text or zoom region/scale), and Accept/Reject/Edit buttons. Edit opens an inline editor: for captions, a text field; for zoom suggestions, sliders for scale/center/duration.

**Preview**: A small preview player (PixiJS) that shows the source asset at the timestamp of the currently hovered/selected annotation. For zoom suggestions, the preview also shows the suggested zoom framing as an overlay.

**Apply to Timeline**: Takes all accepted annotations and converts them to timeline entities. Accepted captions become text clips on a subtitle-designated track (or effect entries). Accepted zoom suggestions become `zoom` effects with keyframes on the corresponding clip.

### 4.3 Data Model Impact

**Reads:**
- `Asset[]` -- to list available assets for analysis and to locate source files for the AI pipeline.
- `Clip[]` -- to determine which clips correspond to analyzed assets (needed to apply zoom suggestions to the correct clip).
- `Project.settings.fps` -- to convert between timestamps and frame numbers.

**Writes:**
- `AIAnnotation[]` -- created during analysis. Each annotation is stored at the project level (not on a clip) with a reference to the source asset. Fields:
  - Auto-Caption: `type: 'caption'`, `data: { text: string, words: { word, startFrame, endFrame }[] }`.
  - Smart Zoom: `type: 'zoom-suggestion'`, `data: { centerX, centerY, scale, durationFrames }`.
- When "Apply Accepted to Timeline" is clicked:
  - **Captions**: For each accepted caption annotation, creates an `Effect` of type `subtitle` on the corresponding clip (or creates a dedicated text `Clip` on V2 if the architecture prefers a subtitle track approach). Effect parameters include the caption text, position, font, size, timing.
  - **Zoom suggestions**: For each accepted zoom annotation, adds a `zoom` `Effect` to the corresponding video `Clip` with `Keyframe` entries: one keyframe at the start of the zoom (scale 1.0 at the frame before), one at the zoom point (target scale/center), and one at the end (returning to 1.0). Easing is set to `ease-in-out`.
- Annotation `status` is updated from `pending` to `accepted` or `rejected` as the user interacts.

### 4.4 Rendering Responsibilities

**Preview pipeline (PixiJS):**
- In the AI tab, renders a small preview of the source asset at a given frame. For zoom suggestions, overlays a rectangle showing the zoom region and simulates the zoom effect when the user hovers/selects the annotation.
- After annotations are applied to the timeline, the preview pipeline renders the resulting effects (subtitle text, zoom keyframes) just like any other effect -- no special AI-specific rendering path.

**Export pipeline:**
- No special behavior. Captions and zoom effects applied from AI annotations are standard `Effect` and `Keyframe` entries by the time they reach export. The export pipeline renders them identically to manually-created effects.

**AI processing pipeline** (separate from rendering):
- **Auto-Captions**: Extracts audio from the asset (via FFmpeg), sends to Whisper (local binary or cloud API), receives word-level timestamps, converts to `AIAnnotation[]`.
- **Smart Zoom**: Analyzes video frames for cursor/mouse movement, click events, and UI focus changes. Uses a frame sampling strategy (not every frame -- e.g., 2-5 fps) to detect regions of interest. Produces `AIAnnotation[]` with zoom suggestions.
- Both pipelines run in a background process (Electron `utilityProcess` or worker thread) to avoid blocking the UI.

**Provider abstraction**: An `AIProvider` interface defines `analyzeForCaptions(assetPath): Promise<AIAnnotation[]>` and `analyzeForZoom(assetPath): Promise<AIAnnotation[]>`. Implementations exist for local (Whisper binary, OpenCV-based zoom analysis) and cloud (API calls). The user selects the provider in the toolbar. New providers can be added by implementing the interface.

### 4.5 Acceptance Criteria

- User can select an asset with audio and click Analyze to generate captions. Captions appear in the results panel within a reasonable time (under 60 seconds for a 5-minute recording using local Whisper on mid-range hardware).
- Each caption shows the correct text and timestamp; clicking it seeks the preview to that point.
- User can edit a caption's text inline in the results panel.
- User can accept or reject individual captions. Accept All and Reject All buttons work on the entire set.
- User can select a screen recording asset and click Analyze for Smart Zoom. Zoom suggestions appear with region, scale, and duration.
- Each zoom suggestion shows the target region overlaid on the preview when selected.
- User can edit a zoom suggestion's scale, center, and duration.
- User can click "Apply Accepted to Timeline" and the accepted annotations create corresponding effects/clips in the project model.
- After applying captions, switching to the Edit tab shows subtitle effects on the timeline that render correctly in the preview.
- After applying zoom suggestions, switching to the Edit tab shows zoom keyframes on the corresponding clip's effect stack that animate correctly during playback.
- If the AI provider is unavailable (no local model, no API key), the user sees a clear error message with setup instructions.
- Analysis can be cancelled mid-process without corrupting the project.
- Re-analyzing the same asset replaces previous annotations (after user confirmation).

### 4.6 Non-Goals

- No real-time / live AI analysis during recording.
- No auto-edit or auto-assembly (AI does not rearrange or cut clips automatically).
- No AI-generated voiceover or text-to-speech.
- No AI-powered background removal or object tracking.
- No fine-tuning or training custom models.
- No more than 2 AI features in v1 (captions + smart zoom). Additional features (silence detection, highlight extraction, auto-chapters) are deferred.
- No AI caption translation in v1 (single language based on source audio).
- No always-on AI that processes in the background without user initiation.

### 4.7 Test Strategy

**Unit tests:**
- Whisper output parsing: given a mock Whisper JSON response (word-level timestamps), verify correct conversion to `AIAnnotation[]` with accurate frame numbers at various FPS values.
- Zoom analysis heuristics: given a sequence of cursor positions across frames, verify the algorithm identifies the correct "points of interest" (large cursor movements, pauses after movement, click positions).
- Annotation-to-effect conversion: given an accepted caption annotation, verify the created `Effect` has correct type, parameters (text, position, timing), and keyframes. Same for zoom annotations.
- Provider interface: verify both local and cloud provider implementations conform to the `AIProvider` interface and handle errors gracefully (timeout, invalid response, missing model).

**Integration tests:**
- Full caption flow (mocked): mock the Whisper binary to return a fixed response, run the caption pipeline on a test asset, verify annotations appear in the store.
- Apply-to-timeline flow: create mock annotations, mark some accepted, click Apply, verify the project model contains the correct effects and keyframes on the correct clips.
- Provider switching: switch from local to cloud provider, verify the analysis pipeline uses the correct implementation.

**E2E tests:**
- Caption flow with real Whisper (if available in CI): analyze a short test audio file, verify captions are generated and can be applied to the timeline.
- Smart Zoom flow: analyze a test screen recording with known cursor movements, verify zoom suggestions are generated at the expected timestamps (within a tolerance).

**Visual/snapshot tests:**
- Render a frame with an applied caption effect and compare against a baseline (verifying text position, font, styling).
- Render a frame at a zoom keyframe and compare against a baseline (verifying scale and center).

---

## Tab 5: Export

### 5.1 User Goal

The user has finished editing and wants to render their project to a final MP4 file. They want to choose resolution, frame rate, quality, and codec, see a progress indicator while the render runs, and get a playable MP4 when it's done. They may want to queue multiple exports with different settings (e.g., a 1080p and a 4K version) and let them process sequentially.

### 5.2 UI Layout

```
+---------------------------------------------------------------+
|  [Tab Bar: Record | Edit | Motion | AI | Export]              |
+---------------------------------------------------------------+
|                                                                |
|  LEFT: EXPORT SETTINGS           RIGHT: EXPORT QUEUE          |
|                                                                |
|  [Preset: YouTube 1080p ▼]      +-------------------------+  |
|                                   | Job 1: project_v1.mp4  |  |
|  Resolution: [1920] x [1080]    | 1080p 30fps H.264       |  |
|  FPS: [30 ▼]                    | [=====>    ] 45%        |  |
|  Codec: [H.264 ▼]              | Frame 810 / 1800        |  |
|  Quality: [High ▼]             | ETA: 2:30               |  |
|    CRF: [18] (if custom)       |                         |  |
|  Audio Codec: [AAC ▼]          | +---preview thumbnail---+|  |
|  Audio Bitrate: [192kbps ▼]    | |  current frame being  ||  |
|                                   | |  rendered             ||  |
|  Output Path:                    | +----------------------+|  |
|  [/path/to/output.mp4] [Browse] |                         |  |
|                                   +-------------------------+  |
|  [Add to Queue] [Export Now]     +-------------------------+  |
|                                   | Job 2: project_4k.mp4  |  |
|                                   | 3840x2160 30fps H.264  |  |
|                                   | Queued (waiting)       |  |
|                                   +-------------------------+  |
|                                                                |
|  BOTTOM: OUTPUT PREVIEW                                       |
|  +-------------------------------------------------------+   |
|  |  Preview of the first frame / poster frame             |   |
|  |  (static, rendered from project model)                 |   |
|  +-------------------------------------------------------+   |
|  Estimated file size: ~45 MB                                  |
|  Estimated time: ~5 minutes                                   |
+---------------------------------------------------------------+
```

**Presets**: Dropdown with common export configurations (YouTube 1080p, YouTube 4K, Twitter/X, Instagram, Custom). Selecting a preset populates resolution, FPS, codec, and quality fields. "Custom" allows full manual control.

**Settings panel**: Resolution width/height fields (linked aspect ratio by default, unlinkable). FPS dropdown (24, 25, 30, 60). Codec dropdown (H.264 for v1 -- H.265/VP9 deferred). Quality dropdown (Low, Medium, High, Lossless) mapping to CRF values, with a manual CRF slider for Custom. Audio codec and bitrate.

**Output path**: File path selector with a Browse button that opens a native save dialog. Default: project directory with project name and timestamp.

**Add to Queue**: Adds the current settings as a job to the export queue without starting it. **Export Now**: Adds to queue and immediately starts processing.

**Export queue** (right panel): List of export jobs. Each shows the output filename, settings summary, and status (Queued, Processing, Complete, Failed). The currently processing job shows a progress bar (percentage), frame counter (current/total), ETA, and a live thumbnail of the frame being rendered. Completed jobs show a checkmark and "Open File" / "Open Folder" links. Failed jobs show an error message and "Retry" button.

**Output preview**: A static render of the first frame of the composition at the configured export resolution, giving the user a preview of what the output will look like. Includes estimated file size (based on bitrate * duration) and estimated render time (based on a quick benchmark of rendering a few frames).

### 5.3 Data Model Impact

**Reads:**
- `Project` -- the entire project model is consumed by the export pipeline. Every `Composition`, `Track`, `Clip`, `Effect`, `Keyframe`, `Transition`, and `Asset` is read and resolved.
- `MotionTemplate` definitions -- to resolve motion template clips.
- `Asset.filePath` -- to locate source media files for frame decoding.

**Writes:**
- Export jobs are NOT part of the project model. They are transient state stored in an `exportStore` (Zustand). Each job has: `id`, `settings` (resolution, fps, codec, quality, output path), `status`, `progress` (current frame, total frames, percentage, ETA), `error?`.
- The export tab does NOT modify the project model. It is a pure consumer.
- On completion, the output file path could optionally be added as an `Asset` to the project for re-import, but this is not required for v1.

### 5.4 Rendering Responsibilities

**Preview pipeline (PixiJS):**
- Renders the first frame / poster frame of the composition at export resolution for the output preview. This is a one-shot render, not continuous playback.
- May render the current frame being exported as a live thumbnail in the job progress display (optional -- the export pipeline could also provide this via an off-screen canvas or buffer).

**Export pipeline (frame-by-frame + FFmpeg):**
- The export renderer is headless and deterministic. It may use Canvas2D or a small headless WebGL context — the only requirement is that given the same project model, it produces the exact same output every time. It is architecturally independent from the PixiJS preview renderer.
- This is the export pipeline's primary domain. The process:
  1. **Initialize**: Read the full project model. Determine total frame count from the active composition's duration. Set up an FFmpeg process with the configured codec, resolution, FPS, and quality parameters. FFmpeg receives raw frames via stdin pipe (rgba or yuv420p).
  2. **Frame loop**: For each frame `f` from 0 to `totalFrames - 1`:
     a. Determine which clips are active at frame `f` on each track.
     b. For each active video clip: decode the source frame from the asset (using FFmpeg or a video decoder library), apply the clip's effect stack (zoom, blur, rounded corners, color correction, etc.), composite onto the frame buffer respecting track order and transitions.
     c. Resolve motion template clips by evaluating their internal composition at the relative frame.
     d. Evaluate all keyframed parameters at frame `f` with proper easing interpolation.
     e. Resolve transitions by blending incoming/outgoing clip frames.
     f. Write the composed frame to FFmpeg's stdin.
     g. Report progress to the `exportStore`.
  3. **Audio**: Extract and mix audio tracks separately. Each audio clip is decoded, trimmed to its in/out points, and mixed with volume envelopes. The mixed audio is fed to FFmpeg as a separate stream or muxed in a second pass.
  4. **Finalize**: Close the FFmpeg pipe. FFmpeg produces the final MP4. Update job status to Complete or Failed.

- The export pipeline runs in a background process (Electron `utilityProcess`) to avoid blocking the UI. It communicates progress via IPC.

**Boundary:** The Export tab UI manages job configuration and progress display. It does NOT implement rendering logic -- it dispatches jobs to the export pipeline service. The export pipeline is a standalone module that takes a serialized `Project` and `ExportSettings` and produces a file.

### 5.5 Acceptance Criteria

- User can select a preset (e.g., "YouTube 1080p") and see settings auto-populated to 1920x1080, 30fps, H.264, High quality.
- User can manually adjust resolution, FPS, codec, and quality; changes are reflected in the estimated file size and render time.
- User can browse and select an output file path via native dialog.
- User can click "Export Now" and see a progress bar advancing with frame count and ETA.
- The progress bar updates at least once per second during export.
- A live thumbnail of the current frame being rendered is displayed during export.
- The exported MP4 plays correctly in VLC, QuickTime, and web browsers.
- The exported video matches the Edit tab preview in content, effects, transitions, and timing (frame-accurate).
- Audio is correctly synced with video in the output. Multi-track audio is mixed down to stereo.
- Export of a 3-minute 1080p 30fps composition completes in under 10 minutes on mid-range hardware.
- User can add multiple jobs to the queue; they process sequentially.
- User can cancel an in-progress export; the partial file is cleaned up.
- If export fails (e.g., disk full, codec error), the user sees a clear error message and can retry.
- Completed jobs show "Open File" and "Open Folder" links that work on macOS, Windows, and Linux.
- Empty composition (no clips) shows a warning and prevents export.
- Export settings validation: resolution must be even numbers (required by H.264), FPS must be positive, output path must be writable.

### 5.6 Non-Goals

- No H.265 or VP9 codec support in v1 (H.264 only for maximum compatibility).
- No GIF or image sequence export.
- No direct upload to YouTube, Vimeo, or social media.
- No GPU-accelerated export (CPU rendering in v1; GPU acceleration is a future optimization).
- No chapter markers or metadata embedding in the output.
- No watermark or branding overlay (could be done as an effect on the timeline).
- No batch export of multiple compositions (one composition per project in v1).
- No background export when the app is closed.
- No cloud rendering or distributed export.

### 5.7 Test Strategy

**Unit tests:**
- Preset resolution: selecting "YouTube 1080p" produces `{ width: 1920, height: 1080, fps: 30, codec: 'h264', crf: 18 }`.
- Settings validation: odd resolution values are rejected or auto-corrected to even. Zero/negative FPS is rejected. Invalid output path is caught.
- File size estimation: given bitrate and duration, verify the estimate is within 20% of actual for known test cases.
- Frame count calculation: given a composition with known duration and FPS, verify `totalFrames` is correct.

**Integration tests:**
- Export pipeline with simple composition: create a project with a single solid-color clip (no source decoding needed), export 30 frames, verify the output MP4 has exactly 30 frames at the configured resolution and FPS.
- Multi-track compositing: create a project with overlapping clips on V1 and V2, export, verify V2 renders on top of V1.
- Effect application: create a project with a clip that has a zoom effect, export one frame at the zoom keyframe, verify the frame matches the expected zoom level.
- Transition rendering: create a project with two clips and a crossfade transition, export frames spanning the transition, verify the blend is correct.
- Audio mixing: create a project with two audio clips at different volumes, export, verify the mixed audio has correct levels.

**E2E tests:**
- Full export flow: open a test project with multiple clips, effects, and transitions. Select "YouTube 1080p", click Export Now. Wait for completion. Open the output file and verify it plays correctly.
- Queue flow: add two export jobs with different settings, verify they process sequentially and both complete.
- Cancel flow: start an export, cancel it, verify the partial file is cleaned up and the app remains responsive.

**Visual/snapshot tests:**
- Export a single known frame and compare pixel-by-pixel against a baseline rendered by the preview pipeline. Verify preview-to-export consistency.
- Export a frame with each supported effect type and compare against baselines.

**Performance tests:**
- Benchmark export speed: export a 1-minute 1080p composition and verify it completes within a time budget (e.g., 3 minutes on CI hardware). Track regression over time.

---

## Cross-Cutting Concerns

### Project Persistence

The project model serializes to JSON. Save/load writes/reads a `.roughcut` file (JSON with a version field for migration). Media assets are stored alongside the project file in a `media/` directory. Asset paths in the model are relative to the project root for portability.

### Error Handling

Each tab handles errors locally with toast notifications for recoverable errors (e.g., "Webcam disconnected") and modal dialogs for critical errors (e.g., "Project file corrupted"). Background processes (export, AI analysis) report errors via IPC to the corresponding store, which surfaces them in the UI.

### Performance Budgets

- UI interactions (click, drag, type): respond within 50ms.
- Preview playback: sustain project FPS (30 or 60) with no more than 5% dropped frames on mid-range hardware.
- Timeline scrubbing: render preview frame within 100ms of playhead position change.
- Tab switching: under 200ms.
- Project save: under 1 second for projects with up to 100 clips.

### Keyboard Shortcuts (Global)

| Action | Shortcut |
|--------|----------|
| Undo | Ctrl/Cmd+Z |
| Redo | Ctrl/Cmd+Shift+Z |
| Save | Ctrl/Cmd+S |
| Play/Pause | Space |
| Split | S |
| Delete | Delete/Backspace |
| Export | Ctrl/Cmd+E |

### Accessibility

- All interactive elements are keyboard-navigable.
- Color is not the sole indicator of state (icons/labels accompany color cues).
- Timeline supports keyboard navigation (arrow keys to move playhead, Tab to cycle clips).
