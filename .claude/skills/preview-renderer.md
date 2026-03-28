---
name: preview-renderer
description: Preview renderer / compositor — PixiJS GPU-accelerated real-time compositing, layer stack, zoom/pan transforms, cursor effects, video texture management, scrubbing. Auto-activates when working on the preview canvas, compositor, or PixiJS rendering.
triggers:
  - PreviewCompositor
  - PreviewCanvas
  - PixiJS
  - pixi
  - compositor
  - render
  - canvas
  - video-texture
  - scrub
  - layer-stack
  - cursor-effect
  - background-render
---

# Preview Renderer — Architectural Context

## Overview

The preview renderer is a GPU-accelerated PixiJS compositor that displays the composed output at the current playhead frame. It handles multi-layer compositing (background + screen recording + camera + annotations + cursor), zoom/pan transforms, effect application, and interactive scrubbing. It lives in `@rough-cut/preview-renderer` and is a standalone class that subscribes to the store.

## Industry Patterns (Research-Based)

### The Canonical Layer Stack

Every screen recording editor composites the same layer order (bottom to top):

1. **Background** — Synthetic: gradient, solid color, wallpaper image, pattern. No video decoding.
2. **Screen recording** — Video texture with padding, corner radius, shadow, inset. Zoom/pan transform applied here.
3. **Device frame** — Optional PNG/SVG overlay (iPhone, MacBook, browser chrome mockup) with transparent screen cutout.
4. **Camera overlay** — Separate video texture, positioned/sized/shaped (circle, rounded rect).
5. **Annotations** — Shapes, text, arrows, callouts. Vector/raster objects from metadata.
6. **Cursor** — From cursor metadata track (not burned into video). Highlight, ripple, trail effects.
7. **Captions** — Text overlay at bottom, from caption track.

### The Core Interface

The canonical interface between timeline/playhead and preview:

```typescript
compositor.render(frameNumber: number): void
```

This function:
1. Queries active clips at `frameNumber` (timeline engine)
2. Computes per-clip state via keyframe interpolation (position, scale, opacity, effects)
3. Seeks video textures to their source frame
4. Composites all layers in z-order to the canvas

Scrubbing = calling this function repeatedly as the playhead moves.

### Zoom = Affine Transform

Zoom effects are NOT a special rendering mode. They are a `scale + translate` affine transform on the screen recording sprite per-frame:
- Interpolate between keyframes to get current zoom level + center
- Set `sprite.scale.set(zoomLevel)` and `sprite.position.set(-centerX * zoomLevel, -centerY * zoomLevel)`
- Container mask clips to canvas bounds

### Video Texture Seeking — The #1 Performance Bottleneck

**CRITICAL: PixiJS v8 multi-video bug (#10827)** — When 2+ `VideoSource` instances seek simultaneously, performance degrades severely. This is an open, unfixed issue. Do NOT use multiple `VideoSource` instances for timeline scrubbing.

**Correct architecture**: Use WebCodecs `VideoDecoder` for frame-accurate seeking, then upload decoded frames to PixiJS as `ImageBitmap` textures:

1. Parse video container for keyframe index (using mp4box.js or FFmpeg)
2. Seek to nearest keyframe before target frame
3. Feed encoded chunks to `VideoDecoder`
4. Discard decoded frames until target timestamp
5. Convert `VideoFrame` to `ImageBitmap` via `createImageBitmap(videoFrame)`
6. Upload to PixiJS `Texture.from(imageBitmap)`
7. **CRITICAL: Call `videoFrame.close()`** — leaked VideoFrames cause GPU memory exhaustion

WebCodecs is production-ready in Electron (Chromium ships H.264 support). This bypasses the HTMLVideoElement seeking bottleneck entirely.

**Fallback for simple cases**: Single-video preview can still use `VideoSource` with `requestVideoFrameCallback`. Only multi-video scrubbing needs WebCodecs.

### Cursor Effects Are a Separate Render Pass

Cursor coordinates are metadata, not video pixels. At render time:
1. Read cursor position at current frame from metadata track
2. Draw overlay effects:
   - **Highlight circle**: Colored ring at cursor position
   - **Click ripple**: Expanding ring animated from click event timestamp
   - **Spotlight**: Darken everything except cursor area (multiply blend + elliptical cutout)
   - **Trail**: Line of previous N positions with decreasing opacity
   - **Magnifier**: Zoomed circle around cursor position

These are PixiJS Graphics/Sprite operations driven by cursor metadata.

### Aspect Ratio = Canvas Size + Padding Model

Screen Studio's approach (cleanest): Canvas is fixed at output aspect ratio (16:9, 9:16, 1:1). Screen recording is inset with padding. Camera is a floating overlay. Background fills the canvas. No letterboxing — the recording is a padded layer within the canvas.

### Background Types (Corrected)

Screen Studio's background is a synthetic layer (gradient/wallpaper/solid/image) rendered AROUND the recording with padding. It does NOT blur the screen content by default. An optional "Content-Aware" mode can use a heavily blurred duplicate of the recording as background, but this is not the default. Rough Cut should implement synthetic backgrounds first, content-aware blur as a future enhancement.

### Preview vs Export: Same Math, Different Renderers

From Remotion, Diffusion Studio, and Rough Cut's own architecture:
- **Shared**: Keyframe interpolation math, effect parameter computation, layer ordering
- **Different**: Preview uses PixiJS (GPU, real-time, may skip frames). Export uses frame-by-frame headless rendering (deterministic, full quality, every frame).
- **NEVER reuse the preview renderer for export** (architecture principle §3)

## Canonical Constraints

From the project constitution:

1. **UI does NOT own rendering logic** (§2) — PreviewCompositor is a standalone class. A thin `PreviewCanvas` React component hosts the canvas element and manages lifecycle, but contains NO rendering logic.

2. **Preview and Export are different pipelines** (§3) — They share interpolation math and effect definitions, but rendering implementations are independent.

3. **Frame-based** (§4) — Compositor.render() takes an integer frame number.

4. **Effects are data, not code** (§7) — EffectInstance is a param bag. Rendering logic lives in EffectDefinition registry.

5. **Lifecycle seam checklist** — Create compositor in mount effect, store in ref. Expose `ready` flag. Buffer state until ready. Wire store subscriptions only after readiness.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  @rough-cut/preview-renderer                     │
│                                                  │
│  PreviewCompositor                               │
│  ├── pixi.Application (WebGL/WebGPU)             │
│  ├── BackgroundLayer (Container)                 │
│  │   └── Gradient/Color/Image sprite             │
│  ├── RecordingLayer (Container)                  │
│  │   ├── VideoSprite (from HTMLVideoElement)      │
│  │   ├── CornerRadius mask                       │
│  │   ├── Shadow filter                           │
│  │   └── ZoomTransform (scale + translate)       │
│  ├── DeviceFrameLayer (Container)                │
│  │   └── Frame PNG sprite with screen mask       │
│  ├── CameraLayer (Container)                     │
│  │   ├── VideoSprite (webcam feed)               │
│  │   └── Shape mask (circle/rounded-rect)        │
│  ├── AnnotationLayer (Container)                 │
│  │   └── Shape/Text/Arrow sprites per annotation │
│  ├── CursorLayer (Container)                     │
│  │   ├── CursorSprite (custom cursor image)      │
│  │   ├── HighlightGraphics                       │
│  │   └── ClickRippleGraphics                     │
│  └── CaptionLayer (Container)                    │
│      └── Text sprites from caption track         │
│                                                  │
│  render(frame: number)                           │
│  ├── Resolve active clips at frame               │
│  ├── Interpolate keyframes → current values      │
│  ├── Seek video textures                         │
│  ├── Apply transforms + effects                  │
│  └── pixi.renderer.render(stage)                 │
└─────────────────────────────────────────────────┘
```

## PixiJS Filter Pipeline

Filters attach via `.filters` array on any Container/Sprite. Applied in array order. Each filter renders to a temporary framebuffer, then passes to next filter (ping-pong).

Relevant built-in filters for screen recording:
| Filter | Use Case |
|--------|----------|
| `DropShadowFilter` | Shadow behind recording clip |
| `BlurFilter` | Background blur, privacy blur |
| `KawaseBlurFilter` | Efficient blur for large radii |
| `MotionBlurFilter` | Cursor/scroll motion blur |
| `ZoomBlurFilter` | Zoom transition effect |
| `GlowFilter` | Cursor highlight glow |
| `ColorMatrixFilter` | Brightness, contrast, saturation |

Custom GLSL shaders for: corner radius masking, spotlight effect, click ripple animation.

## File Map

```
packages/preview-renderer/src/
  preview-compositor.ts        — Main compositor class
  layers/
    background-layer.ts        — Gradient/color/image background
    recording-layer.ts         — Screen recording with transforms
    camera-layer.ts            — Webcam overlay with shape mask
    cursor-layer.ts            — Cursor effects from metadata
    annotation-layer.ts        — Shapes, text overlays
    caption-layer.ts           — Subtitle rendering
    device-frame-layer.ts      — Device mockup overlay
  effects/
    zoom-transform.ts          — Zoom/pan affine transform
    corner-radius.ts           — Rounded corner masking
    spotlight-shader.ts        — Cursor spotlight GLSL
    click-ripple.ts            — Animated click effect
  video-texture-manager.ts     — Seek management, frame caching
  playback-controller.ts       — RAF loop, frame timing

apps/desktop/src/renderer/
  PreviewCanvas.tsx            — Thin React adapter (lifecycle only)
```

## Implementation Order

1. **PreviewCompositor shell** — PixiJS Application, stage, render loop
2. **BackgroundLayer** — Gradient/solid/image rendering
3. **RecordingLayer** — Video texture + basic transform
4. **ZoomTransform** — Scale + translate from zoom keyframes
5. **CameraLayer** — Webcam overlay with shape masking
6. **CursorLayer** — Basic cursor rendering from metadata
7. **CornerRadius + Shadow** — Visual polish on recording layer
8. **Cursor effects** — Highlight, ripple, spotlight
9. **AnnotationLayer** — Shapes, text
10. **DeviceFrameLayer** — Mockup overlay
11. **CaptionLayer** — Subtitle rendering
12. **Video seek optimization** — requestVideoFrameCallback, caching

## Safety Rules

- **PreviewCompositor must NOT be imported by UI code** — use store + PreviewCanvas adapter
- **Never reuse preview renderer for export** — separate pipeline
- **Handle video seek failures gracefully** — show last valid frame, don't crash
- **Dispose PixiJS resources on unmount** — textures, filters, render targets
- **Buffer state until compositor is ready** — setProject() before init() must not crash
- **All PixiJS imports stay in preview-renderer package** — never leak to other packages

## What NOT to Do

- Don't put PixiJS code in React components (use the adapter pattern)
- Don't import PixiJS outside of `@rough-cut/preview-renderer`
- Don't reuse the preview renderer for export
- Don't assume video seeks are instant (they're async, may be slow)
- Don't render cursor effects from video pixels (use metadata track)
- Don't hardcode effect logic (use the effect registry)
- Don't send video frame data over standard IPC (use SharedArrayBuffer for export)
