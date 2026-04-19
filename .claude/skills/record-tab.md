---
name: record-tab
description: Record tab in-app UI — source selection, device toggles, live preview, inspector panels (background, camera, presentation), and recording configuration. Auto-activates when working on the Record tab components.
triggers:
  - RecordTab
  - BottomBar
  - RecordButton
  - SourcePicker
  - LivePreview
  - ModeSelectorRow
  - CaptureStatus
  - useRecording
  - useRecordState
  - useLivePreview
  - record-state
  - RecordRightPanel
  - InspectorShell
---

# Record Tab — Architectural Context

## Overview

The Record tab is where users configure their recording setup: pick a screen/window source, toggle microphone/camera/system audio, see a live preview of what will be captured, and adjust visual settings (background, camera shape, presentation events). Once configured, clicking REC hands off to the recording session flow (see recording-session-flow skill).

## Product Standard

The quality bar for the Record tab is no longer just "feature exists." It must feel like a premium recorder in the Screen Studio / FocuSee class:

1. **Stable and trustworthy first** — permission diagnostics, source/device recovery, controller safety, autosave, reopen fidelity, and preview/export parity come before flashy polish.
2. **Build on infrastructure** — do not add premium polish on top of unreliable session state, broken persistence, or weak preview parity.
3. **One-take readiness** — teleprompter, audio confidence, camera layout control, captions, Smart Cut, and destination presets should make a tutorial mostly done by the time recording stops.
4. **Record-native polish** — premium zoom/cursor/camera/annotation behavior belongs in Record review, not deferred to Edit.

## Development Path

When planning or implementing Record work, follow this sprint order unless the user explicitly reprioritizes:

### Sprint R1 — Record Trust Infrastructure

These tasks make recording safe, recoverable, and believable:

- `TASK-143` permission diagnostics + deep links + preflight test
- `TASK-144` mid-take source/device recovery with re-target and offline badge
- `TASK-145` floating controller hide/fade + never-in-video guarantee
- `TASK-146` preview/export fidelity enforcement
- `TASK-147` reopen/project-move fidelity for templates and sidecars
- `TASK-148` crash-resilient autosave + partial-take recovery
- `TASK-152` fear-reducing micro-affordances
- `TASK-153` auto desktop icon hide + Do Not Disturb
- `TASK-154` replay buffer hotkey
- existing related work: `TASK-100`, `TASK-124`, `TASK-125`, `BUG-004`, `BUG-011`, `BUG-013`

Do not call Record premium until this layer is substantially green in code and tests.

### Sprint R2 — Record Polish Core

These tasks make the recording output feel competitive with Screen Studio / FocuSee:

- `TASK-122` zoom marker transform + paused-selection behavior
- `TASK-123` zoom sidecar + cursor continuity persistence
- `TASK-129` automatic zoom generation from clicks
- `TASK-130` advanced cursor styles, click effects, click sounds
- `TASK-131` cinematic motion blur
- `TASK-132` privacy blur masks and spotlight regions
- `TASK-150` per-segment visibility toggles
- `TASK-158` camera auto-shrink during zoom activation
- `TASK-159` full dynamic camera layout authoring UX

### Sprint R3 — Record Assistance

These tasks make one-take tutorial creation realistic:

- `TASK-089` keyboard shortcut capture + overlays
- `TASK-090` highlights and annotations
- `TASK-091` titles and callouts
- `TASK-093` teleprompter
- `TASK-149` clipping warnings + ducking preview + multi-track review
- `TASK-155` AI captions with timeline edit + styling
- `TASK-156` Smart Cut for filler words, silence, breaths, and mouth clicks

### Sprint R4 — Record Packaging

These tasks connect Record output to publishing and repeatable workflows:

- `TASK-094` shareable recording presets and profiles
- `TASK-121` restore template picker and preset application flow
- `TASK-151` destination presets with social framing and export linkage
- `TASK-157` watermark/logo inspector with persistent branding controls
- `TASK-095` mobile device capture with device frames

## Canonical Constraints

From the project constitution:

1. **Recording produces assets + metadata, not clips** (§6) — The Record tab creates Assets. Clip creation is a separate concern handled after recording completes.

2. **Main process owns all I/O** (§8) — Source enumeration (`desktopCapturer.getSources()`) runs in main via IPC. The renderer only receives source metadata.

3. **UI does NOT own rendering logic** (§2) — Live preview uses a plain `<video>` element for the stream. Post-recording preview uses the PixiJS compositor via a thin canvas adapter.

4. **No business logic in components** — Recording state machine lives in `useRecordState` hook. MediaRecorder lifecycle lives in `useRecording` hook. Components are pure UI.

5. **Frame-based, not time-based** (§4) — Elapsed time display converts from internal frame count for user-facing display.

## State Machine

`useRecordState` manages a 7-state FSM via `useReducer`:

```
idle → loading-sources → ready → countdown → recording → stopping → ready
                                    ↘ error ↗ (any state can error)
```

| State             | Description                                   |
| ----------------- | --------------------------------------------- |
| `idle`            | Initial state, nothing loaded                 |
| `loading-sources` | Fetching available sources from main          |
| `ready`           | Sources loaded, user can configure and record |
| `countdown`       | 3-2-1 countdown before capture starts         |
| `recording`       | Actively capturing                            |
| `stopping`        | MediaRecorder stopped, saving to disk         |
| `error`           | Something failed, can retry                   |

## Component Architecture

```
RecordTab (orchestrator)
├── RecordRightPanel (inspector)
│   └── InspectorShell
│       ├── BackgroundCategory (bg color/gradient/image)
│       ├── CameraCategory (shape, border, shadow)
│       └── PresentationCategory (zoom, cursor, titles)
├── Preview Stage
│   ├── LivePreviewVideo (during live/recording — plain <video>)
│   └── PreviewCanvas (after recording — PixiJS compositor)
├── ModeSelectorRow (fullscreen / window / area)
└── BottomBar (controls toolbar)
    ├── Source/Mic/Camera/Audio device segments
    ├── RecordButton (idle/countdown/recording states)
    └── CaptureStatus (elapsed timer + resolution)
```

## File Map

```
apps/desktop/src/renderer/features/record/
  RecordTab.tsx              — Top-level orchestrator, wires all hooks + components
  record-state.ts            — useRecordState hook + reducer (FSM)
  use-recording.ts           — useRecording hook (MediaRecorder lifecycle)
  use-live-preview.ts        — useLivePreview hook (stream acquisition)
  LivePreviewVideo.tsx       — <video> element for live stream with background styling
  BottomBar.tsx              — Device toggles + REC button + elapsed display
  RecordButton.tsx           — Animated record/stop button with countdown
  CaptureStatus.tsx          — Elapsed timer + resolution label
  ModeSelectorRow.tsx        — Fullscreen/window/area mode pills
  SourcePickerPopup.tsx      — Grid of available screen/window sources
  RecordRightPanel.tsx       — Inspector panel container
  record-types.ts            — RecordingStatus, SourceInfo, DeviceConfig types

apps/desktop/src/main/recording/
  capture-service.mjs        — getSources() + saveRecording() + ffprobe

apps/desktop/src/shared/
  ipc-channels.mjs           — recording:get-sources, recording:start, etc.
```

## Key Hooks

### useRecordState

- Manages FSM transitions
- Holds: status, sources list, selected source, selected devices, error
- Pure state management, no side effects

### useLivePreview(sourceId)

- Acquires MediaStream from desktopCapturer as soon as source is selected
- Returns: `{ stream }` — the MediaStream object
- Stream is reused by useRecording (no duplicate getUserMedia)
- **Cleanup order matters**: `pause()` → `srcObject = null` → `track.stop()`
- Uses `mounted` boolean guard to prevent setting srcObject after cleanup

### useRecording({ stream, onElapsedChange, onAssetCreated })

- Accepts external stream from useLivePreview (does NOT call getUserMedia itself)
- Creates MediaRecorder from the provided stream
- Collects chunks at 1-second intervals
- On stop: assembles blob → ArrayBuffer → IPC to main → saveRecording()
- Fires onAssetCreated callback with file metadata
- Manages elapsed timer (100ms interval)
- Does NOT stop stream tracks on stop (useLivePreview owns the stream lifecycle)

## Live Preview — Proven Implementation Pattern

Based on Recordly (https://github.com/webadderall/Recordly) and multiple verified Electron screen recorders.

### DOM Structure (MANDATORY — no deviations)

The preview card is the ONLY sized element. Everything inside uses `position: absolute; inset: 0`. NO flex containers, NO percentage heights in the preview chain.

```
PreviewCard (outer div)
  position: relative
  width: 100%
  max-width: 1040px
  aspect-ratio: 16 / 9        ← THIS gives the card a definite height
  overflow: hidden
  border-radius: 18px
  │
  ├── <video>                  ← DIRECT child, no wrapper divs
  │     position: absolute
  │     inset: 0
  │     width: 100%
  │     height: 100%
  │     object-fit: contain    ← works on <video>, NOT on <canvas>
  │
  ├── <canvas> (compositor)    ← DIRECT child via useCompositor callback ref
  │     position: absolute
  │     inset: 0
  │     width: 100%
  │     height: 100%
  │     (no object-fit — canvas ignores it; CSS stretches to fill host)
  │
  ├── overlay div (vignette)   ← sibling, higher z-index, pointer-events: none
  └── overlay div (border)     ← sibling, higher z-index, pointer-events: none
```

### Display Mode Logic

Three mutually exclusive modes, checked in priority order:

```tsx
{
  selectedSourceId ? (
    // LIVE: source selected → show <video> with MediaStream
    <LivePreviewVideo stream={liveStream} />
  ) : hasRecordingAsset ? (
    // REVIEW: no source, but has recorded asset → show compositor canvas
    <div ref={previewRef} style={{ position: 'absolute', inset: 0 }} />
  ) : null;
}
// EMPTY: no source, no recording → PreviewCard shows empty state
```

**CRITICAL**: `selectedSourceId` MUST be checked FIRST. Previous bug: `hasRecordingAsset` was checked first, so the compositor (with wrong resolution) always rendered instead of the live video.

### LivePreviewVideo Component (proven pattern from Recordly)

```tsx
function LivePreviewVideo({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || !stream) return;

    video.srcObject = stream;
    const p = video.play();
    if (p) p.catch(() => {}); // ignore autoplay policy rejections

    return () => {
      video.pause();
      video.srcObject = null;
      // Do NOT stop tracks here — useLivePreview owns the stream
    };
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        backgroundColor: 'black',
      }}
    />
  );
}
```

Key details:

- NO wrapper div — the `<video>` IS the component
- `position: absolute; inset: 0` — video fills the card (card has `position: relative`)
- `object-fit: contain` — preserves aspect ratio, letterboxes if needed
- `backgroundColor: 'black'` — letterbox bars are black, not transparent
- Stream bound via `useEffect` with cleanup, NOT via callback ref
- `.play()` called imperatively after setting `srcObject`
- `autoPlay` attribute as fallback

### useLivePreview Hook (proven pattern from Recordly)

```tsx
function useLivePreview(sourceId: string | null) {
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (!sourceId) {
      setStream(null);
      return;
    }

    let mounted = true; // ← prevents setting state after cleanup
    let acquired: MediaStream | null = null;

    (async () => {
      acquired = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
          },
        } as any,
      });

      if (!mounted) {
        acquired.getTracks().forEach((t) => t.stop());
        return;
      }
      setStream(acquired);
    })().catch((err) => {
      console.error('[useLivePreview]', err);
    });

    return () => {
      mounted = false;
      if (acquired) {
        acquired.getTracks().forEach((t) => t.stop());
      }
    };
  }, [sourceId]);

  return { stream };
}
```

### Common Pitfalls (from debugging session 2026-03-28)

1. **Wrong branch rendering**: If `hasRecordingAsset` is checked before `selectedSourceId`, the compositor canvas renders instead of the live video. The video appears small because the compositor renders at its internal resolution (640x360 or 1920x1080 scaled down as a PixiJS sprite).

2. **Flex wrappers between card and video**: Any `display: flex` div between the card and the `<video>` breaks `height: 100%` resolution. The video falls back to its intrinsic size. NEVER put flex containers in the preview chain.

3. **Using callback ref instead of useEffect for srcObject**: Callback refs fire synchronously during render. `srcObject` assignment and `.play()` should happen in an effect with proper cleanup.

4. **Not verifying which component renders**: Before debugging CSS, ALWAYS confirm the target component is in the DOM (add `border: 3px solid red` or check via DevTools/Playwright).

5. **PixiJS `autoDensity` overwrites canvas CSS**: With `autoDensity: true`, PixiJS sets `canvas.style.width/height` on every `renderer.resize()` call, overwriting any CSS you set. Use `autoDensity: false` + `resolution: 1` and manage CSS yourself.

6. **useCompositor timing race**: `ensureCompositor()` must run synchronously in the hook body (NOT in `useEffect`). The callback ref fires during React's commit phase (before effects). If `initPromise` is null when the ref fires, `attachCanvasToHost` never runs and the canvas is never attached to the DOM.

7. **PixiJS sprite anchor vs position**: Default `anchorX/Y: 0.5` sets the container pivot to the center of the sprite. If `container.position` isn't also set to the center of the frame, the sprite will be offset. Correct: `position.set(anchorX * frameWidth + x, anchorY * frameHeight + y)`.

## IPC Channels

| Channel                    | Direction     | Purpose                                                  |
| -------------------------- | ------------- | -------------------------------------------------------- |
| `recording:get-sources`    | renderer→main | Enumerate available sources                              |
| `recording:save-recording` | renderer→main | Send buffer + metadata, get back file path + probed info |

Defined in `apps/desktop/src/shared/ipc-channels.mjs`.
Preload bridge at `apps/desktop/src/preload/index.mjs`.

## Inspector Panels

The Record tab uses the **InspectorShell** pattern (shared with Edit tab):

- **BackgroundCategory**: Solid color, gradient, or image behind the captured content
- **CameraCategory**: Webcam shape (circle/rounded-rect/pill), border, shadow, position
- **PresentationCategory**: Auto-zoom on click, cursor highlight, shortcut title overlays

Inspector state lives in the project store under `composition.presentationEvents` and camera/background settings.

## Premium Benchmark Checklist

Use this list when deciding whether the Record tab is actually competitive:

- **Trust**: permission diagnostics, source recovery, device recovery, autosave, controller safety, safe stop, clear recording indicators
- **Parity**: preview matches export, reopen matches what was recorded, moved projects do not lose Record metadata
- **Camera**: dynamic layouts, per-segment camera visibility, auto-shrink during zoom, background removal/blur, shaped PiP
- **Cursor + Zoom**: automatic zoom generation, editable markers, click effects, click sounds, motion blur, spotlight/privacy controls
- **Assistance**: teleprompter, shortcut overlays, captions, Smart Cut, audio confidence indicators
- **Packaging**: presets, social-output presets, watermarking, mobile device framing

If a change improves polish but leaves trust or parity broken, finish the trust/parity layer first.

## Audio Level Monitoring

Real-time audio level display during recording and preview, using Web Audio API:

```
getUserMedia stream → MediaRecorder (recording)
                    → AudioContext → AnalyserNode → requestAnimationFrame → VU meter canvas
```

Both consumers tap the same stream (AnalyserNode is a read-only tap, no clone needed). This catches wrong device selection or muted mic before the recording is wasted.

**Implementation**: `AnalyserNode.getByteFrequencyData()` returns 0-255 amplitude values. Threshold ~10-20 = silence. Render as a simple bar in BottomBar alongside CaptureStatus.

## Safety Rules

- **Never import PixiJS in Record tab components** — live preview uses plain `<video>`, post-recording uses PreviewCanvas adapter
- **Don't mix capture logic with timeline logic** — Record tab creates assets only
- **Stream reuse is critical** — useLivePreview acquires once, useRecording reuses. Never call getUserMedia twice.
- **Device permissions must be handled gracefully** — show clear error states for denied mic/camera
- **Source list can change during session** — handle sources disappearing (window closed, display disconnected)
- **Countdown is cancelable** — user can abort during 3-2-1
- **Document stream sharing strategy** — decide whether to share one MediaStream or use `stream.clone()` for preview + recorder. Cloning allows independent mute/stop control.
- **Handle long recording memory leak** — Electron #41123: codec-dependent memory leak after 30-60 min. Track duration, warn at configurable threshold.

## What NOT to Do

- Don't put MediaRecorder logic in React components (use hooks)
- Don't render PixiJS during live preview (plain video element only)
- Don't expose timeline editing in the Record tab (presentation events yes, clip editing no)
- Don't access filesystem from renderer (IPC to main only)
- Don't store transient recording state in ProjectDocument (elapsed, status are ephemeral)
- Don't create Clips in the Record tab (only Assets — clip creation happens in App.tsx callback)
