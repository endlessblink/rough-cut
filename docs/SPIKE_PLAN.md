# Rough Cut -- Spike Plan (Phase 0)

## Purpose

These three spikes validate foundational technical assumptions before any production code is written. Each spike targets a risk that, if unaddressed, could force an architectural rewrite later. All spikes are independent and can run in parallel.

**Total time budget: 2 weeks (10 working days)**

---

## Spike 1: Frame-Accurate Decoding

### Objective

Determine whether we can extract an arbitrary frame from a recorded video within 16ms (one frame at 60fps) with guaranteed frame accuracy -- meaning the decoded frame is provably the exact frame requested, not an approximation.

This result determines the entire preview and export rendering architecture.

### Success Criteria

| Criterion | Target | Hard Fail |
|-----------|--------|-----------|
| Random frame decode latency (cold) | < 16ms | > 50ms |
| Sequential frame decode latency (warm) | < 8ms | > 16ms |
| Seek decode latency (5s jump) | < 16ms | > 100ms |
| Frame accuracy | 100% correct frames | Any wrong frame |
| Memory per decoded 1080p RGBA frame | ~8MB (known) | > 16MB (leak) |
| Memory per decoded 4K RGBA frame | ~33MB (known) | > 66MB (leak) |

### Approach

#### Step 1: Create Test Media (Day 1, 2 hours)

Generate test videos with frame numbers burned into each frame using FFmpeg:

- `test-1080p-h264-30fps-gop2s.mp4` -- 1080p H.264, 30fps, keyframe every 2 seconds (60 frames). This is the typical screen recording profile.
- `test-4k-h264-60fps-gop2s.mp4` -- 4K H.264, 60fps, keyframe every 2 seconds (120 frames). Stress test.
- `test-1080p-vp9-30fps.webm` -- 1080p VP9, 30fps. Alternative codec.

Each frame must have a large, high-contrast frame number rendered at a fixed position so it can be read back programmatically (OCR or pixel-pattern matching).

#### Step 2: HTML5 `<video>` Baseline (Day 1, 4 hours)

Build a minimal Electron app (or plain browser page) that:

1. Loads a test video into an `<video>` element.
2. Sets `video.currentTime` to a target frame's timestamp.
3. Waits for the `seeked` event.
4. Draws the video frame to a `<canvas>` via `drawImage()`.
5. Reads the burned-in frame number from the canvas pixels.
6. Compares the actual frame number to the requested frame number.
7. Records: seek latency, frame accuracy delta (requested vs. actual), and any platform-specific behavior.

Test with all three video files. Test random seek (jump to arbitrary frame), sequential seek (advance by 1 frame), and long seek (jump 5 seconds forward).

**Expected result**: Frame accuracy will be poor. The `<video>` element seeks to the nearest keyframe, so with a 2-second GOP, seeks can be off by up to 60 frames at 30fps. This establishes the baseline that justifies the more complex approaches.

#### Step 3: WebCodecs API (Day 2-3)

Build a standalone test harness that:

1. Uses `fetch()` or `fs.readFile()` to load the video file.
2. Demuxes with `mp4box.js` (for MP4) or a WebM demuxer to extract individual `EncodedVideoChunk` packets.
3. Creates a `VideoDecoder` with the appropriate codec configuration.
4. To decode frame N: feed chunks from the nearest preceding keyframe through frame N.
5. Capture the decoded `VideoFrame`, draw to `OffscreenCanvas`, read pixels.
6. Verify frame number matches.
7. Measure: time from "request frame N" to "pixels available", including any necessary keyframe-to-target decode chain.

Key questions to answer:
- What is the decode latency for a frame immediately after a keyframe vs. 59 frames after?
- Can we maintain a decode context and seek backward efficiently?
- Does `VideoDecoder` support hardware acceleration in Electron's Chromium?
- What happens with multiple simultaneous decoders (for multi-track preview)?

#### Step 4: FFmpeg via Child Process (Day 3-4)

Build a test that:

1. Spawns `ffmpeg -ss <time> -i <input> -frames:v 1 -f rawvideo -pix_fmt rgba pipe:1`.
2. Reads the raw RGBA buffer from stdout.
3. Verifies the frame number.
4. Measures: total wall-clock time from spawn to buffer-complete.

Test with both `-ss` before `-i` (fast seek, may be inaccurate) and `-ss` after `-i` (slow seek, frame-accurate). Measure the accuracy and latency difference.

Also test the persistent-process approach:
1. Spawn `ffmpeg` once, keep stdin/stdout open.
2. Send seek commands via a filter chain or by restarting the decode pipeline.
3. Measure amortized latency without process spawn overhead.

#### Step 5: FFmpeg via N-API Native Addon (Day 4-5)

Build a minimal N-API addon (or evaluate existing ones like `beamcoder`) that:

1. Opens a video file using `avformat_open_input`.
2. Seeks to a target timestamp using `av_seek_frame`.
3. Decodes frames using `avcodec_send_packet` / `avcodec_receive_frame`.
4. Converts to RGBA using `sws_scale`.
5. Returns the buffer to Node.js as a `Buffer` or `SharedArrayBuffer`.
6. Measures: decode latency without process spawn overhead.

Key questions:
- What is the raw libavcodec decode latency vs. child process overhead?
- Can we use hardware-accelerated decoding (VAAPI on Linux, VideoToolbox on macOS, DXVA2 on Windows)?
- What is the N-API binding overhead for buffer transfer?
- How complex is the build/distribution story (prebuilds per platform)?

#### Step 6: Comparison and Documentation (Day 5)

Compile all measurements into a comparison table. Run each approach 100 times per scenario and report p50/p95/p99 latencies.

### Tools & Dependencies

| Tool | Purpose | License |
|------|---------|---------|
| FFmpeg CLI (static build) | Child process decode, test media generation | LGPL |
| `mp4box.js` | MP4 demuxing for WebCodecs | BSD-3 |
| WebCodecs API | Browser-native decode | Built into Chromium |
| `beamcoder` or custom N-API | Native libavcodec bindings | LGPL |
| Electron (same version as production target) | Runtime environment | MIT |

### Measurements

| Metric | Method |
|--------|--------|
| Decode latency | `performance.now()` around the full decode pipeline |
| Frame accuracy | Compare decoded frame number to requested frame number |
| Memory usage | `process.memoryUsage()` before/after, plus `performance.measureUserAgentSpecificMemory()` |
| CPU utilization | `process.cpuUsage()` during decode burst |
| Concurrent decoder overhead | Run 2 decoders simultaneously, measure per-decoder latency increase |

### Time Box

**5 working days.** If the N-API approach is proving too complex to build from scratch, evaluate `beamcoder` for 1 day maximum and move on with the best available data.

### Output Artifacts

1. `spikes/frame-decode/` -- Self-contained project with all test harnesses.
2. `spikes/frame-decode/RESULTS.md` -- Comparison table with raw numbers, p50/p95/p99 latencies, frame accuracy results, and memory usage.
3. `spikes/frame-decode/test-media/` -- Generated test videos (or the FFmpeg commands to recreate them).
4. Recommendation document identifying the chosen approach with justification.

### Decision Matrix

| Outcome | Architecture Decision |
|---------|----------------------|
| **WebCodecs meets all targets** (< 16ms, 100% accuracy) | Use WebCodecs as primary decoder in renderer process. Keep FFmpeg CLI as fallback for unsupported codecs and for the export pipeline. Simplest architecture -- no native addons. |
| **WebCodecs meets accuracy but not latency** | Use WebCodecs with a frame cache. Pre-decode frames ahead of the playhead during playback. Acceptable if cache hit rate is high during sequential playback. |
| **N-API addon meets all targets** | Use the native addon for both preview and export decoding. Accept the build complexity cost. Provides the most control and best performance ceiling. |
| **FFmpeg child process meets accuracy but not cold-start latency** | Use a persistent FFmpeg process pool (one per video track). Pre-warm on project load. Sequential frame latency is what matters for playback; cold-start only matters for scrubbing. |
| **No approach meets 16ms for random seek** | Implement a two-tier system: nearest-keyframe fast seek for scrubbing (draft quality), then refine to exact frame when the user pauses. Cache decoded GOPs in an LRU buffer. Adjust the 16ms target to 33ms (30fps preview). |
| **Nothing provides frame accuracy** | This is a project-blocking finding. Re-evaluate whether frame-accurate preview is a hard requirement or if "accurate to nearest keyframe" is acceptable for preview, with frame-accurate export only. |

### Risk if Skipped

The entire preview and editing experience depends on frame-accurate decoding. If we build the timeline, clip inspector, trim handles, and preview renderer assuming frame-accurate seeking is available, and then discover that HTML5 `<video>` is off by 30+ frames, we face one of two outcomes:

1. A complete rewrite of the video decoding layer after significant UI work is built on top of it.
2. Shipping a product where trim handles visually misrepresent clip boundaries -- a fundamental credibility problem for a video editor.

The RISKS_AND_NEXT_STEPS.md document (Risk #1) explicitly identifies this as the highest-priority spike. The architecture document specifies two independent rendering pipelines that both require frame-level precision. Skipping this spike means building on an unvalidated assumption that underpins the entire application.

---

## Spike 2: Per-Platform Recording

### Objective

Determine the exact recording capabilities available on each target platform (macOS, Windows 11, Ubuntu/Fedora Linux) using Electron's `desktopCapturer` and related Web APIs. Produce a definitive compatibility matrix that drives the `CaptureBackend` interface design.

### Success Criteria

| Criterion | Target | Hard Fail |
|-----------|--------|-----------|
| Screen capture at 30fps | Works on all 3 platforms | Fails on any platform |
| Screen capture at 60fps | Works on at least 2 platforms | Fails on all 3 |
| Window capture | Works on macOS + Windows | Fails on both |
| Webcam capture | Works on all 3 platforms | Fails on any platform |
| Microphone capture | Works on all 3 platforms | Fails on any platform |
| System audio | Documented per platform | Unknown on any platform |
| Output file is valid WebM | Playable in FFmpeg/VLC | Corrupted output |
| Multi-monitor | Documented behavior per platform | Untested |
| Permission flow | Documented per platform | Undocumented |

### Approach

#### Step 1: Test Environment Setup (Day 1)

Build a minimal Electron app with:

- A source picker that calls `desktopCapturer.getSources({ types: ['screen', 'window'] })` and displays available sources.
- Buttons to start/stop recording.
- Controls to select webcam, microphone, and system audio.
- A `MediaRecorder` that writes to a WebM file.
- Console logging of all stream tracks, their settings, and any constraint errors.

This same app is deployed and tested on all three platforms.

#### Step 2: macOS Testing (Day 2)

Test on macOS 13+ (Ventura or later):

| Capability | Test |
|------------|------|
| TCC Screen Recording permission | Does the app prompt on first launch? What happens if denied? Can we detect the permission state before attempting capture? |
| `desktopCapturer.getSources()` | Returns screens and windows? Thumbnails accurate? |
| Screen capture 30fps | `getUserMedia` with `mandatory: { chromeMediaSource: 'desktop' }`. Measure actual frame rate of delivered frames. |
| Screen capture 60fps | Same, with `frameRate: { ideal: 60 }`. Does it actually deliver 60fps? |
| Window capture | Select a specific window. Does it track window movement? What about minimized windows? |
| Webcam | `getUserMedia({ video: true })`. Resolution options? |
| Microphone | `getUserMedia({ audio: true })`. Latency? |
| System audio | Attempt `desktopCapturer` with `audio: true`. Document the failure. Test with BlackHole virtual audio device installed. |
| Multi-monitor | Two displays, different resolutions. Can both be captured? What about Retina vs. non-Retina? |
| MediaRecorder output | Record 30 seconds. Verify file is valid with `ffprobe`. Check codec, frame rate, and resolution. |

#### Step 3: Windows Testing (Day 3)

Test on Windows 11:

| Capability | Test |
|------------|------|
| `desktopCapturer.getSources()` | Returns screens and windows? |
| Screen capture 30/60fps | Measure actual delivered frame rate. |
| Window capture | Hardware-accelerated windows (browsers, games). Does DXGI handle them? |
| Webcam | Standard USB webcam. |
| Microphone | Built-in and USB microphone. |
| System audio | WASAPI loopback via `desktopCapturer`. Does `audio: true` on the screen source work? |
| Multi-monitor | Different DPIs (100% and 150% scaling). |
| MediaRecorder output | Verify WebM file validity. |

#### Step 4: Linux Testing (Day 4)

Test on both Wayland (Ubuntu 24.04+ with GNOME) and X11 fallback:

| Capability | Test |
|------------|------|
| Wayland portal picker | Does `desktopCapturer.getSources()` trigger the XDG Desktop Portal dialog? Can the user select a specific window? Is the selection remembered? |
| X11 fallback | Does `desktopCapturer` work without the portal dialog under X11? |
| Screen capture 30/60fps | Actual frame rate on both display servers. |
| Window capture | Wayland restricts this. Document the limitation. |
| Webcam | V4L2 device via `getUserMedia`. |
| Microphone | PulseAudio and PipeWire. |
| System audio | PulseAudio monitor source. PipeWire capture. |
| Multi-monitor | Two monitors on Wayland. |
| MediaRecorder output | Verify WebM file validity. |

#### Step 5: Compatibility Matrix and Interface Design (Day 5)

Compile all results into the compatibility matrix. Draft the `CaptureBackend` interface based on the lowest common denominator, with platform-specific extensions.

### Tools & Dependencies

| Tool | Purpose |
|------|---------|
| Electron (target version) | Runtime |
| `desktopCapturer` API | Screen/window capture |
| `navigator.mediaDevices.getUserMedia` | Webcam/mic capture |
| `MediaRecorder` API | Recording to WebM |
| `ffprobe` | Validating output files |
| BlackHole (macOS) | Virtual audio device for system audio testing |
| VMs or physical hardware | Per-platform testing (macOS requires real hardware) |

### Measurements

| Metric | Method |
|--------|--------|
| Actual frame rate delivered | Count frames received in `ondataavailable` over 10 seconds |
| Frame drops | Compare expected frame count (duration x fps) to actual |
| Audio/video sync | Record a click track with visual flash, measure A/V offset in output |
| Recording startup latency | Time from "start" button to first frame received |
| File size per minute | At 30fps and 60fps, 1080p |
| CPU usage during recording | `process.cpuUsage()` or system monitor |
| Permission detection latency | Time from app launch to permission state known |

### Time Box

**5 working days** (1 day setup, 1 day per platform, 1 day synthesis). If a platform is unavailable (e.g., no macOS hardware), document what could not be tested and flag it as a remaining risk.

### Output Artifacts

1. `spikes/recording/` -- Minimal Electron test app, runnable on all platforms.
2. `spikes/recording/RESULTS.md` -- Full compatibility matrix.
3. `spikes/recording/CAPTURE_BACKEND_INTERFACE.md` -- Draft TypeScript interface for `CaptureBackend` based on findings.
4. `spikes/recording/samples/` -- Sample recordings from each platform (short clips, not committed to git -- documented in `.gitignore`).
5. `spikes/recording/PERMISSIONS.md` -- Per-platform permission flow documentation with screenshots.

### Decision Matrix

| Outcome | Architecture Decision |
|---------|----------------------|
| **`desktopCapturer` works well on all 3 platforms** | Use `desktopCapturer` as the sole capture backend. Implement platform-specific permission handling. Simple architecture. |
| **`desktopCapturer` works on macOS/Windows but Linux Wayland is problematic** | Use `desktopCapturer` on macOS/Windows. On Linux, accept the portal picker limitation and document it. Consider PipeWire native integration as a v1.x enhancement. |
| **System audio works on Windows only** | Ship system audio on Windows. On macOS, document the BlackHole workaround and consider bundling a virtual audio driver in v1.x. On Linux, use PulseAudio/PipeWire monitor source if the spike confirms it works. |
| **60fps capture is unreliable** | Default to 30fps recording. Offer 60fps as an "experimental" option. The 60fps preview target is unaffected (preview renders at display refresh rate regardless of source frame rate). |
| **Window capture fails on some platforms** | Fall back to full-screen capture with post-capture crop. Document the limitation in the UI (e.g., "Window capture is not available on this platform"). |
| **MediaRecorder produces invalid WebM on some platforms** | Investigate alternative containers (MP4 via `MediaRecorder` if supported). Worst case, capture raw frames and mux with FFmpeg in the main process. |

### Risk if Skipped

The architecture document (CLAUDE.md, principle 6) states that "recording produces assets + metadata" and the RISKS_AND_NEXT_STEPS.md (Risk #2) identifies cross-platform recording differences as a critical risk. Without this spike:

1. The `CaptureBackend` interface will be designed based on assumptions rather than tested behavior. Platform-specific quirks (Wayland portal picker, macOS TCC flow, Windows DXGI edge cases) will surface during Phase 3 UI implementation, causing costly rework.
2. The system audio story will remain undefined, leading to last-minute feature cuts or broken promises in marketing.
3. Permission flows cannot be designed into the UI until we know exactly what each platform requires.

---

## Spike 3: Timeline State Performance

### Objective

Determine whether a Zustand-based state architecture can support 100+ clips across 4 tracks with a playhead updating at 60Hz without causing UI jank (dropped frames or unnecessary React re-renders).

This validates the state management recommendation from the architecture document before any store code is written.

### Success Criteria

| Criterion | Target | Hard Fail |
|-----------|--------|-----------|
| Playhead animation | 60fps, 0 dropped frames | Any dropped frames during steady-state playback |
| Clip component re-renders during playback | 0 per frame | Any clip re-render not caused by a clip mutation |
| `selectActiveClipsAtFrame(frame)` latency | < 1ms for 100 clips | > 5ms |
| Undo/redo latency (with zundo) | < 50ms | > 200ms |
| Memory usage (100 clips, no video) | < 50MB | > 100MB |
| Memory usage (1000 clips, no video) | < 100MB | > 200MB |
| Time from playhead change to visual update | < 5ms | > 16ms |

### Approach

#### Step 1: Scaffold the Prototype (Day 1)

Build a standalone React app (Vite, no Electron) with:

- 4 tracks (2 labeled "video", 2 labeled "audio").
- A clip generator that creates N clips with random positions, durations (30-300 frames), and distributes them across tracks.
- A minimal timeline UI that renders clips as colored rectangles with position/duration labels.
- A playhead indicator (vertical line).
- Transport controls: play, pause, stop, jump to start/end.

This is a pure state performance test. No video, no audio, no PixiJS. Clips are colored `<div>` elements.

#### Step 2: Architecture A -- Single Naive Store (Day 2)

Implement:

```
Single Zustand store:
  - playhead: number (frame)
  - isPlaying: boolean
  - tracks: Track[]
  - clips: Clip[]
  - selectedClipIds: Set<string>
```

Playhead updates via `requestAnimationFrame` calling `store.setState({ playhead: playhead + 1 })`.

**Instrument**:
- Wrap every clip component in `React.memo` with a render counter.
- Log total re-renders per rAF tick.
- Use React DevTools Profiler to measure commit frequency.
- Use `performance.now()` to measure time from `setState` to paint.

**Expected result**: Every clip component re-renders on every frame because the store change triggers all subscribers.

#### Step 3: Architecture B -- Split Stores (Day 2-3)

Implement:

```
Transport store (Zustand):
  - playhead: number
  - isPlaying: boolean

Project store (Zustand):
  - tracks: Track[]
  - clips: Clip[]
  - selectedClipIds: Set<string>
```

Playhead updates only touch the transport store. Clip components subscribe only to the project store. The playhead indicator subscribes to the transport store.

**Instrument** same as Architecture A.

**Expected result**: Clip components do not re-render during playback. Only the playhead indicator re-renders.

#### Step 4: Architecture C -- Ref-Based Playhead (Day 3)

Implement:

```
Project store (Zustand):
  - tracks: Track[]
  - clips: Clip[]
  - selectedClipIds: Set<string>

Playhead: React.useRef<number>
Updated via requestAnimationFrame, no store involved.
Playhead indicator positioned via direct DOM manipulation (ref.current.style.transform).
```

Store is only notified on user-initiated seeks (clicking the timeline ruler).

**Instrument** same as above.

**Expected result**: Zero React re-renders during playback. The playhead moves via direct DOM updates. This is the fastest possible architecture but the hardest to integrate with React-based UI that needs to know the current frame (e.g., effect parameter display).

#### Step 5: Architecture D -- Signals (Day 4)

Implement using `@preact/signals-react` or a similar fine-grained reactivity library:

```
playhead = signal(0)
clips = signal<Clip[]>([...])
```

Components that read `playhead.value` re-render only when playhead changes, but with signal-level granularity (only the specific DOM node updates, not the full component tree).

**Instrument** same as above.

**Expected result**: Fine-grained updates without manual optimization. Evaluate whether the DX improvement justifies the additional dependency and deviation from standard React patterns.

#### Step 6: Selector and Undo/Redo Performance (Day 4-5)

Across whichever architecture(s) passed the playback test:

1. **Selector benchmark**: Implement `selectActiveClipsAtFrame(frame: number)` that returns all clips whose `[position, position + duration)` range contains the given frame. Benchmark with 100, 500, and 1000 clips. If linear scan exceeds 1ms, implement an interval tree and re-benchmark.

2. **Undo/redo benchmark**: Integrate `zundo` (Zustand undo middleware). Perform 100 mutations (move clip, resize clip, add clip, delete clip). Measure:
   - Time to push a state snapshot onto the undo stack.
   - Time to restore a previous state (undo).
   - Memory overhead of the undo stack (100 snapshots of 100-clip state).

3. **Virtual scrolling**: Implement basic virtualization for the timeline -- only render clips whose frame range overlaps the visible viewport. Measure render count with 1000 clips where only 20 are visible.

#### Step 7: Results Compilation (Day 5)

For each architecture, compile:

| Metric | A (Naive) | B (Split) | C (Ref) | D (Signals) |
|--------|-----------|-----------|---------|-------------|
| Re-renders/frame (clips) | ? | ? | ? | ? |
| Re-renders/frame (playhead) | ? | ? | ? | ? |
| setState-to-paint (ms) | ? | ? | ? | ? |
| Dropped frames (60s test) | ? | ? | ? | ? |
| Memory (100 clips) | ? | ? | ? | ? |
| Memory (1000 clips) | ? | ? | ? | ? |
| Undo latency (ms) | ? | ? | ? | ? |
| Selector latency (ms) | ? | ? | ? | ? |

### Tools & Dependencies

| Tool | Purpose |
|------|---------|
| Vite + React 18 | App scaffold |
| Zustand | State management (architectures A, B, C) |
| `zundo` | Undo/redo middleware |
| `immer` | Immutable state updates |
| `@preact/signals-react` | Signal-based reactivity (architecture D) |
| React DevTools Profiler | Render counting |
| `why-did-you-render` | Detecting unnecessary re-renders |
| Chrome DevTools Performance tab | Frame timing, dropped frames |
| `react-window` or `@tanstack/virtual` | Virtual scrolling |

### Measurements

| Metric | Method |
|--------|--------|
| Component re-renders | `why-did-you-render` + manual render counter in `React.memo` |
| Dropped frames | Chrome DevTools Performance recording, count frames > 16.67ms |
| setState-to-paint | `performance.now()` in setState callback vs. `requestAnimationFrame` after |
| Selector latency | `performance.now()` around selector call, 1000 iterations, report p50/p95/p99 |
| Undo/redo latency | `performance.now()` around undo action dispatch |
| Memory | Chrome DevTools Memory tab heap snapshot, compare across architectures |

### Time Box

**5 working days.** If Architecture D (Signals) proves complex to integrate, spend at most 1 day on it and move on. The split-store and ref-based approaches are more likely to be production-viable given the Zustand commitment in the architecture document.

### Output Artifacts

1. `spikes/timeline-state/` -- Standalone Vite + React app with all four architectures switchable via a dropdown.
2. `spikes/timeline-state/RESULTS.md` -- Comparison table with all metrics, charts of frame timing, and screenshots of React Profiler output.
3. `spikes/timeline-state/RECOMMENDATION.md` -- Recommended architecture with justification and migration notes for production implementation.
4. `spikes/timeline-state/src/selectors/` -- Benchmarked selector implementations (linear scan and interval tree if needed).

### Decision Matrix

| Outcome | Architecture Decision |
|---------|----------------------|
| **Architecture B (split stores) meets all targets** | Use split Zustand stores in production: a transport store for playhead/playback state and a project store for clips/tracks/effects. This is the simplest architecture that solves the problem and aligns with the existing Zustand recommendation. |
| **Architecture B fails but C (ref-based) meets targets** | Use ref-based playhead with a Zustand project store. Accept the added complexity of synchronizing the ref with React components that need the current frame (effect inspectors, timecode display). Provide a `usePlayhead()` hook that reads from the ref via `useSyncExternalStore`. |
| **Architecture D (signals) significantly outperforms B and C** | Evaluate whether adopting signals for the transport layer only (playhead, playback state) is worth the additional dependency. Zustand remains for project state. This is a hybrid approach. |
| **All architectures fail at 60fps with 100 clips** | The problem is not state management but rendering. Investigate whether the timeline component itself is too expensive to render. Move to canvas-based timeline rendering (draw clips on a `<canvas>` instead of DOM elements). This is a significant architectural pivot. |
| **Linear selector scan exceeds 1ms at 100 clips** | Implement an interval tree (`@flatten-js/interval-tree` or custom) indexed by clip frame ranges. Rebuild the index on clip mutations only (not on playhead movement). |
| **Undo/redo with zundo exceeds 50ms** | Switch from full-state snapshots to a command-pattern undo system. Each action records a forward and reverse operation rather than cloning the entire state tree. More complex but O(1) memory per undo step. |

### Risk if Skipped

The RISKS_AND_NEXT_STEPS.md (Risk #7) identifies timeline state performance as a high-priority risk. The architecture document mandates separation of transport state from project state but does not prescribe the exact mechanism. Without this spike:

1. The state architecture will be designed theoretically rather than empirically. A wrong choice (e.g., single naive store) will cause pervasive jank that is expensive to fix because every component's store subscription pattern must change.
2. The undo/redo system will be built without knowing whether `zundo`'s snapshot approach is viable at scale, potentially requiring a late-stage rewrite to command-pattern.
3. Selector performance assumptions will be untested. If `selectActiveClipsAtFrame()` is too slow, the entire preview-to-store feedback loop stalls.

---

## Spike Execution Schedule

All three spikes are independent. With two or more engineers, they can run in parallel.

```
Week 1                    Week 2
Day 1-5                   Day 6-10
+---------------------+   +---------------------+
| Spike 1: Frame       |   | Spike 1: (continued) |
| Decode (5 days)      |   | if needed, else done |
+---------------------+   +---------------------+
| Spike 2: Recording   |   | Spike 2: (continued) |
| (5 days)             |   | if needed, else done |
+---------------------+   +---------------------+
| Spike 3: Timeline    |   | Spike 3: (continued) |
| State (5 days)       |   | if needed, else done |
+---------------------+   +---------------------+

Day 10: Spike Review Meeting
  - Review all three RESULTS.md documents
  - Make architecture decisions
  - Update ARCHITECTURE.md with findings
  - Proceed to Phase 1 (Foundation)
```

## Spike Outcomes

### Spike 1: Frame-Accurate Decoding — RESOLVED

**Result**: FFmpeg CLI per-frame spawn is ~130-180ms for 1080p (unusable for interactive preview). Persistent FFmpeg sequential decode is ~57ms/frame (acceptable for export). HTML5 `<video>` seeking is keyframe-only (architecturally wrong).

**Decision**: WebCodecs `VideoDecoder` for preview (renderer process, hardware-accelerated, frame-accurate). Persistent FFmpeg child process for export (main process, sequential decode). No per-frame FFmpeg CLI spawning in the UI path.

**Remaining**: None. Both `preview-renderer` (PixiJS) and `export-renderer` (Canvas + FFmpeg) packages are implemented and follow this architecture. The `frame-resolver` package handles shared frame resolution logic.

**Risk status**: Fully retired. Architecture implemented in production code.

### Spike 2: Per-Platform Recording — PARTIALLY RESOLVED (Linux only)

**Result**: Linux/X11 confirmed working — `desktopCapturer.getSources()` returns sources programmatically, system audio available via PipeWire monitor sources, webcam and mic detected. Wayland requires portal picker (accepted limitation).

**Decision**: Linux (X11) is first-class for v1. Wayland via portal with UX limitations. `CaptureBackend` interface designed with platform-specific strategies.

**Remaining**: macOS and Windows need the same testing on those platforms. System audio behavior (macOS requires virtual audio device, Windows uses WASAPI loopback) needs hands-on verification.

**Risk status**: Linux recording risk retired. Cross-platform risk reduced but not fully retired until macOS/Windows are tested.

### Spike 3: Timeline State Performance — RESOLVED

**Result**: `selectActiveClipsAtFrame` runs in <0.005ms for 100 clips, <0.01ms for 5000 clips (1000x under the 1ms target). Linear scan is sufficient — no interval tree needed. Architecture B (split stores) is the correct approach.

**Decision**: Use split Zustand stores — `useTransportStore` for playhead/isPlaying/playbackRate (30-60Hz updates), `useProjectStore` for ProjectDocument slices + undo/redo via zundo. All React clip components subscribe only to `useProjectStore`; preview/playhead UI subscribes only to `useTransportStore`.

**Remaining**: None. Fully implemented in the `@rough-cut/store` package with split stores and zundo undo/redo.

**Risk status**: Fully retired. Production store is built on this architecture.

## Exit Criteria for Phase 0

Phase 0 is complete when ALL of the following are true:

1. All three RESULTS.md documents are written with empirical data.
2. A frame decoding approach is selected and justified.
3. The per-platform recording compatibility matrix is complete.
4. A timeline state architecture is selected and justified.
5. ARCHITECTURE.md is updated to reflect any decisions changed by spike findings.
6. No "unknown" cells remain in any decision matrix -- every outcome has a documented path forward.

---

*This document was drafted based on the risk analysis in `docs/RISKS_AND_NEXT_STEPS.md`, the architecture specification in `docs/ARCHITECTURE.md`, and the MVP specification in `docs/MVP_SPEC.md`.*
