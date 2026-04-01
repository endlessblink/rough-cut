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

### NVIDIA Linux Notes
- VA-API hardware decode does NOT work in Chromium/Electron on NVIDIA (2026)
- `<video>` element falls back to software decode (libvpx for VP9) — transparent
- Software VP9 1080p30 decode is feasible on modern CPUs
- NVENC hardware ENCODING works via WebCodecs `hardwareAcceleration: 'prefer-hardware'`
- WebRtcPipeWireCamera flag MUST be disabled — PipeWire ignores getUserMedia constraints

### WebGL Gradient Workaround
PixiJS v8 FillGradient shaders are broken on some NVIDIA GPUs (INVALID_OPERATION).
Use WebGL for VideoSource textures but avoid PixiJS gradient fills.
Options: solid color rects, pre-rendered gradient canvas, or CSS gradient background.

### OpenScreen Reference Files
- `VideoPlayback.tsx` — preview with PixiJS VideoSource
- `streamingDecoder.ts` — web-demuxer + VideoDecoder with backpressure
- `frameRenderer.ts` — PixiJS offscreen export render
- `muxer.ts` — mediabunny MP4 output
- `videoExporter.ts` — orchestrates the export pipeline
- `compositeLayout.ts` — shared PiP layout for preview + export
