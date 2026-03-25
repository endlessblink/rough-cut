# Rough Cut — Risks, Open Questions & Next Steps

## Overview

This document captures the technical and product risks, unresolved decisions, edge cases, and a prioritized implementation plan for the Rough Cut screen recording and editing application. It is intended to be read before and during implementation to avoid costly architectural mistakes.

---

## Technical Risks

### Critical

#### 1. Frame-Accurate Video Seeking

HTML5 `<video>` does NOT guarantee frame-accurate seeking. `video.currentTime` seeks to the nearest keyframe, which can be off by up to 60 frames with typical GOP sizes.

- **Impact**: The entire timeline editing experience depends on frame-accurate seeking. If users cannot scrub to exact frames, trim handles and clip alignment become unreliable.
- **Mitigation**: Build a custom frame decoder using FFmpeg via N-API native addon or the WebCodecs API. Use HTML5 video only as a fallback for draft preview. Pre-decode and cache frames at the edges of visible clips.
- **Spike required**: Can we extract an arbitrary frame from a recorded video within 16ms using Node.js + FFmpeg? Budget 2-3 days. This result determines the entire preview and rendering architecture.

---

#### 2. Cross-Platform Recording Differences

Recording behavior is meaningfully different across all three target platforms.

- **macOS**: Requires TCC Screen Recording permission. System audio capture is NOT possible via `desktopCapturer` alone — requires a virtual audio device (BlackHole, Loopback) or the ScreenCaptureKit API.
- **Windows**: DXGI duplication works but has issues with hardware-accelerated windows. WASAPI loopback for audio requires specific handling.
- **Linux**: PipeWire/Wayland forces an XDG Desktop Portal picker dialog every time. Programmatic window selection is not possible. X11 works but is being deprecated.
- **Mitigation**: Abstract all capture behind a `CaptureBackend` interface from day one. Defer macOS system audio to v1.1 or document the BlackHole requirement clearly. Accept the Wayland portal picker as a known limitation.
- **Spike required**: Test `desktopCapturer` on all three platforms. Budget 1-2 days per platform.

---

#### 3. Electron Real-Time Video Preview Performance

GPU context contention between PixiJS (WebGL) and HTML5 video decoding is a real risk. On integrated GPUs, compositing two video tracks plus effects at 30fps within a 33ms frame budget will stutter.

- **Impact**: Preview is the primary editing interface. Stuttering makes the app feel broken regardless of how correct the output is.
- **Mitigation**: Implement two-tier preview — draft quality during scrubbing, full quality when paused. Use `OffscreenCanvas` in a Web Worker to offload compositing. Profile on the weakest target hardware (integrated GPU laptop) as early as Phase 2.

---

### High

#### 4. PixiJS as Video Compositor

PixiJS is a game engine, not a video compositor. Known limitations include no native video timeline concept, limited blend modes (WebGL only), no color space management (sRGB only), no bicubic or Lanczos filtering, and historical premultiplied alpha bugs.

- **Mitigation**: Treat PixiJS as preview-only. Limit v1 effects to what PixiJS handles reliably. Write a compatibility layer so PixiJS can be swapped for a purpose-built compositor in a future version without rewriting callers.

---

#### 5. Export Pipeline Complexity

Frame-by-frame export is a headless video renderer. A 10-minute 1080p60 recording equals 36,000 frames. Each uncompressed RGBA frame is approximately 8MB. Memory management is critical.

FFmpeg bundling adds 70-150MB to the installer and introduces GPL licensing concerns depending on which codecs are included.

- **Mitigation**: Use a streaming pipeline — render one frame, encode one frame, never hold more than 2-3 frames in memory simultaneously. Use WebCodecs where available. Bundle an LGPL FFmpeg build to avoid GPL obligations. Include cancel support from the very first export implementation.

---

#### 6. Memory Management

Multiple simultaneous workloads compete for memory: screen recording buffer, webcam stream, preview playback (two video textures plus compositing buffer), thumbnail generation, waveform generation, and undo history. On an 8GB system this can easily reach 1-2GB.

- **Mitigation**: Implement an explicit memory budget system with LRU cache eviction. Use `SharedArrayBuffer` for zero-copy frame transfer between threads. Generate thumbnails and waveforms lazily on demand. Use virtual scrolling in the timeline so only visible clip thumbnails are resident.

---

#### 7. Timeline State Performance

Every playhead movement (30-60Hz during playback) has the potential to trigger re-renders across all Zustand store subscribers.

- **Mitigation**: Separate transport state (playhead position, playing/paused) from project state. Transport state must NOT flow through the main state management system — it needs its own low-latency path. Use the Command Pattern for undo/redo rather than full state snapshots.

---

### Medium

#### 8. IPC Bottlenecks

Default Electron IPC serializes data as JSON. Sending video frame data over it is not viable.

- **Mitigation**: Use `MessagePort` for high-throughput channels between processes. Use `SharedArrayBuffer` for frame data (requires COOP/COEP headers set on the renderer). Keep all video data in the renderer process; only send metadata over IPC.

---

#### 9. Preview / Export Visual Mismatch

If preview and export use different rendering code paths, the exported file will not match what the user sees during editing.

- **Mitigation**: Define a single `evaluateKeyframeTracks()` function shared by both the preview renderer and the export renderer. The parameter resolution math must be identical. Validate with golden-image comparison tests.

---

## Product Risks

#### 10. v1 Scope Creep

AI features, motion graphics, and transitions are each a product unto themselves. Even the "pluggable" architecture for AI has its own design and implementation cost.

- **Mitigation**: Define the AI plugin interface as a simple function: `(projectModel, timeRange) => Suggestion[]`. No plugin registry, no marketplace, no dynamic loading in v1. Stub the AI tab UI and implement one real feature only if time permits.

---

#### 11. Competitive Positioning

The current market includes OBS (free, open-source), Screen Studio (polished, Mac-only), Loom (cloud-first), Descript (AI-first), and Cap (open-source, Rust-based). "Does everything" is not a defensible position.

- **Decision required**: Define the unique value proposition before significant implementation work begins. This affects which features get prioritized in v1 and how the product is marketed.

---

## Open Questions

### Must Decide Before Implementation

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Project file format | JSON file, SQLite, ZIP bundle, directory-based | JSON file with a sibling directory for generated assets (thumbnails, waveforms). Source media referenced by path, not copied into the project. |
| 2 | Video codec handling | Transcode on import vs. native codec playback vs. proxy workflow | Handle native codecs for playback. Defer proxy workflow to v1.x. Most screen recordings are H.264, which is universally supported. |
| 3 | Undo/redo granularity | Every mutation vs. grouped by user action | Command Pattern with composite commands. Drags = one undo step. Playback state and UI-only state are excluded from history. |
| 4 | Asset management | Content-addressable cache vs. project-local vs. global cache | Content-addressable cache at `~/.rough-cut/cache/` keyed by hash of source path + mtime. Regenerate on cache miss. Include a "clear cache" button in preferences. |
| 5 | FFmpeg distribution | Bundle static binary vs. system FFmpeg vs. download on first launch | Bundle a static binary per platform. Use an LGPL build to avoid GPL licensing issues. Accept the 80-150MB installer size cost. |
| 6 | Multi-window support | Single window vs. detachable panels | v1 is single window. The architecture must not prevent multi-window later — store state in Zustand, not in the window. |

### Can Defer

| # | Question | When to Decide |
|---|----------|----------------|
| 7 | Plugin/extension API design | After v1 ships and real usage patterns emerge |
| 8 | Cloud sync and collaboration | After product-market fit |
| 9 | Custom motion template authoring (code-based) | v2 |
| 10 | Proxy workflow for large media | When users report performance issues with long recordings |

---

## Edge Cases to Address

1. **Recording crash recovery**: WebM is more resilient than MP4 (no moov atom required to be valid). Implement auto-recovery for partial WebM files from a crashed session.

2. **Source media moved or deleted**: Implement a "relink media" workflow — this is a standard expectation in every professional editor.

3. **Disk space exhaustion during recording**: Monitor available disk space continuously and warn the user gracefully before the write fails.

4. **Multiple displays with different DPIs**: Capture resolution math gets complex with Retina and HiDPI displays, especially when the cursor moves between screens.

5. **Audio device changes mid-recording**: Handle device disconnection (e.g., USB audio interface unplugged) gracefully without crashing or silently dropping audio.

6. **Very long recordings (2+ hours)**: Files can exceed 4GB (the FAT32 file size limit). Timeline performance with thousands of thumbnails from a single clip needs virtual rendering.

7. **Empty timeline export**: Validate that the timeline has at least one clip before starting the export pipeline.

8. **Corrupted project file**: Provide a graceful error message and automatically maintain a backup of the previous save so the user can recover.

9. **App update during active project**: Prompt the user to save unsaved work before applying an update that requires restart.

10. **Concurrent recording and editing**: Explicitly out of scope for v1. Document this limitation and do not design around it.

---

## Missing Acceptance Criteria

These features need specific measurable targets agreed upon before implementation begins. Without them, "done" cannot be defined.

| Feature | Needs Target |
|---------|-------------|
| Recording | Maximum supported duration (30 min? 2 hours? unlimited?) |
| Recording | Target frame rate (30fps? 60fps?) |
| Recording | Maximum resolution (1080p? 4K? Retina scaling?) |
| Preview | Minimum acceptable playback FPS (24? 30?) |
| Timeline | Maximum number of clips before performance degrades |
| Export | Target encode time relative to clip duration (1x? 2x? 5x realtime?) |
| Startup | Cold start time budget (under 3s? under 5s?) |
| Memory | Maximum RAM usage target on an 8GB system |

---

## Next Implementation Steps (Ordered)

### Phase 0: Proof-of-Concept Spikes (1-2 weeks)

Do these BEFORE writing any production code. They validate the architecture and surface blockers before they become expensive to fix.

**Spike 1 — Frame Decoding**
Can you extract an arbitrary frame from a video within 16ms? Test FFmpeg via N-API, WebCodecs, and HTML5 video seeking side by side. Measure latency on a mid-range machine. This result determines the entire preview and rendering architecture.

**Spike 2 — Recording Per Platform**
Test `desktopCapturer` on macOS (with TCC permissions flow), Windows (DXGI), and Linux (Wayland portal and X11). Document exactly what works, what requires workarounds, and what is blocked. Budget 1-2 days per platform.

**Spike 3 — Timeline State Performance**
Build a standalone React + Zustand prototype — no Electron, no video — with 100 clips across 4 tracks and a playhead that moves at 60Hz. If this stutters, the state architecture is wrong before a line of production code is written.

---

### Phase 1: Foundation (2-3 weeks)

**Step 4 — Project Model Package**
Write all TypeScript interfaces, Zod schemas, factory functions, and schema versioning/migration hooks. Include `version` field and `migrate()` pipeline from day one. This is the contract between every subsystem. Have it reviewed before any other package depends on it. Note: the schema supports unlimited tracks, but MVP editor targets 1 video + 1 audio track (with architecture ready for more).

**Step 5 — Monorepo Setup**
Turborepo + pnpm workspaces + Vite + shared TSConfig + ESLint + Prettier. Get the CI pipeline running with lint, typecheck, and test passing on every commit.

**Step 6 — Timeline Engine Package**
Pure functions for clip placement, trimming, splitting, and overlap resolution. Cover with extensive unit tests. This is the second most critical package after the project model.

**Step 7 — Effect Registry Package**
Registry implementation, keyframe interpolation with easing functions, and 2-3 built-in effects (blur, zoom, rounded corners).

---

### Phase 2: Rendering (2-3 weeks)

**Step 8 — Preview Renderer**
PixiJS compositor that reads the project model and renders frames. Video texture loading, LRU frame cache, and a playback clock that drives the render loop.

**Step 9 — Export Renderer**
Headless frame-by-frame renderer piped to FFmpeg stdin. Validate with a hardcoded project that produces a real MP4 output file.

**Step 10 — Zustand Store**
All slices, undo/redo middleware, and key selectors. Wire to the preview renderer subscription. Confirm that playhead movement at 60Hz does not cause store-wide re-renders.

---

### Phase 3: Electron Shell and UI (3-4 weeks)

**Step 11 — Electron App Shell**
Window management, typed IPC bridge, preload script, and the native application menu.

**Step 12 — Record Tab UI**
Source picker, recording controls, live preview thumbnail, and webcam toggle.

**Step 13 — Edit Tab UI**
Timeline component with clip rendering, drag and drop, trim handles, playhead, transport controls, clip inspector, and effect parameter controls.

**Step 14 — Motion Tab UI**
Preset browser, template preview, and parameter editor.

**Step 15 — AI Tab UI**
Stubbed with the architecture hooks in place. Implement one real feature (auto-captions or smart zoom) only if schedule allows.

**Step 16 — Export Tab UI**
Format picker, quality presets, progress bar with time estimate, and cancel button.

---

### Phase 4: Polish and Ship (2 weeks)

**Step 17 — Keyboard shortcuts**
Standard editing shortcuts: J/K/L scrub, I/O for in/out points, cut, delete, undo/redo.

**Step 18 — Project save and load**
JSON serialization with autosave on a timer. Recent projects list on the home screen.

**Step 19 — Cross-platform testing**
Full test pass on macOS, Windows, and Linux. Document and fix platform-specific issues. Confirm that the recording spike findings from Phase 0 are fully addressed.

**Step 20 — Performance profiling**
Profile on the weakest target hardware. Use Chrome DevTools and PixiJS stats overlay to identify frame budget overruns. Fix the top bottlenecks before declaring v1 ready.
