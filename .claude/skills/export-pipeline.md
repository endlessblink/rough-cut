---
name: export-pipeline
description: Export pipeline — frame-by-frame rendering, FFmpeg integration, format presets, audio mixdown, progress reporting, GIF export. Auto-activates when working on video export, FFmpeg, rendering output, or the Export tab.
triggers:
  - ExportTab
  - ExportRenderer
  - export-renderer
  - FFmpeg
  - ffmpeg
  - ffprobe
  - render-frames
  - encode
  - GIF
  - ProRes
  - H264
  - social-media-preset
  - audio-mixdown
---

# Export Pipeline — Architectural Context

## Overview

The export pipeline renders the final video output by compositing every frame at full quality and piping to FFmpeg. It runs in the main process (or a Worker Thread) and is completely independent from the PixiJS preview renderer. It lives in `@rough-cut/export-renderer`.

## Industry Patterns (Research-Based)

### Frame-by-Frame Rendering (Remotion model)

The proven architecture from Remotion, adapted for Rough Cut:

```
ProjectDocument
    ↓
ExportWorker (Node.js Worker Thread in main process)
    ↓
[For each frame N]:
  1. Resolve clip positions at frame N (timeline-engine)
  2. Decode source frame from asset file (FFmpeg seek)
  3. Composite layers in memory (effect-registry transforms)
  4. Write raw RGBA frame to FFmpeg stdin pipe
    ↓
FFmpeg process (spawned with -f rawvideo -pix_fmt rgba -i pipe:0)
    ↓
Output file (MP4, WebM, GIF, ProRes)
```

### FFmpeg Bundling in Electron

**Recommended pattern** (from ffmpeg-static + Electron):

```javascript
// main/ffmpeg-path.mjs
import { app } from 'electron'
import ffmpegStatic from 'ffmpeg-static'

export function getFfmpegPath() {
  if (app.isPackaged) {
    return ffmpegStatic.replace('app.asar', 'app.asar.unpacked')
  }
  return ffmpegStatic
}
```

- Use `ffmpeg-static` for platform-specific static binary
- Configure `asar.unpack` glob: `'**/node_modules/ffmpeg-static/**'`
- Or use `extraResources` in electron-builder (cleaner for large binaries)
- Use direct `child_process.spawn` (not fluent-ffmpeg) for export — gives full control over `-progress pipe:1` and stdin piping
- **WARNING: fluent-ffmpeg was archived May 2025 and is no longer maintained.** Use direct `child_process.spawn()` for all FFmpeg operations.

**Version note**: `ffmpeg-static` v5.x bundles FFmpeg 6.1.1 (software encoders only). It does NOT include hardware encoders (NVENC/VAAPI/VideoToolbox). Hardware acceleration requires a custom FFmpeg build. Do not use the abandoned `ffmpeg-static-electron` package. WASM FFmpeg (`@ffmpeg/ffmpeg`) achieves only ~40fps at 720p vs ~500fps native — not viable for production export.

### Backpressure Handling (Critical)

When piping frames to FFmpeg stdin, you MUST honor Node.js stream backpressure:
```javascript
const canWrite = proc.stdin.write(frameBuffer);
if (!canWrite) {
  await new Promise(resolve => proc.stdin.once('drain', resolve));
}
```
Ignoring backpressure at 4K resolution (~32MB/frame RGBA) will exhaust Node.js heap memory within seconds.

### Progress Reporting

FFmpeg's `-progress pipe:1` flag outputs structured key-value progress:
```
frame=42
fps=24.3
bitrate=1234.5kbits/s
total_size=512000
out_time=00:00:01.750000
speed=1.5x
progress=continue
```

Parse `frame=` against total frame count (from ffprobe) for exact percentage. `progress=end` signals completion. Relay to renderer via typed IPC channel.

### Audio Mixdown

Multiple audio tracks mixed to stereo before FFmpeg:

```bash
# Pre-mix in Node.js: render volume envelopes → single stereo WAV
# Pass pre-mixed WAV as second FFmpeg input

ffmpeg \
  -f rawvideo -pix_fmt rgba -s 1920x1080 -r 30 -i pipe:0 \
  -i /tmp/audio-mix.wav \
  -c:v libx264 -crf 18 -preset medium \
  -c:a aac -b:a 192k \
  -movflags +faststart \
  output.mp4
```

For simple cases without volume keyframes, use FFmpeg's `amix` filter directly:
```bash
-filter_complex "[0:a:0]volume=1.0[a0];[0:a:1]volume=0.5[a1];[a0][a1]amix=inputs=2[aout]"
```

### GIF Export (Two-Pass Palette)

```bash
# Pass 1: generate optimal palette
ffmpeg -i input.mp4 -vf "fps=15,scale=640:-1:flags=lanczos,palettegen=stats_mode=diff" palette.png

# Pass 2: apply palette with dithering
ffmpeg -i input.mp4 -i palette.png \
  -lavfi "fps=15,scale=640:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=floyd_steinberg" \
  output.gif
```

For screen recordings (text-heavy): `dither=none` or `dither=bayer:bayer_scale=3` often looks cleaner. Post-optimize with `gifsicle --optimize=3 --lossy=80`.

### Animated WebP (Recommended GIF Alternative)

Animated WebP produces smaller files with full 24-bit color + alpha. Supported by all modern browsers. Use FFmpeg: `-c:v libwebp_anim -lossless 0 -q:v 75`. Consider WebM/VP9 with alpha for the best quality-to-size ratio.

## Export Format Matrix

Priority-ordered:

| Format | Codec | Container | CRF Default | Notes |
|--------|-------|-----------|-------------|-------|
| MP4/H.264 | libx264 | .mp4 | 18 | Universal, required |
| MP4/H.265 | libx265 | .mp4 | 23 | Smaller files, important for 4K |
| GIF | — | .gif | — | Two-pass palette, cap ≤1280px wide |
| ProRes 422 | prores_ks | .mov | — | Round-tripping to FCP/DaVinci |
| WebM/VP9 | libvpx-vp9 | .webm | 28 | Web embedding |
| Image seq | PNG/JPEG | folder | — | Compositing in other apps |

### Social Media Presets

| Platform | Resolution | Aspect | FPS | Bitrate | Audio |
|----------|-----------|--------|-----|---------|-------|
| YouTube HD | 1920×1080 | 16:9 | 30/60 | 8 Mbps | AAC 320k |
| YouTube 4K | 3840×2160 | 16:9 | 30/60 | 35-45 Mbps | AAC 320k |
| YouTube Shorts | 1080×1920 | 9:16 | 30/60 | 8 Mbps | AAC 320k |
| Instagram Reel | 1080×1920 | 9:16 | 30 | 5-8 Mbps | AAC 128k |
| Instagram Feed | 1080×1080 | 1:1 | 30 | 3.5 Mbps | AAC 128k |
| TikTok | 1080×1920 | 9:16 | 30/60 | 5-8 Mbps | AAC 128k |
| Twitter/X | 1280×720 | 16:9 | 30/60 | 5 Mbps | AAC 128k |
| LinkedIn | 1920×1080 | 16:9 | 30 | 5 Mbps | AAC 128k |

H.264 + AAC in MP4 is universally accepted.

## Canonical Constraints

From the project constitution:

1. **Preview and Export are different pipelines** (§3) — Export is frame-by-frame, headless, deterministic, full quality. Never reuse the preview renderer.

2. **Main process owns all I/O** (§8) — FFmpeg spawning, file writing, Worker Threads all in main process.

3. **Frame-based** (§4) — Export iterates integer frame numbers 0 to totalFrames-1.

4. **Effects are data, not code** (§7) — Export renderer reads EffectInstance params and applies via EffectDefinition registry (shared with preview).

5. **Every effect is serializable and testable** (§9) — Export can be tested by rendering a single frame and comparing to a golden image.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Main Process                                    │
│                                                  │
│  ExportManager                                   │
│  ├── Validates export settings                   │
│  ├── Pre-checks disk space                       │
│  ├── Spawns ExportWorker                         │
│  └── Relays progress to renderer via IPC         │
│                                                  │
│  ExportWorker (Worker Thread)                    │
│  ├── For each frame:                             │
│  │   ├── timeline-engine: resolve active clips   │
│  │   ├── Decode source frames (ffmpeg seek)      │
│  │   ├── effect-registry: compute transforms     │
│  │   ├── Composite to RGBA buffer (Canvas2D/CPU) │
│  │   └── Write RGBA to FFmpeg stdin pipe         │
│  ├── Pre-mix audio → stereo WAV                  │
│  └── FFmpeg process (child_process.spawn)        │
│      ├── Reads RGBA from stdin                   │
│      ├── Reads audio from WAV file               │
│      ├── Writes to temp file (.tmp.mp4)          │
│      └── Rename to final on success              │
└─────────────────────────────────────────────────┘
```

## Error Handling

| Error | Detection | Response |
|-------|-----------|----------|
| Disk full | Parse `No space left on device` from FFmpeg stderr | Cancel export, delete temp file, surface error |
| FFmpeg crash | Process exit with non-zero code | Delete temp file, show last stderr lines |
| Frame decode fail | Decode timeout / error | Retry 3x with backoff, substitute previous frame |
| Worker crash | Worker 'exit' event | Surface error, clean up temp files |
| User cancel | IPC cancel message | Send SIGTERM to FFmpeg, delete temp file |
| User cancel (Windows) | Write `q\n` to FFmpeg stdin | SIGTERM does not work reliably on Windows. Writing `q` triggers graceful FFmpeg quit. Fallback: `proc.kill()` (SIGKILL, produces broken output). |

**Critical pattern**: Always write to `.tmp` path, rename to final only on `exitCode === 0`.

## File Map (planned)

```
packages/export-renderer/src/
  export-renderer.ts           — Frame-by-frame rendering loop
  ffmpeg-spawner.ts            — FFmpeg process management + progress parsing
  audio-mixer.ts               — Multi-track audio mixdown to stereo WAV
  frame-compositor.ts          — Canvas2D/CPU compositing per frame
  format-presets.ts            — Social media + quality presets

apps/desktop/src/main/
  export-manager.mjs           — Worker Thread orchestration + IPC
  ffmpeg-path.mjs              — Platform-aware FFmpeg binary resolution

apps/desktop/src/renderer/features/export/
  ExportTab.tsx                — Export settings UI
  FormatSelector.tsx           — Format/codec picker
  QualityControls.tsx          — CRF/bitrate/resolution controls
  PresetSelector.tsx           — Social media presets
  ExportProgress.tsx           — Progress bar + ETA + cancel
```

## Implementation Order

1. **FFmpeg binary resolution** — `ffmpeg-path.mjs` with asar unpack
2. **Basic MP4 export** — Single video track, no effects, H.264
3. **Progress reporting** — Parse `-progress pipe:1`, relay via IPC
4. **Frame-by-frame compositor** — Canvas2D compositing in Worker Thread
5. **Audio mixdown** — Single audio track → AAC
6. **Effect application** — Apply effect-registry transforms per frame
7. **Multi-track audio** — Mix N tracks with volume envelopes
8. **Format presets** — Social media presets, GIF, ProRes
9. **Export UI** — Settings panel, progress, cancel
10. **Error handling** — Disk full, crash recovery, temp file cleanup

## Safety Rules

- **Always write to temp path, rename on success** — never leave partial output
- **Pre-check disk space** before starting export
- **Run export in Worker Thread** — never block the main thread
- **Handle FFmpeg crashes gracefully** — clean up, don't leave orphan processes
- **Cap GIF resolution** at 1280px wide — larger GIFs are impractical
- **No PixiJS in export renderer** — Canvas2D or CPU compositing only
- **Audio pre-mix before FFmpeg** — don't rely on complex FFmpeg filter graphs for volume keyframes
- **ProRes licensing note** — FFmpeg's `prores_ks` encoder is a reverse-engineered implementation. Encoding ProRes on non-Apple hardware is legally grey. On macOS, prefer `prores_videotoolbox` (Apple-blessed hardware encoder).

## What NOT to Do

- Don't reuse the PixiJS preview renderer for export
- Don't use fluent-ffmpeg for the main export pipeline (use spawn for full control)
- Don't write directly to the final output path (use temp + rename)
- Don't block the main thread during export (use Worker Thread)
- Don't send frame buffers over standard IPC (use SharedArrayBuffer)
- Don't skip disk space pre-check
- Don't assume FFmpeg binary is in the default PATH (use resolved path)
