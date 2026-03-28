---
name: motion-tab
description: Motion tab — keyframe editing, animation presets/behaviors, spring physics, auto-zoom generation, text animations, lower thirds. Auto-activates when working on motion graphics, keyframes, animation, or the Motion tab.
triggers:
  - MotionTab
  - MotionPreset
  - keyframe
  - spring
  - auto-zoom
  - ZoomKeyframe
  - easing
  - interpolate
  - animation
  - lower-third
  - text-animation
  - behavior
---

# Motion Tab — Architectural Context

## Overview

The Motion tab is where users create and edit animated effects: keyframed property animations, motion presets (behaviors), spring-physics-based camera movements, auto-zoom from click data, text animations, and lower-third templates. It reads and writes MotionPresets and clip keyframes in the ProjectDocument.

## Industry Patterns (Research-Based)

### Three Tiers of Keyframe Editing

| Tier | Examples | Pattern | Target User |
|------|----------|---------|-------------|
| Simple | Screen Studio, FocuSee | Auto-generated from clicks, drag to adjust | Everyone |
| Intermediate | ScreenFlow, Camtasia | Action bars, behavior presets with params | Content creators |
| Professional | After Effects, Apple Motion | Diamond keyframes + graph editor | Motion designers |

**Rough Cut targets Tier 1 for Record tab (auto-zoom) and Tier 2 for Edit/Motion tabs (behavior presets with overrides).** Full graph editor is out of scope for MVP.

### Auto-Zoom Algorithm (Screen Studio / Camtasia SmartFocus pattern)

1. **Record phase**: Capture click events as `{ frameNumber, x, y, type }` alongside video
2. **Cluster**: Group nearby clicks within a time window into "zoom sessions"
3. **Calculate zoom rect**: Center on click position, add padding, clamp to screen bounds
4. **Generate keyframes**: zoom-in ramp → hold → zoom-out ramp, with spring curves
5. **Write to model**: Each zoom event → `ZoomKeyframe { frameIn, frameOut, targetRect, springConfig }`
6. **User editing**: Zoom track in timeline; drag edges for duration, drag center to reposition

**Click event filtering (validated edge cases)**:
- Right-clicks (`button !== 0`): Filter out — not zoom-worthy
- Drag operations: Record mousedown position; if mousemove > 5px before mouseup, discard
- Rapid double-clicks: Debounce — one zoom per ~15-frame window (at 60fps)
- Menu dismiss clicks: Heuristic — if mousedown+mouseup < 80ms with no prior zoom, treat as dismissal
- Scroll events: Filter entirely — no zoom from wheel events

**Click event data model**: Store raw events with `{ x, y, frameNumber, button, dragDistance, duration }` so the algorithm can be tuned later. Don't pre-filter at capture time.

### Spring Physics (Screen Studio / Remotion model)

Three parameters control all spring-based animations:

| Parameter | Effect | Screen Studio Name | Remotion Name |
|-----------|--------|-------------------|---------------|
| Stiffness | Spring tightness (higher = snappier) | Tension | stiffness |
| Damping | Friction (higher = less overshoot) | Friction | damping |
| Mass | Inertia (higher = slower start/stop) | Mass | mass |

Spring physics replaces traditional bezier easing for camera/zoom animations. The spring parameters ARE the easing — no separate curve picker needed. This produces the premium, organic feel that distinguishes Screen Studio from competitors.

**Implementation**: Use `wobble` library (~1.7KB, TypeScript, framework-agnostic) as the spring solver kernel. It models `CASpringAnimation` exactly using the closed-form analytical solution. Do NOT pull in React Spring or Remotion's runtime — extract only the math. Drive it frame-by-frame at export time, not real-time. Use `measureSpring()` equivalent to determine when animation settles (needed for minimum clip duration).

### Motion Presets / Behaviors (Camtasia pattern)

Presets have three phases:

```
MotionPreset {
  name: string
  phases: {
    in:     { type: 'fade'|'fly'|'scale'|'slide'|'drop', duration: frames, params }
    during: { type: 'pulse'|'bounce'|'shake'|'none', params } | null
    out:    { type: 'fade'|'fly'|'scale'|'slide', duration: frames, params }
  }
}
```

**Critical rule**: A preset is a FACTORY, not live data. Applying a preset generates concrete keyframes in the project model. The user edits the resulting keyframes, not the preset reference. This keeps the project model as inert data (architecture principle §5).

## Canonical Constraints

From the project constitution:

1. **Effects are data, not code** (§7) — Animation keyframes are serializable param bags. Interpolation logic lives in the effect-registry, not in the save file.

2. **The project document is inert data** (§5) — MotionPresets in the model are templates. Applied animations become concrete keyframes on clips. No live preset references.

3. **Frame-based, not time-based** (§4) — All keyframe positions are integer frame numbers. Spring physics must be sampled at frame boundaries.

4. **Every effect is serializable and testable** (§9) — Spring configs serialize as `{ stiffness, damping, mass }`. Interpolation is testable in Vitest without a DOM.

5. **Preview and Export are different pipelines** (§3) — Preview uses PixiJS real-time spring evaluation. Export bakes springs to sampled keyframe arrays (the Lottie/spring-easing pattern) for deterministic frame-by-frame rendering.

## Animatable Properties

Core property set (same across all professional editors):

| Property | Type | Range | Notes |
|----------|------|-------|-------|
| position.x | number | -∞ to +∞ | Pixels from canvas origin |
| position.y | number | -∞ to +∞ | Pixels from canvas origin |
| scale | number | 0 to ∞ | 1.0 = 100%, uniform scale |
| rotation | number | -360 to 360 | Degrees |
| opacity | number | 0 to 1 | 0 = invisible |
| crop (future) | Rect | 0–100% each edge | Per-edge crop |

**Viewport zoom** (camera position + scale as a unit) is distinct from clip-level scale. Zoom operates on the virtual camera, not individual clips.

## Easing / Interpolation Types

| Type | Use Case | Model Representation |
|------|----------|---------------------|
| Linear | Mechanical movement | `{ type: 'linear' }` |
| Ease-In | Acceleration | `{ type: 'ease-in' }` |
| Ease-Out | Deceleration | `{ type: 'ease-out' }` |
| Ease-In-Out | S-curve, general purpose | `{ type: 'ease-in-out' }` |
| Spring | Camera zoom, organic motion | `{ type: 'spring', stiffness, damping, mass }` |
| Hold | Instant jump, no tween | `{ type: 'hold' }` |
| Bezier (future) | Custom curves | `{ type: 'bezier', x1, y1, x2, y2 }` |

Spring is the default for zoom/camera. Named presets (ease-in/out) are the default for property animations. Bezier is a future power-user feature.

### Keyframe Model Gaps (Validated Against Lottie/Remotion)

The `KeyframeTrack` must include fields validated against Lottie and Remotion's schemas:
- **Per-segment easing** — each segment between keyframes can have its own curve (not one easing per track)
- **Cubic bezier points** — `[x1, y1, x2, y2]` for custom easing curves
- **Hold flag** — `hold: boolean` for instant value jumps (step keyframes)
- **Extrapolation policy** — `extrapolateLeft: 'clamp' | 'extend'`, `extrapolateRight: 'clamp' | 'extend'` — what happens before first / after last keyframe
- **Multi-dimensional values** — position needs `[x, y]`, not scalar. The `value` field must support arrays.

## Text Animation Patterns

| Pattern | Technique | Use Case |
|---------|-----------|----------|
| Typewriter | Per-character opacity keyframes, staggered by N frames | Code demos, terminal |
| Fade words | Per-word opacity with stagger | Captions, quotes |
| Slide in | Position keyframe from off-screen, ease-out | Titles, headings |
| Scale pop | Scale from 0→1 with spring overshoot | Emphasis, callouts |
| Lower thirds | Two-layer (text + bg shape), synced entrance/exit | Speaker names, labels |

Lower thirds follow Apple Motion's pattern: a text layer + background shape layer, each with independent entrance/exit animations, composed as a single template.

### Text Animation in PixiJS (Validated)

PixiJS v8 has first-class support via `SplitText` / `SplitBitmapText`:
- `SplitText`: Canvas-rendered Text per character — flexible but heavier
- `SplitBitmapText`: GPU-atlas-based per character — **preferred for performance**
- Both expose `.chars[]`, `.words[]`, `.lines[]` as animatable display objects

```typescript
const split = new SplitBitmapText({ text: 'Hello', style: { fontSize: 32 } });
split.chars.forEach((char, i) => {
  char.alpha = clamp((frame - i * 3) / 10, 0, 1); // staggered fade
});
```

Use `SplitBitmapText` for preview and export. Only use `SplitText` when `tagStyles` (styled runs) are needed.

## Component Architecture (planned)

```
MotionTab (orchestrator)
├── MotionPresetLibrary        — Browse/search preset templates
├── KeyframeTimeline           — Visual keyframe strip per clip
│   ├── KeyframeTrack          — One row per animated property
│   └── KeyframeDiamond        — Draggable keyframe marker
├── PropertyInspector          — Edit selected keyframe values
│   ├── EasingPicker           — Choose interpolation type
│   └── SpringConfigurator     — Tension/friction/mass sliders
├── AutoZoomPanel              — Configure auto-zoom generation
│   ├── ClickEventList         — Review detected clicks
│   └── ZoomPreview            — Mini-preview of zoom path
└── TextAnimationEditor        — Configure text entrance/exit/style
```

## File Map (planned)

```
packages/effect-registry/src/
  interpolation.ts             — Easing functions + spring solver
  spring-solver.ts             — Damped harmonic oscillator math
  keyframe-sampler.ts          — Bake spring/bezier to frame array (for export)

packages/timeline-engine/src/
  auto-zoom.ts                 — Click clustering + zoom keyframe generation
  keyframe-operations.ts       — Add/remove/move keyframes on clips

apps/desktop/src/renderer/features/motion/
  MotionTab.tsx                — Top-level tab orchestrator
  MotionPresetLibrary.tsx      — Preset browser grid
  KeyframeTimeline.tsx         — Visual keyframe editing strip
  PropertyInspector.tsx        — Per-keyframe value editor
  SpringConfigurator.tsx       — Spring physics sliders with live preview
  AutoZoomPanel.tsx            — Auto-zoom configuration
  TextAnimationEditor.tsx      — Text animation templates
```

## Implementation Order

1. **Spring solver** — Pure math in effect-registry, fully testable
2. **Interpolation functions** — Linear, ease-in/out, spring evaluation at frame N
3. **Auto-zoom generation** — Click data → zoom keyframes algorithm
4. **Keyframe model types** — Add Keyframe, KeyframeTrack to project-model
5. **Motion preset schema** — MotionPreset type with phases
6. **KeyframeTimeline component** — Visual editing strip
7. **SpringConfigurator** — Sliders with live preview curve
8. **Preset library** — Browse and apply presets
9. **Text animation templates** — Lower thirds, typewriter, etc.
10. **Keyframe sampler** — Bake to arrays for export pipeline

## Safety Rules

- **Springs must be sampled to frame arrays for export** — never run physics in the export pipeline
- **Preset application is a one-shot factory** — generates keyframes, does not create a live reference
- **All keyframe times are frame numbers** — no milliseconds in the model
- **Interpolation math must be pure functions** — testable without DOM or PixiJS
- **Don't expose a full graph editor for MVP** — behavior presets with param overrides is the ceiling
- **Auto-zoom must handle edge cases** — clicks near screen edges, rapid double-clicks, very short recordings

## What NOT to Do

- Don't store spring state (velocity, position) in the project model (it's computed at render time)
- Don't use CSS transitions for preview animations (use PixiJS ticker + spring solver)
- Don't build a full After Effects graph editor (out of scope)
- Don't put interpolation math in React components (it lives in effect-registry)
- Don't make presets "live" references in clips (they're factories that produce keyframes)
- Don't mix auto-zoom logic with manual keyframe logic (separate algorithms, shared model)

## References

- Screen Studio: spring physics with tension/friction/mass controls
- Remotion: `spring()` API with stiffness/damping/mass + `interpolate()` with easing
- ScreenFlow: Action bar model (two-keyframe segments with ease presets)
- Camtasia: Behaviors with In/During/Out phases + SmartFocus auto-zoom
- Apple Motion: Behaviors + keyframes hybrid, text sequence animations
- Lottie: Per-keyframe cubic bezier handles, frame-based timing
- spring-easing: Bake spring physics to keyframe arrays for non-physics renderers
