---
name: effect-system
description: Effect system — effect registry pattern, PixiJS filters, cursor effects, background effects, device frames, color grading, parameterized effects with keyframes. Auto-activates when working on effects, filters, or the effect registry.
triggers:
  - EffectRegistry
  - EffectDefinition
  - EffectInstance
  - effect-registry
  - filter
  - cursor-effect
  - device-frame
  - chroma-key
  - color-correction
  - drop-shadow
  - corner-radius
  - blur
  - spotlight
---

# Effect System — Architectural Context

## Overview

The effect system is a registry-based pattern where effect instances in the project model are inert parameter bags, and rendering logic lives in EffectDefinition objects in the registry. This separation keeps the project model serializable while allowing effects to be rendered differently in preview (PixiJS filters) and export (Canvas2D/CPU).

## Industry Patterns (Research-Based)

### Effect Category Taxonomy (synthesized across all tools)

| Category | Sub-types | Scope |
|----------|-----------|-------|
| **Background/Canvas** | Gradient, Solid, Wallpaper/Image, Pattern | Per-project |
| **Frame/Layout** | Padding, Inset, Corner Radius, Shadow, Reflection | Per-clip or per-project |
| **Color Grading** | Brightness, Contrast, Saturation, Hue, ColorMatrix | Per-clip |
| **Chroma/Matte** | Green screen, Luma matte, Remove Color | Per-clip |
| **Blur/Focus** | Gaussian, Tilt-shift, Region mask, Zoom blur, Privacy blur | Per-clip or per-region |
| **Cursor FX** | Highlight ring, Click ripple, Spotlight, Magnifier, Trail, Rings | Per-recording |
| **Device Frame** | iPhone, MacBook, iPad, Browser chrome mockup | Per-clip or per-project |
| **Annotations** | Shapes, Arrows, Text, Callout bubbles | Separate timeline clips |
| **Motion** | Motion blur, 3D tilt, Entrance/exit behaviors | Per-clip |
| **Compositing** | Blend modes (Multiply, Screen, Overlay...), Opacity | Per-clip |

### Parameterization UI Primitives

Every tool converges on the same UI patterns:
- **Slider**: Continuous numeric (opacity, blur radius, shadow distance)
- **Color picker**: Hex + eyedropper (shadow color, highlight color)
- **Dropdown**: Discrete choices (blend mode, cursor style, easing type)
- **Toggle**: Boolean (shadow on/off, effect enabled/disabled)
- **Region handle**: Spatial params on canvas (blur region, callout area)
- **Expandable section**: Per-effect collapsible panel in inspector

### Effect Stacking

Effects applied as an ordered array per clip. Order matters — each effect processes the output of the previous one. This maps directly to PixiJS `.filters` array.

Camtasia and ScreenFlow both allow reordering effects by drag in the inspector panel.

### Cursor Effects (from Camtasia + FocuSee)

Cursor data is stored as a metadata track (position, click events), NOT burned into video pixels. Effects are composited at render time:

| Effect | Parameters | Visual |
|--------|-----------|--------|
| Highlight | size, color, opacity | Colored ring following cursor |
| Click Ripple | color, size, fadeSpeed | Expanding ring on mouse-down |
| Spotlight | size, intensity, darkOpacity | Dims surroundings, bright circle at cursor |
| Magnifier | size, zoomLevel | Zoomed circle at cursor position |
| Trail | length, opacity, color | Line of previous N positions |
| Click Sound | style, volume | Audio effect on click events |
| Auto-hide | idleTimeout | Hide cursor after N frames idle |

Camtasia's "Always on Top" setting elevates cursor above all other layers.

### Device Frame Implementation

Device frames are PNG/SVG assets with transparent screen cutouts:
1. Recording sprite scaled/positioned to fit screen area bounds (from frame metadata)
2. Device frame PNG composited as overlay on top
3. In PixiJS: recording as `Sprite` → device frame as overlaid `Sprite` → both in `Container`

### PixiJS Filter Pipeline

Filters attach via `.filters` array on any Container/Sprite:
- Applied in array order (ping-pong framebuffer rendering)
- All framebuffers use premultiplied alpha
- Custom GLSL shaders via `new Filter({ glProgram: ... })`

Relevant pixi-filters for screen recording:

| Filter | Parameters | Use Case |
|--------|-----------|----------|
| `DropShadowFilter` | alpha, angle, blur, color, distance | Shadow behind clip |
| `BlurFilter` | strength, quality, kernelSize | Background blur, privacy |
| `KawaseBlurFilter` | blur, quality, clamp | Efficient large-radius blur |
| `MotionBlurFilter` | velocity, kernelSize | Cursor/scroll motion blur |
| `ZoomBlurFilter` | center, innerRadius, strength | Zoom transition effect |
| `GlowFilter` | distance, strength, color | Cursor highlight glow |
| `ColorMatrixFilter` | 5×4 matrix | Brightness, contrast, saturation |
| `PixelateFilter` | size | Privacy pixelation |
| `OutlineFilter` | thickness, color | Shape outlines |

PixiJS v8 blend modes: NORMAL, ADD, MULTIPLY, SCREEN, OVERLAY, DARKEN, LIGHTEN, COLOR_DODGE, COLOR_BURN, HARD_LIGHT, SOFT_LIGHT, DIFFERENCE, EXCLUSION, HUE, SATURATION, COLOR, LUMINOSITY.

### Corner Radius Implementation (Validated)

**Do NOT use Graphics mask for corner radius** — it uses the stencil buffer and breaks sprite batching, degrading performance at timeline scale.

**Correct approach**: Custom GLSL fragment shader using SDF (Signed Distance Field) math:
```glsl
float roundedBox(vec2 p, vec2 b, float r) {
    vec2 d = abs(p) - b + r;
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
}
// Discard fragments outside the rounded rect
```

This avoids stencil operations entirely and runs as a single-pass filter.

### Filter Performance Budget (Validated)

Each PixiJS filter = at minimum 1 framebuffer blit. Costs stack multiplicatively:
- `ColorMatrixFilter`: ~1 pass, negligible
- `BlurFilter`: ~2 passes (H+V), noticeable at large kernels
- `DropShadowFilter`: ~3 passes (2 blurs + composite)
- Stack of all three: 5-6 passes, ~5-10ms GPU time per sprite

**Mitigation**: Preview should have a "draft mode" that skips expensive filters (shadow, blur). The effect registry should tag each effect with a `cost: 'low' | 'medium' | 'high'` field.

### Speed Ramping (Architecture-Breaking Gap)

Speed ramping (variable clip speed) requires a data model change: `Clip` must optionally carry a speed curve (or array of `{sourceFrame, timelineFrame}` pairs). The timeline engine must compute `sourceFrameAt(timelineFrame)` using this curve. This is NOT a simple effect — it changes how clips map source frames to timeline frames. Must be designed in the project model BEFORE clips are implemented.

## Canonical Constraints

From the project constitution:

1. **Effects are data, not code** (§7) — `EffectInstance` in the project model is a bag of params keyed by `effectType`. Rendering logic lives in `EffectDefinition` registry.

2. **Every effect is serializable and testable** (§9) — If you can't `JSON.stringify()` an effect's params and test its output in Vitest without a DOM, the design is wrong.

3. **Don't skip the effect registry** — Never hardcode effect logic in renderers. Always go through the registry.

4. **Preview and Export share definitions** (§3) — Same `EffectDefinition` knows how to render for both PixiJS (preview) and Canvas2D/CPU (export), but the implementations are separate methods.

5. **The project document is inert data** (§5) — No methods on EffectInstance. No class inheritance for effects. Registry pattern only.

## Data Model

```typescript
// In @rough-cut/project-model
interface EffectInstance {
  id: EffectInstanceId;
  effectType: string;           // Registry key: "blur", "dropShadow", "cornerRadius"
  enabled: boolean;
  params: Record<string, EffectParamValue>;
  order: number;                // Lower = applied first in the filter chain
}

type EffectParamValue =
  | number
  | string          // hex color, enum string
  | boolean
  | [number, number]  // vec2
  | KeyframeTrack;  // for animated params

interface KeyframeTrack {
  keyframes: Array<{
    frame: number;
    value: number;
    easing: EasingType;
  }>;
}

// In @rough-cut/effect-registry
interface EffectDefinition {
  type: string;                          // matches EffectInstance.effectType
  displayName: string;
  category: EffectCategory;
  paramSchema: ParamSchema[];            // defines UI controls per param
  defaultParams: Record<string, EffectParamValue>;
  renderPreview(params, pixi): PixiFilter;   // PixiJS filter for preview
  renderExport(params, ctx): void;            // Canvas2D for export
  interpolate(paramName, frameA, frameB, t): EffectParamValue;
}

type EffectCategory =
  | 'background' | 'frame' | 'color' | 'blur'
  | 'cursor' | 'device-frame' | 'annotation' | 'motion' | 'compositing';

interface ParamSchema {
  name: string;
  type: 'number' | 'color' | 'boolean' | 'enum' | 'vec2';
  label: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];  // for enum type
  default: EffectParamValue;
  keyframeable: boolean;
}
```

Effects live in `Clip.effects: EffectInstance[]`. The registry maps `effectType` → `EffectDefinition`.

## File Map (planned)

```
packages/effect-registry/src/
  registry.ts                  — Effect registration + lookup
  types.ts                     — EffectDefinition, ParamSchema interfaces
  interpolation.ts             — Keyframe interpolation for animated params
  effects/
    drop-shadow.ts             — DropShadow effect definition
    corner-radius.ts           — Corner radius masking
    blur.ts                    — Gaussian/Kawase blur
    color-correction.ts        — Brightness/contrast/saturation
    chroma-key.ts              — Green screen removal
    privacy-blur.ts            — Region-based pixelation/blur
    motion-blur.ts             — Motion blur from velocity data
    device-frame.ts            — Device mockup overlay
  cursor-effects/
    highlight.ts               — Cursor highlight ring
    click-ripple.ts            — Expanding click ring
    spotlight.ts               — Dim surroundings, bright cursor area
    magnifier.ts               — Zoomed lens at cursor
    trail.ts                   — Cursor trail line

packages/project-model/src/
  types/effects.ts             — EffectInstance, EffectParamValue types
```

## Effect Inspector UI Pattern

From Camtasia/ScreenFlow research, the inspector uses expandable sections:

```
EffectInspector
├── [Effect Name] ▼           — Collapsible header with enable toggle
│   ├── ParamSlider            — For numeric params
│   ├── ColorPicker            — For color params
│   ├── Toggle                 — For boolean params
│   ├── Dropdown               — For enum params
│   └── KeyframeButton (◆)     — Enable keyframing per param
├── [Effect Name] ▼
│   └── ...
├── + Add Effect               — Opens effect browser
└── Drag handles               — Reorder effects
```

## Implementation Order

1. **Registry shell** — Registration API, lookup by type
2. **EffectInstance in project model** — Types, Zod schema
3. **DropShadow effect** — First concrete definition (preview + export)
4. **CornerRadius effect** — Masking implementation
5. **Blur effect** — Gaussian blur for background/privacy
6. **ColorCorrection effect** — Brightness/contrast/saturation
7. **Cursor highlight** — First cursor effect
8. **Click ripple** — Animated cursor effect
9. **Spotlight** — GLSL shader for dim+highlight
10. **Device frames** — PNG overlay system
11. **Chroma key** — Green screen removal
12. **Effect inspector UI** — Expandable sections, param controls

## Safety Rules

- **Every effect must have both renderPreview and renderExport** — both are required
- **All params must be JSON-serializable** — no functions, no DOM references, no PixiJS objects
- **Effect order matters** — document this in the UI (lower order = applied first)
- **Keyframeable params must use KeyframeTrack** — plain numbers for static params
- **Test effects in Vitest without DOM** — use paramSchema + interpolation tests
- **Don't store PixiJS filter instances in the project model** — they're created fresh from params

## What NOT to Do

- Don't use class inheritance for effects (registry pattern only)
- Don't hardcode effect logic in renderers (always go through registry)
- Don't put rendering code in the project model
- Don't store PixiJS objects in EffectInstance
- Don't make effects that can't be JSON.stringify()'d
- Don't skip the effect registry and render effects directly
- Don't import PixiJS outside of preview-renderer (effect-registry returns filter configs, not filter instances)
- Don't add methods to EffectInstance (it's inert data)
- Don't interpolate colors in sRGB space — interpolate in linear (gamma-decoded) space, convert to sRGB at output only

## References

- Camtasia: Expandable effect sections, per-param keyframe toggles, drag reorder
- ScreenFlow: Tabbed inspector, video filters as stacked array
- PixiJS: `.filters` array pipeline, pixi-filters library
- Etro.js: KeyFrame-based animation for TypeScript effect params
- DaVinci Fusion: Node-based DAG (out of scope, but blend modes are relevant)
