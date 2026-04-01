# WebCodecs Preview & Export Pipeline

## Architecture (based on OpenScreen + Screen Studio patterns)

### Preview Path (interactive editing)
```
<video> element (browser-native decode, VP9/H.264)
  -> PixiJS VideoSource.from(video), autoUpdate: true
  -> WebGL texture (GPU compositing, zero CPU copy)
  -> Zoom/blur/effects via PixiJS containers + filters
  -> 60fps PixiJS ticker drives animation
```

**Key:** Do NOT use WebCodecs for preview. The `<video>` element handles decode
natively (hardware where available, software fallback on NVIDIA Linux). PixiJS
`VideoSource` reads the video element directly as a WebGL texture.

### Export Path (frame-accurate, full quality)
```
web-demuxer (WASM FFmpeg, ~493KB) -> demux WebM into EncodedVideoChunks
  -> WebCodecs VideoDecoder -> VideoFrame
  -> PixiJS offscreen render (same zoom/effects code as preview)
  -> new VideoFrame(canvas) -> WebCodecs VideoEncoder (H.264)
  -> mediabunny (30KB pure TS) -> MP4 output
```

### Libraries
| Library | Role | Size |
|---------|------|------|
| `web-demuxer` v4 | WASM demuxer, feeds chunks to VideoDecoder | ~493KB gzipped (mini) |
| `mediabunny` v1.25 | Pure TS muxer, writes MP4 from VideoEncoder output | ~30KB gzipped |
| PixiJS v8 | WebGL compositor for both preview and export | existing dep |

### Frame-Accurate Seeking (mediabunny)
```typescript
const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
const videoTrack = await input.getPrimaryVideoTrack()
const sink = new VideoSampleSink(videoTrack)
const frame = await sink.getSample(42.0) // seeks to keyframe, decodes forward
const vf = frame.toVideoFrame() // raw VideoFrame for WebGL texture
vf.close() // MUST close to free VRAM
```

### PixiJS VideoSource Pattern (preview)
```typescript
// Create from existing <video> element
const source = VideoSource.from(videoElement)
source.autoPlay = false
source.autoUpdate = true // PixiJS uploads texture every frame automatically
const videoTexture = Texture.from(source)
const videoSprite = new Sprite(videoTexture)
```

### Export VideoEncoder Config
```typescript
{
  codec: 'avc1.640033', // H.264 High Profile
  width, height,
  bitrate: 8_000_000,
  framerate: 30,
  latencyMode: 'quality',
  bitrateMode: 'variable',
  hardwareAcceleration: 'prefer-hardware', // hits NVENC on NVIDIA
}
```

### Webcam PiP
- **Preview:** Plain `<video>` element with CSS `border-radius: 50%`, positioned absolutely
- **Export:** `ctx.drawImage(webcamFrame, ...)` with `ctx.roundRect` clip path
- Same `computeCompositeLayout()` for both = pixel-identical output

### NVIDIA Linux Notes (verified 2026-03-31)
- **GPU:** RTX 4070 Ti, driver 580.126.09
- **Decode:** VA-API hardware decode does NOT work in Chromium/Electron on NVIDIA
- **Software VP9 decode:** ~2-8ms per frame for 1080p30 on Ryzen — well within 33ms budget
- **NVENC Encoding: CONFIRMED WORKING.** `VideoEncoder` with `hardwareAcceleration: 'prefer-hardware'`
  uses NVENC directly, independent of VA-API decode path. No special flags needed.
- **WebRtcPipeWireCamera:** MUST be disabled — PipeWire ignores getUserMedia constraints
- **PixiJS VideoSource:** `texSubImage2D` upload costs 2-8ms per 1080p frame. Works with
  software-decoded video. No known NVIDIA-specific issues.

### web-demuxer WASM in Electron
- Copy `web-demuxer-mini.wasm` (~493KB) from `node_modules/web-demuxer/dist/wasm-files/` to `public/`
- Vite config: `base: './'` for file:// compatibility in packaged app
- `file://` works — no local HTTP server needed. Chromium allows WASM from file://
- Avoid putting WASM inside asar — use extraResources or keep unpacked
- In renderer: `new WebDemuxer({ wasmFilePath: '/web-demuxer-mini.wasm' })`

### WebGL Gradient Workaround
PixiJS v8 FillGradient shaders are broken on some NVIDIA GPUs (INVALID_OPERATION).
The rough-cut compositor already uses WebGL (no `preference: 'canvas'`).
The gradient crash was in capture-studio-react, may not affect rough-cut.
If it does: use solid color rects, pre-rendered gradient canvas, or CSS gradient background.
VideoSource textures work fine with WebGL regardless.

### Existing Compositor State + Confirmed Lag Root Cause
The rough-cut `preview-compositor.ts` ALREADY uses:
- `VideoSource` from pixi.js v8.6
- `new VideoSource({ resource: video, autoPlay: false })`
- `(videoCache.texture.source as VideoSource).update()` per frame
- WebGL rendering (no Canvas2D fallback)

**CONFIRMED ROOT CAUSE OF PLAYBACK LAG (2026-03-31):**
The playback chain is:
1. `usePlaybackLoop` increments frame counter via rAF → `setPlayheadFrame(frame)`
2. `use-compositor.ts` subscribes to transportStore → calls `compositor.seekTo(frame)` every frame
3. `preview-compositor.ts seekTo()` → sets `video.currentTime = targetTime` + `.update()` per frame

This is **frame-by-frame seeking** (30 seeks/sec) instead of native `<video>.play()`.
Each seek forces a full decode cycle. Native `.play()` uses sequential decode which is 5-10x faster.

**Fix (TASK-050 reframed):**
- During continuous playback: call `video.play()` and let PixiJS `autoUpdate: true` handle textures
- Use `video.currentTime` seeking ONLY for: pause, scrub, step forward/backward
- Add `PlaybackController` mode: 'playing' (native video.play) vs 'seeking' (manual currentTime)
- Keep the rAF playhead loop for UI timeline sync, but DON'T seek the video element per-frame

**Files to modify:**
- `packages/preview-renderer/src/preview-compositor.ts` — add play/pause/autoUpdate mode
- `apps/desktop/src/renderer/hooks/use-compositor.ts` — wire play/pause to compositor
- `apps/desktop/src/renderer/hooks/use-playback-loop.ts` — stop calling setPlayheadFrame per-frame during playback; let video.currentTime drive the playhead instead

### OpenScreen Reference Files
- `VideoPlayback.tsx` — preview with PixiJS VideoSource + autoUpdate
- `streamingDecoder.ts` — web-demuxer + VideoDecoder with backpressure (queue > 24 frames)
- `frameRenderer.ts` — PixiJS offscreen export render, Texture.from(videoFrame)
- `muxer.ts` — mediabunny MP4 output (Mp4OutputFormat + EncodedVideoPacketSource)
- `videoExporter.ts` — orchestrates the export pipeline
- `compositeLayout.ts` — shared PiP layout for preview + export
- `videoEventHandlers.ts` — rAF polling for currentTime (not timeupdate events)
