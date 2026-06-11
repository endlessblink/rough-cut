# Compositor Migration

Date: 2026-06-10

Status: TASK-239 research note and renderer contract. This is a contract for the GPU-C lane, not an implementation plan for WebGL code in this task.

## Decision

Rough Cut should migrate toward a shared composition model that can be rendered by multiple backends: the current Canvas2D preview, a future WebGL or OffscreenCanvas preview path, and a later export path derived from the same frame plan. The migration must be staged. Until TASK-247 is complete, the existing Canvas2D preview in `apps/desktop/src/renderer/src/styled-video-preview.tsx` and the existing FFmpeg styled export path in `apps/desktop/src/main/export-service.mjs` remain available as runtime fallbacks.

The first implementation step after this note is not WebGL. TASK-240 should extract a renderer-neutral composition-frame plan from the same inputs already consumed by preview and export. TASK-241 should put the existing Canvas2D screen draw behind a renderer boundary before TASK-242 adds a feature-flagged WebGL screen-layer renderer.

## Current Sources

`styled-video-preview.tsx` is the current visual preview compositor. It drives draws from `requestVideoFrameCallback` during timeline playback, with `requestAnimationFrame` as the fallback driver. It resolves each frame with `resolveTimelinePreviewFrame` or `resolveFrame`, paints the styled background, optional alignment grid, screen shadow/inset, rounded screen video, cursor/click overlays, camera PiP, edit handles, focal target, and debug timing. It already records frame gaps, expected-display gaps, draw cost, playback quality, and canvas draw count through the playback debug bridge.

`export-service.mjs` is the current styled export compositor. `exportStyledProjectToMp4` builds either `buildSimpleStyledExportArgs` or `buildStyledExportArgs`, then runs FFmpeg. The full styled graph creates the background, derives timeline video/audio segments, optionally burns cursor/click telemetry with ASS subtitles, applies zoom `crop` plus `sendcmd`, scales/pads the screen layer, masks it with rounded alpha, adds shadow, overlays camera PiP, maps audio, and falls back from NVENC to CPU encoding when needed.

`apps/desktop/src/main/zoom-sendcmd.mjs` is the current export bridge for zoom parity. It calls `getZoomTransformAtFrame` from `@rough-cut/timeline-engine`, converts the transform into per-frame crop windows, and emits an FFmpeg `sendcmd` file. The file notes the key invariant: preview and export use the same zoom math, while export converts the result to FFmpeg crop commands.

## Platform Notes

- WebGL can use DOM pixel sources as textures. MDN documents `texImage2D` accepting `HTMLVideoElement`, `HTMLCanvasElement`, `OffscreenCanvas`, and `VideoFrame` as source objects, which is the basis for using playing video frames as GPU textures. See <https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texImage2D>.
- OffscreenCanvas is available in Web Workers and is intended to move rendering work away from the main execution thread where canvas animation can affect app performance. This supports a later worker-rendered compositor, but does not remove the need for main-thread fallback. See <https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas>.
- WebCodecs `VideoFrame` can be constructed from `HTMLVideoElement`, `HTMLCanvasElement`, `ImageBitmap`, `OffscreenCanvas`, or another `VideoFrame`. This is a plausible later bridge for frame-rendered export, not a TASK-239 or TASK-242 requirement. See <https://developer.mozilla.org/en-US/docs/Web/API/VideoFrame/VideoFrame>.
- FFmpeg `blend`, `tblend`, and `tmix` are useful references for temporal effects, and `minterpolate` is useful for interpolation experiments, but they are global stream filters. They are not precise enough for Rough Cut's parity requirement unless the screen layer is separated from cursor/click overlays first. The FFmpeg docs describe `blend` as combining two input streams, `tblend` as blending consecutive frames from one stream, and expose these as video filters. See <https://ffmpeg.org/ffmpeg-filters.html>.
- The TASK-246 `electron-headless-compositor` direction is intended to be Wayland-compatible for export rendering because it renders from project media and the shared composition-frame plan inside Rough Cut, not from live desktop capture APIs. It must not depend on X11-only APIs such as `x11grab`, `xdotool`, or global pointer queries.
- Wayland capture is a separate boundary owned by TASK-026. On native Wayland, xdg-desktop-portal/PipeWire ScreenCast can deliver a stream with the compositor-rendered cursor already present; that means future Wayland recordings may not have cursor telemetry to burn as a separate overlay. The renderer contract must therefore support both cursor sources: telemetry-driven cursor/click layers for current X11 recordings and source-video cursor pixels for future portal captures.
- Electron hidden-window rendering may have compositor-specific GPU limits on Linux. If the hidden-window renderer cannot create WebGL, cannot capture frames, or cannot encode/mux output on a given session, the runtime result must report the reason and fall back to FFmpeg styled export. That is Wayland-safe degradation, not a failure of the project direction.

## Renderer Contract

A renderer consumes one resolved composition frame and produces pixels for a known canvas/export size. It must not read mutable project state directly during draw. It receives already-resolved inputs:

- `frameIndex` and `timeSec` in composition timeline coordinates.
- Output size, source video size, source fps, and device pixel ratio if relevant.
- Background fill or image state.
- Screen layer source viewport, normalized screen frame, rounded radius, shadow, inset, crop, zoom transform, and reduced-motion state.
- Cursor and click presentation resolved at the source frame used by the screen layer.
- Camera source viewport, normalized camera frame, shape, radius, shadow, visibility, and source time.
- Gap state when no video layer exists at the current timeline frame.
- Debug options and a feature/fallback policy.

Required layer order:

1. Background gradient or image.
2. Non-export authoring aids only when in editable preview mode: alignment grid and edit handles.
3. Screen shadow and inset.
4. Screen video layer, clipped to the resolved rounded screen frame.
5. Zoom transform and any transform motion blur applied to the screen video only.
6. Click emphasis and cursor path drawn in screen-source coordinates after the screen transform, so cursor/click overlays remain sharp and are not blurred with the screen layer.
7. Cursor offscreen marker and zoom-authoring safety overlay for preview-only diagnostics.
8. Camera PiP, clipped to its resolved shape, above the screen layer.
9. Preview-only editor overlays such as camera/screen frame controls and focal target.

Parity requirements:

- Frame timing: timeline playback must remain driven by decoded video frames when available, with an rAF fallback for parked frames, non-timeline preview, and unsupported browsers.
- Gaps: a timeline gap must clear video pixels and must not keep drawing a stale screen frame. Preview-only focal controls may remain anchored to the last-known screen rect.
- Zoom math: renderer implementations must consume `getZoomTransformAtFrame` results or a frame plan produced from that same math. Export-specific crop windows may be derived from the plan, but no renderer may reimplement separate zoom easing or cursor-follow rules.
- Crops: screen and camera crops are source-space viewports before fit/cover scaling. Manual crops must clamp to source bounds.
- Layout: screen and camera frames are normalized against output canvas size and converted to pixels by the renderer. Circle camera frames must be constrained to a square before clipping.
- Rounding and masks: rounded screen and camera masks are part of the visual output contract. Pixel-perfect alpha may vary by backend, but parity probes must define and enforce a tolerance.
- Shadows and insets: styled export shadows and preview shadows may use backend-specific blur implementations, but the resolved blur radius, opacity, offset, and bounds must come from the same frame plan.
- Cursor/click placement: cursor telemetry is source-frame-based, then transformed by the active screen crop and zoom transform. Off-screen cursor state must be explicit so fallback paths do not draw invalid coordinates.
- Cursor source mode: composition frames must distinguish `telemetry-overlay` cursor rendering from `source-video` cursor pixels once Wayland portal capture lands. In `source-video` mode, export and preview should not synthesize a second cursor overlay.
- Reduced motion: reduced-motion mode disables or lowers expensive transform motion blur and must be respected by every preview renderer.
- Export parity: an export renderer may use FFmpeg, WebCodecs, or another frame pipeline later, but it must consume the same composition-frame plan and preserve audio handling. FFmpeg remains the default export backend until the GPU/headless path passes parity and live-user gates.

## Runtime Fallback Policy

Every GPU-C task before TASK-247 must keep a runtime fallback:

- Preview fallback: if WebGL or OffscreenCanvas initialization fails, if the WebGL context is lost, if performance probes exceed budget, or if a feature flag disables GPU rendering, preview must use the current Canvas2D compositor.
- Export fallback: if a future GPU/headless export path fails setup, frame rendering, encoding, muxing, or parity checks, export must use the current FFmpeg styled export path.
- The fallback must happen at runtime, not only by reverting code or changing build flags.
- The fallback path must preserve current editing and export behavior. It may report the reason, but it must not silently drop zoom, cursor, click, camera, cuts, crops, timeline segments, audio, rounded masks, background image/gradient, or aspect ratio handling.

TASK-247 is the first task allowed to retire legacy visual composition logic, and only after Canvas2D preview and FFmpeg styled export have both served as proven fallbacks through the previous tasks.

## Required Debug Surface

Future renderer implementations must expose a small, inspectable renderer status object:

```ts
type CompositorRendererDebug = {
  rendererKind: 'canvas2d' | 'webgl-screen-layer' | 'webgl-compositor' | 'headless-export';
  backendVersion?: string;
  featureFlags: Record<string, boolean>;
  webgl?: {
    requested: boolean;
    available: boolean;
    contextStatus: 'ok' | 'unavailable' | 'lost' | 'restored';
    rendererInfo?: string;
  };
  frame: {
    frameIndex: number;
    sourceFrame: number | null;
    timelineGap: boolean;
    drawCostMs: number | null;
    uploadCostMs?: number | null;
    gpuCostMs?: number | null;
  };
  parity?: {
    reportPath: string | null;
    maxPixelDelta: number | null;
    meanPixelDelta: number | null;
    tolerance: number | null;
    passed: boolean | null;
  };
  fallback: {
    active: boolean;
    reason: string | null;
    from: string | null;
    to: 'canvas2d' | 'ffmpeg-styled' | null;
  };
};
```

The existing playback debug bridge should remain the preview reporting path until a replacement exists. New GPU fields should extend that report rather than creating a parallel opaque channel.

## Task Sequence Guardrail

The GPU-C lane order is intentional:

1. TASK-239: research note and renderer contract.
2. TASK-240: extract shared composition-frame plan.
3. TASK-241: add screen-layer renderer boundary with Canvas2D parity adapter.
4. TASK-242: add feature-flagged WebGL screen-layer renderer.
5. TASK-243: add WebGL-vs-Canvas parity and playback performance probes.
6. TASK-244: add velocity-based WebGL transform motion blur.
7. TASK-245: promote WebGL to full preview compositor behind fallback.
8. TASK-246: prototype GPU/headless export path from the shared composition plan.
9. TASK-247: make GPU compositor default and retire legacy visual composition logic only after the fallback gates have passed.

Do not skip the Canvas2D adapter boundary. The first WebGL task replaces only the screen video layer, keeping cursor/click overlays outside the GPU blur path until parity probes prove the split.
