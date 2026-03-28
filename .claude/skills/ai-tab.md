---
name: ai-tab
description: AI tab — auto-zoom from click data, transcript-based editing, filler/silence removal, auto-captions, AI suggestions as annotations. Auto-activates when working on AI features, transcription, captions, or the AI tab.
triggers:
  - AITab
  - ai-bridge
  - AIAnnotation
  - transcript
  - caption
  - subtitle
  - filler-word
  - silence-removal
  - auto-zoom
  - auto-caption
  - Whisper
  - ASR
  - SuggestedCut
---

# AI Tab — Architectural Context

## Overview

The AI tab provides AI-powered editing assistance: auto-zoom generation from click data, transcription and text-based editing, filler word and silence removal, auto-captions, and AI-suggested cuts. AI results are written as annotations/metadata in the ProjectDocument — never as direct mutations. Users accept or reject suggestions through store actions.

## Industry Patterns (Research-Based)

### Most Valued AI Features for Screen Recording (Priority Order)

1. **Auto-zoom on clicks** — The single most differentiating feature. Screen Studio, FocuSee, Camtasia SmartFocus all offer it. Detects cursor clicks → generates zoom keyframes automatically.
2. **Silence and filler removal** — Batch detection of "um/uh" and dead air. Descript, FocuSee, CapCut, Premiere all offer it.
3. **Auto-captions** — Expected as baseline. Whisper-class ASR + word-level timestamps + SRT rendering.
4. **Transcript-based editing** — Descript's innovation: edit video by editing text. Future feature for Rough Cut.

### Auto-Zoom Algorithm (Screen Studio / Camtasia SmartFocus)

```
1. Record: Capture click events as { frameNumber, x, y, type }
2. Cluster: Group nearby clicks within time window (e.g., 500ms)
3. Compute zoom rect: Center on click, add padding, clamp to screen
4. Generate keyframes: zoom-in → hold → zoom-out, with spring curves
5. Write to model: ZoomKeyframe { frameIn, frameOut, targetRect, springConfig }
6. User review: Zoom track in timeline, drag edges, delete unwanted
```

Click metadata is recorded alongside video during capture (not extracted post-hoc). This matches Screen Studio's two-pass model and Camtasia's `.trec` format.

### Click Event Capture (Technical Implementation)

`desktopCapturer` does NOT provide mouse click data. A separate system-level hook is required:

- **Package**: `iohook` (use maintained fork `@mechakeys/iohook` — original `wilix-team/iohook` abandoned since 2021)
- **Synchronization**: Record `performance.now()` at MediaRecorder start. Each click event gets `{ x, y, timestamp: performance.now() }`. Convert to frame: `frame = Math.round((timestamp - startTime) / 1000 * fps)`.
- **Wayland limitation**: iohook depends on X11. On Linux Wayland, global mouse hooks may not work without XWayland. Document as known limitation.
- **Edge cases to filter**: Right-clicks (usually not zoom-worthy), drag operations (zoom to start position only), rapid double-clicks (coalesce), menu clicks that immediately dismiss.

### Filler Word Removal (Descript pattern)

1. ASR transcribes audio → word-level timestamps: `[{ word, startFrame, endFrame }]`
2. Pattern-match against filler word list ("um", "uh", "like", "you know", "so", "basically")
3. Present detected fillers as **inline annotations** in transcript view (colored underline)
4. User selects types to remove (per-word-type toggles or individual checkboxes)
5. "Avoid harsh cuts" option: skip removals where surrounding audio would clip awkwardly
6. Apply = ripple-delete the corresponding timeline segments
7. **Non-destructive**: removed segments are hidden gaps, not deleted — restorable

### Silence Detection (Two Distinct Pipelines)

**Post-recording analysis** (primary): Use FFmpeg `silencedetect` filter in main process:
```bash
ffmpeg -i input.wav -af silencedetect=noise=-30dB:d=0.5 -f null -
```
Parse stdout for `silence_start`/`silence_end` timestamps. Fast, frame-accurate, no ASR needed.

**Live monitoring during recording** (secondary): Use Web Audio `AnalyserNode` in renderer for real-time silence indication (VU meter). This is the Record tab concern, not AI tab.

These are separate use cases — do not conflate them.

### Whisper Model Management

Whisper models are NOT bundled with the app — they must be downloaded at first use:
- `tiny` (~75MB RAM, fastest, lower accuracy)
- `base.en` (~142MB RAM, recommended default for English narration)
- `small.en` (~466MB RAM, higher accuracy)

**Packages**: `smart-whisper` (auto-manages model downloads) or `whisper-node-addon` (manual download). Include a model download progress UI on first transcription request.

### Auto-Captions

Whisper-class ASR produces: `[{ word: "hello", startMs: 1230, endMs: 1480 }]`
- Group tokens into caption lines by timing + character budget (≤42 chars/line typically)
- Output as SRT/VTT or internal CaptionTrack
- Style presets for font, color, animation (CapCut-style word-by-word highlight)
- 94-99% accuracy on clean English audio

### AI Results as Metadata (Architecture Pattern)

From Rough Cut's constitution: AI-bridge writes metadata, never mutates clips directly.

```typescript
interface AIAnnotations {
  suggestedZooms: SuggestedZoom[];      // Auto-zoom proposals
  fillerWordMarks: FillerWordMark[];    // Detected filler words
  silenceRanges: SilenceRange[];        // Detected silences
  captionTrack: CaptionSegment[];       // Generated captions
  suggestedCuts: SuggestedCut[];        // AI-proposed edit points
  transcript: TranscriptWord[];         // Full word-level transcript
}
```

All proposals. User acceptance triggers store actions that modify the composition.

### Accept/Reject UX Patterns

- **Descript**: Filler words shown as colored underlines in transcript. Sidebar lists all instances grouped by word type with checkboxes. Batch select/deselect.
- **Premiere**: Transcript panel with highlighted filler words. Delete selected text = ripple delete video.
- **CapCut**: Sensitivity threshold slider. Preview proposed cuts. Accept/reject individually or batch.
- **Opus Clip**: AI generates candidate clips with "virality scores." User reviews grid, opens inline editor per clip.

**Best pattern for Rough Cut**: Annotations appear in a dedicated AI panel. Each suggestion type has its own section. Individual accept/reject buttons + batch actions. Sensitivity sliders for silence/filler detection.

## Canonical Constraints

From the project constitution:

1. **AI-bridge depends only on project-model** — `@rough-cut/ai-bridge` has no UI dependencies, no rendering dependencies.

2. **AI writes metadata, not mutations** — AI produces `AIAnnotations` (marks, labels, suggested cuts). Mutations go through store/timeline-engine actions only when user accepts.

3. **Main process owns all I/O** (§8) — AI workers (Whisper, LLM calls) run in main process. Renderer receives results via IPC.

4. **Frame-based** (§4) — All AI annotations use frame numbers, not milliseconds. Conversion happens at the processing boundary.

5. **Effects are data** (§7) — Zoom keyframes generated by AI are the same data structure as manually-created ones. No special "AI zoom" type.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Main Process                                    │
│                                                  │
│  AIWorkerManager                                 │
│  ├── TranscriptionWorker (Whisper / cloud ASR)   │
│  │   └── Returns word-level timestamps           │
│  ├── FillerDetector (pattern matching on words)   │
│  │   └── Returns FillerWordMark[]                │
│  ├── SilenceDetector (amplitude + ASR gaps)      │
│  │   └── Returns SilenceRange[]                  │
│  ├── ZoomGenerator (click clustering algorithm)  │
│  │   └── Returns SuggestedZoom[]                 │
│  └── CaptionGenerator (group words into lines)   │
│      └── Returns CaptionSegment[]                │
│                                                  │
│  Results → IPC → Renderer                        │
└─────────────────────────────────────────────────┘
         ↕ IPC
┌─────────────────────────────────────────────────┐
│  Renderer — AI Tab                               │
│                                                  │
│  AITab (orchestrator)                            │
│  ├── TranscriptView          — Word-level text   │
│  │   └── Highlighted fillers / silences          │
│  ├── ZoomSuggestionsPanel    — Proposed zooms    │
│  │   └── Accept/reject per zoom + batch          │
│  ├── FillerRemovalPanel      — Per-type toggles  │
│  │   └── Sensitivity slider + preview            │
│  ├── SilenceRemovalPanel     — Threshold slider  │
│  │   └── Preview proposed cuts                   │
│  ├── CaptionEditor           — Edit/style caps   │
│  └── SuggestedCutsPanel      — AI edit proposals │
│                                                  │
│  Accept action → Store action → Timeline mutation│
└─────────────────────────────────────────────────┘
```

## Data Model

```typescript
// In @rough-cut/project-model

interface SuggestedZoom {
  id: string;
  frameIn: number;
  frameOut: number;
  targetRect: { x: number; y: number; width: number; height: number };
  springConfig: { stiffness: number; damping: number; mass: number };
  confidence: number;  // 0-1
  status: 'pending' | 'accepted' | 'rejected';
}

interface FillerWordMark {
  id: string;
  word: string;          // "um", "uh", "like", etc.
  startFrame: number;
  endFrame: number;
  confidence: number;
  status: 'pending' | 'accepted' | 'rejected';
}

interface SilenceRange {
  id: string;
  startFrame: number;
  endFrame: number;
  amplitude: number;     // average amplitude in range
  status: 'pending' | 'accepted' | 'rejected';
}

interface CaptionSegment {
  id: string;
  text: string;
  startFrame: number;
  endFrame: number;
  words: TranscriptWord[];
}

interface TranscriptWord {
  word: string;
  startFrame: number;
  endFrame: number;
  confidence: number;
  isFiller: boolean;
}
```

## File Map (planned)

```
packages/ai-bridge/src/
  ai-bridge.ts                 — Orchestrates AI operations
  transcription.ts             — ASR integration (Whisper / cloud)
  filler-detector.ts           — Pattern matching on transcript
  silence-detector.ts          — Amplitude + gap analysis
  zoom-generator.ts            — Click clustering → zoom keyframes
  caption-generator.ts         — Word grouping into caption lines

apps/desktop/src/renderer/features/ai/
  AITab.tsx                    — Top-level orchestrator
  TranscriptView.tsx           — Word-level transcript with highlights
  ZoomSuggestionsPanel.tsx     — Proposed zoom review
  FillerRemovalPanel.tsx       — Filler word batch removal
  SilenceRemovalPanel.tsx      — Silence detection + removal
  CaptionEditor.tsx            — Caption editing + styling
  SuggestedCutsPanel.tsx       — AI-proposed edit points
```

## Implementation Order

1. **Click event recording** — Capture { frame, x, y } during recording (in capture-service)
2. **Zoom generator** — Click clustering → SuggestedZoom[] (pure function, testable)
3. **Zoom suggestions UI** — Display + accept/reject in AI tab
4. **ASR integration** — Whisper (local) or cloud API → TranscriptWord[]
5. **Transcript view** — Display word-level transcript
6. **Filler detection** — Pattern match on transcript
7. **Filler removal UI** — Per-type toggles + batch remove
8. **Silence detection** — Amplitude analysis + ASR gap merge
9. **Silence removal UI** — Sensitivity slider + preview
10. **Caption generation** — Word grouping + SRT output
11. **Caption editor** — Edit text, adjust timing, style presets

## Safety Rules

- **AI never mutates clips directly** — only writes annotations. User acceptance triggers store actions.
- **All AI results include confidence scores** — helps user make informed decisions
- **Filler removal must be non-destructive** — removed segments are hidden gaps, restorable
- **"Avoid harsh cuts" check** — verify audio transitions are clean before accepting removals
- **ASR runs in main process** — never in renderer (heavy computation)
- **Frame-based timestamps** — convert from ASR milliseconds at the processing boundary

### Additional AI Features (Future)

- **AI background removal** (webcam): MediaPipe Selfie Segmentation runs in renderer via WASM+WebGL. No native addon needed. Operates on `<canvas>` frames from webcam feed.
- **Scene detection**: FFmpeg `scdet` filter detects shot boundaries via frame difference analysis. No ML required.
- **AI noise reduction**: RNNoise (Mozilla, C library with WASM build) for microphone noise. Not Descript-quality but viable.

## What NOT to Do

- Don't let AI-bridge import from UI or rendering packages
- Don't auto-apply AI suggestions without user confirmation
- Don't store AI worker state in ProjectDocument (only accepted results)
- Don't use milliseconds in AIAnnotation data (convert to frames)
- Don't run Whisper in the renderer process (too heavy)
- Don't couple zoom generation with manual keyframe editing (same data model, different sources)
- Don't skip confidence scores (they help users trust/distrust suggestions)
