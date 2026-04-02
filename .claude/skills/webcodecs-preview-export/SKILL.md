# WebCodecs Preview & Export Pipeline

## PlaybackManager — Research-Validated Design (2026-04-02)

### Critical Findings from Online Research

| Topic | Finding | Source |
|---|---|---|
| `timeupdate` for UI sync | **BAD** — fires at 4Hz = visible stutter. Use rAF at 60Hz instead. | BBC Peaks.js PR #206, Bocoup |
| PixiJS autoUpdate during play | **Works** — uses `requestVideoFrameCallback` (not ticker) as primary path | PixiJS #11381 |
| Off-DOM `requestVideoFrameCallback` | **May stop firing** — Chromium removes compositor layer for off-DOM elements | WICG rVFC spec |
| Two `<video>` elements sync | **Natural drift occurs** — use rAF polling + correction, 150ms tolerance is workable | Bocoup sync article |
| Off-DOM `video.play()` | **Works** — but need `autoplay-policy` Electron switch | Electron #13525 |
| `protocol.handle` + seeking | **Broken without manual 206 range handling** | Electron #38749 |

### PlaybackManager rAF Loop (the heart of playback)
```typescript
// Single rAF loop during playback — replaces 6 scattered mechanisms
private syncLoop = () => {
  if (!this._playing) return;
  
  const screenTime = this.screenVideo?.currentTime ?? 0;
  const fps = this.fps;
  const frame = Math.round(screenTime * fps);
  
  // 1. Sync store at ~30Hz (every other frame)
  if (frame !== this.lastSyncedFrame) {
    this.transportStore.setPlayheadFrame(frame);
    this.lastSyncedFrame = frame;
  }
  
  // 2. Camera drift correction (every frame, cheap check)
  if (this.cameraVideo && !this.cameraVideo.paused) {
    const drift = Math.abs(this.cameraVideo.currentTime - screenTime);
    if (drift > 0.15) { // 150ms tolerance
      this.cameraVideo.currentTime = screenTime;
    }
  }
  
  // 3. Compositor zoom/transform update
  if (this.compositor) {
    this.compositor.seekTo(frame); // updates currentFrame + renders
  }
  
  this.rafId = requestAnimationFrame(this.syncLoop);
};
```

### PixiJS Off-DOM Workaround
```typescript
// Force ticker path for off-DOM video elements (requestVideoFrameCallback
// may stop firing when compositor layer is removed for off-DOM elements)
const videoSource = new VideoSource({ resource: video, autoPlay: false, updateFPS: 0 });
```

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

### Recording Path (camera capture — TASK-054)
```
getUserMedia 1080p30 -> MediaStreamTrackProcessor -> VideoFrame
  -> WebCodecs VideoEncoder (H.264, OpenH264 software or NVENC if available)
  -> mediabunny -> MP4 file
```
Replaces MediaRecorder VP9 which drops frames under CPU load.

### Libraries
| Library | Role | Size |
|---------|------|------|
| `web-demuxer` v4 | WASM demuxer, feeds chunks to VideoDecoder | ~493KB gzipped (mini) |
| `mediabunny` v1.25 | Pure TS muxer, MP4 from VideoEncoder output + MediaStream source | ~30KB gzipped |
| PixiJS v8 | WebGL compositor for both preview and export | existing dep |

---

## How Screen Studio & OpenScreen Record Camera

Both use **MediaRecorder with H.264 codec priority** on macOS, which routes to
**VideoToolbox** (Apple's hardware encoder) automatically. Zero CPU cost.

- **Screen Studio:** Electron + WebCodecs. Export uses VideoDecoder → PixiJS → VideoEncoder.
  Recording relies on macOS VideoToolbox for hardware H.264 encoding.
- **OpenScreen:** Electron + PixiJS. MediaRecorder with `av1 > h264 > vp9 > vp8` priority.
  On macOS, H.264 is picked and hardware-accelerated. Bitrate: 18-45 Mbps depending on resolution.

**Neither targets Linux.** On Linux, MediaRecorder H.264 is unavailable (Chromium licensing).
They would have the same frame-drop problem we have.

---

## Camera Recording on Linux/NVIDIA — The Problem & Solutions

### The Problem
MediaRecorder VP9 software encoding at 1080p30 uses **60-150% of one CPU core**.
Combined with FFmpeg x11grab screen capture, the CPU is overloaded → frames drop.
Measured: camera recording comes out at ~20fps instead of 30fps.

### Solution 1: WebCodecs + OpenH264 (Recommended — TASK-054)
Replace MediaRecorder with WebCodecs `VideoEncoder` using H.264 (OpenH264 software).

**CPU cost: ~20-30% of one core** — 3-5x lighter than VP9 MediaRecorder.

```typescript
// Get frames from camera stream
const videoTrack = cameraStream.getVideoTracks()[0];
const processor = new MediaStreamTrackProcessor({ track: videoTrack });
const reader = processor.readable.getReader();

// Probe best encoder config
const config = await VideoEncoder.isConfigSupported({
  codec: 'avc1.4D002A',  // H.264 Main Profile L4.1
  width: 1920, height: 1080,
  bitrate: 8_000_000,
  framerate: 30,
  hardwareAcceleration: 'prefer-hardware',  // tries NVENC, falls back to OpenH264
  avc: { format: 'annexb' },
});

// Encoder
const encoder = new VideoEncoder({
  output: (chunk, metadata) => {
    const packet = EncodedPacket.fromEncodedChunk(chunk);
    videoPacketSource.add(packet, metadata?.decoderConfig ? { decoderConfig: metadata.decoderConfig } : undefined);
  },
  error: console.error,
});
encoder.configure(config.config!);

// Read loop with backpressure
let frameCount = 0;
while (recording) {
  const { value: frame, done } = await reader.read();
  if (done || !frame) break;
  if (encoder.encodeQueueSize > 3) { frame.close(); continue; } // drop if behind
  encoder.encode(frame, { keyFrame: ++frameCount % 90 === 0 });
  frame.close(); // MUST close — prevents GPU memory leak
}
```

### Solution 2: Mediabunny MediaStreamVideoTrackSource (Simplest)
Mediabunny has a built-in source that handles the MediaStreamTrackProcessor loop:

```typescript
import { Output, Mp4OutputFormat, BufferTarget, MediaStreamVideoTrackSource } from 'mediabunny';

const output = new Output({
  format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
  target: new BufferTarget(),
});
const videoSource = new MediaStreamVideoTrackSource(
  cameraStream.getVideoTracks()[0],
  { codec: 'avc', bitrate: 8_000_000 }
);
output.addVideoTrack(videoSource, { frameRate: 30 });
await output.start();
// ... recording ...
await output.finalize();
const mp4Buffer = (output.target as BufferTarget).buffer;
```

### Solution 3: FFmpeg Subprocess with NVENC (True GPU Encoding)
For guaranteed zero CPU encoding, pipe raw frames to FFmpeg in Electron main process:

```javascript
// In main process
const ffmpeg = spawn('ffmpeg', [
  '-f', 'rawvideo', '-pix_fmt', 'yuv420p',
  '-s', '1920x1080', '-r', '30',
  '-i', 'pipe:0',
  '-c:v', 'h264_nvenc', '-preset', 'p4', '-b:v', '8M',
  '-f', 'mp4', outputPath
]);
// Pipe raw frames from renderer via IPC or SharedArrayBuffer
```

More complex but guaranteed 30fps. NVENC on RTX 4070 Ti can handle multiple 4K streams.

---

## NVIDIA Linux Hardware Encoding Reality (verified 2026-03-31)

| Path | Works? | Notes |
|------|--------|-------|
| WebCodecs `prefer-hardware` H.264 | **Unreliable** | Chrome uses VA-API, not NVENC directly. Falls back to OpenH264 software |
| WebCodecs `no-preference` H.264 | **Yes** | OpenH264 software, ~20-30% CPU for 1080p30. 3-5x lighter than VP9 |
| MediaRecorder H.264 | **No** | Not available on Linux Chromium (licensing) |
| MediaRecorder VP9 | **Yes but slow** | 60-150% CPU, causes frame drops |
| MediaRecorder VP8 | **Yes, lighter** | ~30% less CPU than VP9, ~30% larger files |
| FFmpeg h264_nvenc | **Yes** | True GPU encoding, zero CPU. Requires subprocess |
| FFmpeg h264_vaapi | **Unreliable** | nvidia-vaapi-driver unstable in Chromium |

**Recommended approach:** Try WebCodecs H.264 `prefer-hardware` first. If `isConfigSupported`
returns `no-preference`, accept it — OpenH264 is still much better than VP9.

### Probing Hardware Support at Runtime
```typescript
async function getBestEncoderConfig(w: number, h: number): Promise<VideoEncoderConfig> {
  const base = { width: w, height: h, bitrate: 8_000_000, framerate: 30, avc: { format: 'annexb' as const } };
  const candidates: VideoEncoderConfig[] = [
    { ...base, codec: 'avc1.4D002A', hardwareAcceleration: 'prefer-hardware' },
    { ...base, codec: 'avc1.4D002A', hardwareAcceleration: 'no-preference' },
    { ...base, codec: 'avc1.42002A', hardwareAcceleration: 'no-preference' },
  ];
  for (const cfg of candidates) {
    const result = await VideoEncoder.isConfigSupported(cfg);
    if (result.supported) return result.config!;
  }
  throw new Error('No supported encoder config');
}
```

---

## Frame-Accurate Seeking (mediabunny)
```typescript
const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
const videoTrack = await input.getPrimaryVideoTrack()
const sink = new VideoSampleSink(videoTrack)
const frame = await sink.getSample(42.0) // seeks to keyframe, decodes forward
const vf = frame.toVideoFrame() // raw VideoFrame for WebGL texture
vf.close() // MUST close to free VRAM
```

## PixiJS VideoSource Pattern (preview)
```typescript
const source = VideoSource.from(videoElement)
source.autoPlay = false
source.autoUpdate = true
const videoTexture = Texture.from(source)
const videoSprite = new Sprite(videoTexture)
```

## web-demuxer WASM in Electron
- Copy `web-demuxer-mini.wasm` (~493KB) from `node_modules/web-demuxer/dist/wasm-files/` to `public/`
- Vite config: `base: './'` for file:// compatibility in packaged app
- `file://` works — no local HTTP server needed
- In renderer: `new WebDemuxer({ wasmFilePath: '/web-demuxer-mini.wasm' })`

## MediaStreamTrackProcessor
- Ships in Chromium 94+, Electron 33 — no flags needed
- Works on main thread in Electron (non-standard but supported)
- `.readable` gives `ReadableStream<VideoFrame>` for video, `ReadableStream<AudioData>` for audio
- Verify: `typeof MediaStreamTrackProcessor !== 'undefined'`

## Audio Recording
- Use `AudioEncoder` with `mp4a.40.2` (AAC-LC) for MP4 containers
- Or `MediaStreamAudioTrackSource` from mediabunny (handles it internally)
- AAC preferred over Opus for MP4 compatibility

## Backpressure During Recording
```typescript
// Drop frames if encoder falls behind (best for live capture)
if (videoEncoder.encodeQueueSize > 3) {
  frame.close();
  continue;
}
```

---

## Playback Architecture

### Confirmed Root Cause of Playback Lag (2026-03-31)
The playback chain was:
1. `usePlaybackLoop` increments frame counter via rAF → `setPlayheadFrame(frame)`
2. `use-compositor.ts` subscribes → calls `compositor.seekTo(frame)` every frame
3. `preview-compositor.ts seekTo()` → `video.currentTime = targetTime` + `.update()` per frame

= **frame-by-frame seeking** (30 seeks/sec) instead of native `<video>.play()`.

### Fix (implemented)
- Compositor: `play()`/`pause()` methods, `VideoSource.autoUpdate = true` during play
- PixiJS ticker reads `video.currentTime` for zoom/transforms, syncs playhead to store
- `use-compositor.ts`: play/pause only on transitions (wasPlaying guard)
- `use-camera-sync.ts`: direct Zustand subscription (no React re-renders), drift correction every 2s only for >1s drift
- `use-playback-loop.ts`: reads video.currentTime when compositor active, falls back to frame increment for RecordTab

### Camera Sync (use-camera-sync.ts)
- NO `useTransportStore` React hooks (caused 30 re-renders/sec)
- Direct `transportStore.subscribe()` — zero React involvement
- Play/pause: only on transitions via `wasPlayingRef`
- Scrub: seek only when paused
- Drift: `setInterval(2000)` checks, hard-seek only if >1s off

---

## OpenScreen Reference Files
- `VideoPlayback.tsx` — preview with PixiJS VideoSource + autoUpdate
- `streamingDecoder.ts` — web-demuxer + VideoDecoder with backpressure (queue > 24 frames)
- `frameRenderer.ts` — PixiJS offscreen export render, Texture.from(videoFrame)
- `muxer.ts` — mediabunny MP4 output (Mp4OutputFormat + EncodedVideoPacketSource)
- `videoExporter.ts` — orchestrates the export pipeline
- `compositeLayout.ts` — shared PiP layout for preview + export
- `videoEventHandlers.ts` — rAF polling for currentTime (not timeupdate events)

## PipeWire Camera Bug (verified 2026-03-31)
- `WebRtcPipeWireCamera` Electron flag MUST be disabled on Linux
- PipeWire ignores getUserMedia resolution constraints
- Always delivers native camera resolution (1080p YUYV = 5fps over USB)
- Without PipeWire, V4L2 direct access honors constraints
- Camera at 640x480 YUYV: 30fps. Camera at 1080p MJPEG: 30fps.
