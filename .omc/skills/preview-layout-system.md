---
id: preview-layout-system
name: Preview Layout System
description: Complete guide for the preview card's visual output — template layouts (NormalizedRect architecture), drag/resize interaction, camera shape controls, content aspect ratio fitting, and background styling. Covers everything that affects how the Record tab preview looks.
source: conversation + research
triggers:
  - "preview layout"
  - "template layout"
  - "preview card"
  - "camera shape"
  - "drag resize"
  - "content stretching"
  - "preview stretching"
  - "normalized rect"
  - "screen region"
  - "camera region"
  - "background styling"
  - "preview background"
  - "aspect ratio fitting"
quality: high
---

# Preview Layout System

## Industry Reference (Focusee / Screen Studio)

Both apps treat the preview as a **layout container with multiple media regions**, not as one child filling the whole card.

### Focusee
- Camera Layout panel has 6 layout thumbnails (schematic icons)
- Users can place camera "in a corner, alongside, behind, or overlaid on the screen content"
- **Adjust Layout** mode: drag and drop camera feed and screen recording to change position and size
- Camera shape: circle, rectangle, adjustable corner roundness
- Aspect ratio: 4 buttons (16:9, 4:3, 1:1, 9:16) — separate from layout
- Background: gradient presets, color picker, image upload — separate from layout

### Screen Studio
- **Layouts timeline** for dynamic camera layouts per segment
- Camera modes: Fullscreen, Default (PIP), Hidden
- Camera position: four corner presets, adjustable roundness
- Aspect ratio: segmented control above canvas (Auto, Wide, Vertical, Square, Classic, Tall)
- Background: wallpaper, gradient, color, image — separate section

### Key Pattern
Every layout preset resolves to **two rectangles** inside the preview canvas: `screenRect` and `cameraRect`, plus z-order and visibility. Templates define defaults; user edits override with stored offsets/sizes.

## Architecture: NormalizedRect Model

### Core Types

```typescript
// 0–1 coordinate space, converted to CSS % at render time
type NormalizedRect = { x: number; y: number; w: number; h: number };

type LayoutKind = 'FULL_SCREEN' | 'PIP' | 'SPLIT_VERTICAL' | 'SPLIT_HORIZONTAL' | 'CAMERA_ONLY';

interface LayoutTemplate {
  id: string;
  label: string;
  description: string;
  kind: LayoutKind;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3';
  screenRect: NormalizedRect | null;
  cameraRect: NormalizedRect | null;
  zOrder: 'screen-above' | 'camera-above';
}
```

### Helper: toCssRect
```typescript
function toCssRect(r: NormalizedRect): CSSProperties {
  return {
    position: 'absolute',
    left: `${r.x * 100}%`,
    top: `${r.y * 100}%`,
    width: `${r.w * 100}%`,
    height: `${r.h * 100}%`,
  };
}
```

### PreviewCard Component Structure

```
PreviewCard (position: relative, aspect-ratio from template)
  ├── Layer 1 — Background canvas (gradient/color, ALWAYS visible)
  │     └── Layer 2 — Content frame (inset: padding, borderRadius, shadow, border)
  │           ├── Screen region (toCssRect(screenRect), z-index)
  │           │     └── <LivePreviewVideo> or compositor canvas or placeholder
  │           └── Camera region (toCssRect(cameraRect), z-index, shape)
  │                 └── webcam video or placeholder
```

### DOM Structure (confirmed from research 2026-03-29)

```
CardCanvas (aspect-ratio from template, gradient background)
  └── RegionBox (bounding box from NormalizedRect, flex centering)
        └── MediaFrame (maintains CONTENT's native aspect ratio, carries shadow/radius/border)
              └── MediaViewport (overflow:hidden, clips content)
                    └── ScreenContent or CameraContent (video/canvas/placeholder)
```

- **CardCanvas** = output canvas. Aspect ratio from template. Gradient bg.
- **RegionBox** = bounding box from NormalizedRect. Does NOT force dimensions on content. Just allocates space + centers.
- **MediaFrame** = the visible rounded rectangle. Maintains CONTENT's native aspect ratio (e.g. 16:9 for screen, 4:3 for camera). Carries shadow, border-radius, border. NEVER has a background behind the recording.
- **MediaViewport** = clips content inside the frame. Zoom/crop transforms go here.

**Golden rule: NO background behind the recording. Effects (shadow, radius, mask) go on the MediaFrame layer.**

### Content Fitting (CRITICAL — Focusee/Screen Studio behavior)

**Confirmed behavior from research (2026-03-29):**
- Default: **contain + centered**. Recording keeps its aspect ratio, scaled to fit inside region.
- Gaps show the **canvas background** (gradient/wallpaper/color) — NOT black, NOT per-region color.
- **No letterboxing with black bars.** Gaps are the project's chosen gradient, which is a design feature.
- Padding > 0 = more gradient visible around content. Padding = 0 = content touches region edges.
- No per-region "fit mode" toggle. One model: scale uniformly, padding + crop decide what's visible.
- User can move toward "cover" by reducing padding to 0 or applying crop.

**Implementation rules:**
1. Region backgrounds must be **transparent** — gradient from Layer 1 shows through gaps
2. Content frame (Layer 2) background: **transparent** when content exists, dark tint only for empty state
3. Video: `object-fit: contain; object-position: center;` — browser handles scaling
4. Canvas (PixiJS): compute contain-fit rect manually (object-fit doesn't work on canvas), center with grid
5. Placeholders: fill the region entirely

**For `<video>` elements:**
```css
.region { background: transparent; overflow: hidden; }
.region > video { display: block; width: 100%; height: 100%; object-fit: contain; object-position: center; }
```

**For `<canvas>` (PixiJS compositor):**
```css
.region { background: transparent; overflow: hidden; display: grid; place-items: center; }
```
```js
const nativeAspect = 16 / 9;
const w = region.clientWidth, h = region.clientHeight;
const boxAspect = w / h;
let drawW, drawH;
if (boxAspect > nativeAspect) { drawH = h; drawW = h * nativeAspect; }
else { drawW = w; drawH = w / nativeAspect; }
canvas.style.width = `${drawW}px`;
canvas.style.height = `${drawH}px`;
// ResizeObserver to recompute on region resize
```

### Card Sizing (bounding box)

Both Focusee and Screen Studio constrain the preview card to a central pane. Vertical (9:16) does NOT fill full height — same visual weight as landscape.

```tsx
// Bounding box: all aspect ratios stay within reasonable bounds
maxWidth: 900,
maxHeight: 560,
aspectRatio: cssAspectRatio,
width: '100%',
```

- 16:9: width-limited (900×506)
- 9:16: height-limited (315×560)
- 1:1: min of both (560×560)
- 4:3: height-limited at 560

### Camera Shape

The camera region's `borderRadius` comes from `CameraPresentation.shape`:

| Shape | borderRadius | aspectRatio constraint |
|-------|-------------|----------------------|
| `circle` | `50%` | `1` (force square) |
| `rounded` | `12px` (or from `roundness` 0-100) | none |
| `square` | `0` | none |

For PIP kind: camera region needs `aspect-ratio: 1` when shape is `circle` to prevent ellipse.

Props needed on PreviewCard: `cameraShape: CameraShape` from `CameraPresentation`.

### Drag-to-Move (Future)

Pattern from Focusee: presets define default positions, user edits override.

```typescript
type InstanceLayout = {
  templateId: string;
  screenRect?: NormalizedRect;  // override
  cameraRect?: NormalizedRect;  // override
};

function resolveRect(base: NormalizedRect | null, override?: NormalizedRect): NormalizedRect | null {
  return override ?? base ?? null;
}
```

Implementation:
1. `onMouseDown` on region → start tracking
2. Convert pixel delta to normalized delta: `dx / containerWidth`, `dy / containerHeight`
3. Clamp to 0–1 bounds
4. Update instance rect via callback
5. Store override in RecordTab state (not project model — ephemeral UI state)

### Resize Handles (Future)

Add 4 corner + 4 edge handles to each region. On drag:
1. Determine which edge/corner is being dragged
2. Compute new rect from delta
3. Enforce minimum size (e.g., 0.1 × 0.1)
4. Clamp to container bounds
5. Update instance rect

## Background Styling

Independent from layout (Focusee/Screen Studio pattern).

### BackgroundConfig Type
```typescript
interface BackgroundConfig {
  bgColor: string;
  bgGradient: string | null;
  bgPadding: number;        // 0-200px
  bgCornerRadius: number;   // 0-40px
  bgInset: number;          // 0-20px border width
  bgInsetColor: string;     // border color
  bgShadowEnabled: boolean;
  bgShadowBlur: number;     // 0-50px
}
```

### Render Rules
- Background (gradient/color) renders on the outer div — ALWAYS visible, even without a source
- Content frame renders inside with padding as `inset`, applies borderRadius, boxShadow, border
- Content frame background: transparent when content active, dark `rgba(5,5,5,0.88)` when empty

### Default Background
```typescript
const DEFAULT_BACKGROUND: BackgroundConfig = {
  bgColor: '#4a1942',
  bgGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  bgPadding: 40,
  bgCornerRadius: 12,
  bgInset: 0,
  bgInsetColor: '#ffffff',
  bgShadowEnabled: true,
  bgShadowBlur: 20,
};
```

## Current Presets

| Template | Kind | aspectRatio | screenRect | cameraRect |
|----------|------|-------------|-----------|------------|
| Screen Only | FULL_SCREEN | 16:9 | {0,0,1,1} | null |
| Screen + Camera | PIP | 16:9 | {0,0,1,1} | {0.72,0.70,0.24,0.26} |
| Screen + Camera (Left) | PIP | 16:9 | {0,0,1,1} | {0.04,0.70,0.24,0.26} |
| Presentation | SPLIT_HORIZONTAL | 16:9 | {0.38,0,0.62,1} | {0,0,0.36,1} |
| Tutorial | PIP | 16:9 | {0,0,1,1} | {0.72,0.70,0.24,0.26} |
| Standard (4:3) | FULL_SCREEN | 4:3 | {0,0,1,1} | null |
| Social Vertical | SPLIT_VERTICAL | 9:16 | {0,0,1,0.5} | {0,0.52,1,0.48} |
| Talking Head | SPLIT_VERTICAL | 1:1 | {0,0.52,1,0.48} | {0,0,1,0.50} |

## Key Files

| File | Purpose |
|------|---------|
| `apps/desktop/src/renderer/features/record/templates.ts` | LayoutTemplate type, NormalizedRect, toCssRect, LAYOUT_TEMPLATES presets |
| `apps/desktop/src/renderer/features/record/PreviewCard.tsx` | Multi-region layout container, background styling |
| `apps/desktop/src/renderer/features/record/RecordTemplatesPanel.tsx` | Template selector grid with schematic thumbnails |
| `apps/desktop/src/renderer/features/record/RecordTab.tsx` | Wires activeTemplate + screenNode + cameraNode + background to PreviewCard |
| `apps/desktop/src/renderer/features/record/RecordRightPanel.tsx` | Inspector with template handler + background panel |
| `apps/desktop/src/renderer/features/record/RecordBackgroundPanel.tsx` | Background controls UI |
| `apps/desktop/src/renderer/features/record/RecordCameraPanel.tsx` | Camera shape/position/size controls |
| `apps/desktop/src/renderer/features/record/LivePreviewVideo.tsx` | Screen capture video element |
| `apps/desktop/src/renderer/features/record/PreviewStage.tsx` | Centering wrapper (maxHeight: 100% for portrait) |
| `apps/desktop/src/renderer/hooks/use-compositor.ts` | Compositor canvas for playback mode |

## Known Issues (as of 2026-03-29)

1. **Content stretching** — Compositor canvas stretches to fill region instead of letterboxing. Need `object-fit: contain` pattern on canvas wrapper.
2. **Camera shape not wired** — RecordCameraPanel controls `CameraPresentation.shape` but PreviewCard doesn't receive it. Camera always renders as circle in PIP.
3. **No drag/resize** — Regions are fixed to template positions. User cannot adjust.
4. **Vertical overflow** — Portrait (9:16) cards can exceed container height. PreviewStage has `maxHeight: 100%` fix but needs testing.
5. **Thumbnail/preview consistency** — Thumbnails use same `toCssRect` but camera circle vs PIP aspect-ratio logic isn't mirrored in thumbnails.

## Rules

1. Background styling is INDEPENDENT from template layout — templates do NOT set backgrounds
2. Templates define layout presets (screenRect + cameraRect). Drag/resize creates instance overrides.
3. Content inside regions must NEVER stretch — always use object-fit: contain pattern
4. Camera shape comes from CameraPresentation, not from the template
5. All temporal values in frames, not milliseconds (project constitution)
6. Preview is ephemeral UI state during recording — only EffectInstances written to clips at stop-time enter the project model
