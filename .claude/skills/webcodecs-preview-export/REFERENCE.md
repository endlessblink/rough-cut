# Reference: OpenScreen + Screen Studio Architecture Comparison

## Full Comparison Table

| Concern | Screen Studio (macOS) | OpenScreen (Electron) | Rough-cut (us, Linux) | Action needed |
|---|---|---|---|---|
| **Camera resolution** | Unknown (likely 720p) | **720p** ideal | 1080p | Consider 720p to reduce load |
| **Camera encoder** | MediaRecorder H.264 (VideoToolbox HW) | MediaRecorder (AV1 > H264 > VP9 > VP8) | WebCodecs H.264 (OpenH264 SW) | ✅ Our approach is more advanced |
| **Camera container** | Separate track in project package | **WebM** (fixed with fix-webm-duration) | **MP4** from mediabunny | Fix `.webm` extension bug |
| **Screen encoder** | MediaRecorder or ScreenCaptureKit | MediaRecorder (same codec as camera) | FFmpeg x11grab libvpx | ✅ Different approach, works |
| **WebM duration fix** | N/A (uses MP4 internally) | `@fix-webm-duration/fix` **before save** | **Missing entirely** | **Must add** |
| **Separate files** | Screen + camera stored separately | Screen + camera stored separately | Screen + camera stored separately | ✅ Same |
| **Preview playback** | Native `<video>` element | Native `<video>` + PixiJS VideoSource autoUpdate | `<video>` + compositor seekTo per frame | Fix: use native play() + autoUpdate |
| **Camera in preview** | Unknown | **DOM `<video>` over canvas** (not PixiJS) | DOM `<video>` in RecordTab | ✅ Same approach |
| **Camera sync** | Unknown | **150ms tolerance re-seek** | Direct store subscription + drift correction | ✅ Similar |
| **Export decoder** | MP4Box.js → VideoDecoder → VideoFrame (GPU) | web-demuxer → VideoDecoder → VideoFrame | Not implemented yet (TASK-052) | Future |
| **Export renderer** | PixiJS WebGL → `new VideoFrame(canvas)` (zero readback) | PixiJS offscreen + Canvas2D composite | Not implemented yet | Future |
| **Export encoder** | VideoEncoder H.264 (VideoToolbox HW) | VideoEncoder H.264 (prefer-hardware) | Not implemented yet (TASK-054) | Future |
| **Export muxer** | MP4Box.js / mp4-muxer | mediabunny v1.25.1 | Not implemented yet | Future |
| **Key perf insight** | Never read pixels in JS — `new VideoFrame(canvas)` | Same pattern in export renderer | N/A yet | Apply when building export |

---

## Screen Studio Deep Dive (Adam Pietrasiak's Blog)

### The Golden Rule
> "At all costs, avoid reading pixel data in JavaScript. This will take 80% of the time and will be the biggest bottleneck."

### Export Pipeline Evolution (4 iterations)

1. **Slow**: WebGL canvas → `readPixels()` → PNG → encoder. PNG conversion = 70% of time.
2. **Better**: WebGL canvas → `readPixels()` → raw stream → encoder. Eliminated PNG.
3. **Faster**: Batched `readPixels()` × 60 frames → stream. 50% speedup from GPU mode amortization.
4. **Final**: VideoDecoder → VideoFrame (GPU) → PixiJS WebGL → `new VideoFrame(canvas)` → VideoEncoder. **Zero pixel readback.** JS now waits for encoder, not the other way around.

### Performance Numbers
- `VideoDecoder` frame → WebGL texture upload: sub-millisecond
- `readPixels()` without batching: ~70% of total frame time
- Batching: ~50% speedup
- Final pipeline: encoder throughput is the bottleneck (good problem)

### Preview vs Export Split
- **Preview**: Native `<video>` with `currentTime` seeking. Simple, tolerates drops.
- **Export**: Full WebCodecs pipeline. Frame-perfect, deterministic, zero drops.

### Recording Architecture
- Screen + camera recorded as **separate raw tracks**
- Effects (zoom, cursor, background) stored as metadata — non-destructive
- "Extract raw recording files" feature confirms separate storage
- Project package = directory with thousands of chunks (40GB for 3h)

### Multi-Window (React Portals)
- Recording overlay and editor share state via React portals in same JS runtime
- No IPC serialization for video state
- RAF monkey-patched to use focused window's timing

---

## OpenScreen Deep Dive

### Camera Recording
```typescript
// getUserMedia constraints
{ width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }
// Codec priority
["video/webm;codecs=av1", "video/webm;codecs=h264", "video/webm;codecs=vp9", "video/webm;codecs=vp8"]
// Bitrate: capped at 18 Mbps for camera
```

### Screen Recording
```typescript
// Electron desktopCapturer via mandatory constraints
{ chromeMediaSource: "desktop", chromeMediaSourceId: id, maxWidth: 3840, maxHeight: 2160, maxFrameRate: 60, minFrameRate: 30 }
// Bitrate: 30.6 Mbps at 1080p (with 1.7x 60fps boost)
```

### Save Flow
1. Both recordings assembled from chunks
2. **`@fix-webm-duration/fix`** applied to both blobs before save
3. Files named: `recording-{timestamp}.webm` + `recording-{timestamp}-webcam.webm`
4. Sent to main process via IPC as ArrayBuffer
5. Main process writes to disk + creates session manifest JSON

### Playback Architecture
```typescript
// PixiJS setup
const source = VideoSource.from(video);
source.autoPlay = false;
source.autoUpdate = true;  // PixiJS polls video element every ticker frame
const videoTexture = Texture.from(source);
const videoSprite = new Sprite(videoTexture);

// Container hierarchy
app.stage → cameraContainer (zoom) → videoContainer (blur/mask) → videoSprite

// Webcam: DOM <video> element positioned over canvas (NOT PixiJS sprite)
// Sync: 150ms tolerance re-seek between screen and camera videos
```

### Export Pipeline
```
WebM file → web-demuxer (WASM) → EncodedVideoChunks
  → VideoDecoder → VideoFrame
  → FrameRenderer (PixiJS offscreen + Canvas2D for shadow/webcam)
  → new VideoFrame(canvas, { colorSpace: bt709 })
  → VideoEncoder (avc1.640033, prefer-hardware on Linux/macOS)
  → mediabunny → MP4 blob

Webcam: second StreamingVideoDecoder in parallel → AsyncVideoFrameQueue → composited in FrameRenderer
Audio: AudioDecoder → AudioEncoder (opus 128kbps)
```

### Export Encoder Config
```typescript
{
  codec: "avc1.640033",  // H.264 High Profile L5.1
  bitrate, framerate,
  latencyMode: "quality",
  bitrateMode: "variable",
  // Platform routing:
  // Linux/macOS: try prefer-hardware first, then prefer-software
  // Windows: try prefer-software first, then prefer-hardware
  keyFrame: frameIndex % 150 === 0
}
```

---

## What We Should Adopt

### Immediate (current session)
1. **Fix camera save**: save as `.mp4` in all paths (not just FFmpeg path)
2. **Add `@fix-webm-duration/fix`**: apply to screen WebM before save
3. **Camera resolution**: consider 720p like OpenScreen (reduces encode CPU by ~50%)

### Next session (TASK-050 reframed)
4. **Playback**: native `video.play()` + PixiJS `VideoSource.autoUpdate: true` (OpenScreen pattern)
5. **Camera PiP in playback**: keep as DOM `<video>` element (not PixiJS sprite)

### Future (TASK-052/054)
6. **Export pipeline**: web-demuxer → VideoDecoder → PixiJS offscreen → `new VideoFrame(canvas)` → VideoEncoder → mediabunny
7. **Zero pixel readback**: Screen Studio's key insight — never call `readPixels()`
8. **Hardware encode flags**: `AcceleratedVideoEncoder` + `VaapiOnNvidiaGPUs` for NVENC in export

---

## Linux/NVIDIA Equivalents

| macOS | Linux/NVIDIA |
|---|---|
| ScreenCaptureKit | `getDisplayMedia()` or FFmpeg x11grab |
| VideoToolbox encoder | NVENC via `AcceleratedVideoEncoder` flag or FFmpeg `h264_nvenc` |
| VideoToolbox decoder | Software (NVDEC not available via WebCodecs) |
| `new VideoFrame(canvas)` | Identical API |
| MP4Box.js demux | Identical (pure JS) |
| VideoDecoder → PixiJS `texImage2D` | Identical (WebGL) |

### Electron Flags for Maximum GPU Usage
```javascript
app.commandLine.appendSwitch('enable-features',
  'AcceleratedVideoDecodeLinuxZeroCopyGL,AcceleratedVideoDecodeLinuxGL,' +
  'VaapiIgnoreDriverChecks,VaapiOnNvidiaGPUs,AcceleratedVideoEncoder'
);
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
```

### Alternative: webcodecs-node (FFmpeg NAPI-RS)
For main process encoding with direct NVENC access (bypasses Chromium VA-API shim):
- https://github.com/Brooooooklyn/webcodecs-node
- Implements WebCodecs API surface in Node.js
- Direct NVENC/VAAPI/QSV backends via FFmpeg
