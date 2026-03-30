# Timeline Backbone — Comprehensive Implementation Plan

## Summary

Fix the broken timeline infrastructure and implement proper clip operations so the timeline works like a real NLE editor. This is the backbone of Rough Cut — everything else builds on it.

## User Requirements (from interview)

- New recordings auto-place at frame 0 on V1
- Record tab shows full project timeline (shared playhead with Edit)
- Edit/Export preview is playhead-resolved (shows clip under playhead, black in gaps)
- Clips clamped to source duration (no stretch beyond recording length)
- Clip overlap = overwrite (split + remove overlap portion)
- Clip operations: move, trim, split — all undoable
- Drag UX: ghost + snap lines
- Cross-track drag (V1 ↔ V2) in Edit tab
- Snap with toggle (already exists)
- Zoom: slider + Ctrl+scroll wheel
- Auto-repair old .roughcut files (fix clip positions)
- Playback must work (play through clips, switch videos at boundaries)

## Future Architecture: Project Hierarchy

> Not implemented now, but the plan must not block this.

```
Project
├── Recordings
│   ├── Recording 1 (clips/takes — appended in Record tab)
│   ├── Recording 2 (clips/takes)
│   └── Recording 3 (clips/takes)
└── Sequences (Premiere-style — Edit tab)
    ├── Sequence 1 (imports from recordings, independent timeline)
    └── Sequence 2 (imports from recordings)
```

- **Record tab**: Self-contained capture tool. Multiple takes append to a recording's timeline. Can overwrite sections.
- **Edit tab**: Premiere-style sequences. Import recordings, arrange clips on multi-track timeline.
- **Recording clips** (takes) vs **Sequence clips** (editorial) are different concepts — name them distinctly in the data model later (e.g. `Take` vs `Clip`).
- For now: the current flat `composition.tracks[].clips[]` model works for Phase 1-2. Sequences are a future addition.

---

## Phase 1: Fix Broken State (revert bad patches, stabilize)

> Goal: Get back to a working baseline where all 3 tabs show video correctly.

### 1.1 Revert RecordingPlaybackVideo to working state
- **Restore `clipTimelineIn` lookup** — the component needs this for clips that aren't at frame 0
- **Restore `useProjectStore` import**
- **Remove the broken `isInRange` / visibility hack**
- **Keep the `assetId` prop** — used to find the right clip
- Frame mapping: `(projectFrame - clipTimelineIn) / fps`

### 1.2 Fix clip creation in App.tsx handleRecordingComplete
- Create clip at **frame 0** (not appended after previous clips)
- Set composition duration to `max(existing, clipDuration)`
- Keep `createClip` import

### 1.3 Fix TimelinePlaybackVideo for Edit/Export tabs
- Edit tab: `TimelinePlaybackVideo` (resolves clip at playhead)
- Export tab: `TimelinePlaybackVideo` (same)
- Record tab: `RecordingPlaybackVideo` (shows active recording)
- TimelinePlaybackVideo shows **black when no clip** at playhead
- Must handle seeking correctly using `(playheadFrame - clip.timelineIn + clip.sourceIn) / fps`

### 1.4 Auto-repair saved projects on load
- In project load path: walk all clips on V1
- If clips are sequentially appended (timelineIn > 0 and equals previous clip's timelineOut), reposition each clip to start at frame 0
- Recalculate composition duration after repair

### 1.5 Keep good fixes from this session
- `createReadStream` range request protocol handler (index.mjs) — **KEEP**
- FFmpeg remux in capture-service.mjs — **KEEP**
- Debug log cleanup — **KEEP**
- Compositor sprite sizing fix (preview-compositor.ts) — **KEEP**

### 1.6 Verify Phase 1
- [ ] Open project from Projects tab → Record tab shows correct video
- [ ] Switch to Edit tab → shows correct video at playhead (or black in gap)
- [ ] Switch to Export tab → same as Edit
- [ ] Scrub all timelines → video frame updates correctly
- [ ] New recording creates clip at frame 0
- [ ] Old .roughcut files load with clips at frame 0

---

## Phase 2: Clip Operations (move, trim, split)

> Goal: Make clips behave like a real NLE timeline.

### 2.1 Clip drag-to-move (TASK-017)
- **Mouse interaction**: mousedown on clip body (not trim handles) → enter drag mode
- **Ghost rendering**: semi-transparent clone of clip follows cursor horizontally
- **Snap lines**: vertical guide lines appear when ghost edge is within 5px of:
  - Other clip edges (timelineIn, timelineOut)
  - Playhead position
- **Drop**: update clip's `timelineIn`/`timelineOut` (maintaining duration)
- **Undo**: single undo step for the entire drag (start → drop)
- **Store action**: `moveClip(trackId, clipId, newTimelineIn)` — already exists

### 2.2 Trim edge clamping
- **Left trim handle**: `newTimelineIn` clamped so `sourceIn >= 0`
  - Formula: `newSourceIn = clip.sourceIn + (newTimelineIn - clip.timelineIn)`
  - Clamp: `newSourceIn >= 0` → `newTimelineIn >= clip.timelineIn - clip.sourceIn`
- **Right trim handle**: `newTimelineOut` clamped so `sourceOut <= asset.duration`
  - Formula: `newSourceOut = clip.sourceOut + (newTimelineOut - clip.timelineOut)`
  - Clamp: `newSourceOut <= asset.duration`
- Modify existing `trimClipLeftEdge` and `trimClipRightEdge` store actions
- Pass asset duration as parameter or look it up in the store

### 2.3 Overwrite on overlap
- When a clip is dropped onto existing clip(s) on the same track:
  1. Identify all clips that overlap with the drop zone `[newIn, newOut)`
  2. For each overlapping clip:
     - **Fully covered** (existing clip entirely inside drop zone) → delete it
     - **Left overlap** (drop zone covers the start of existing clip) → trim existing clip's timelineIn to `newOut`
     - **Right overlap** (drop zone covers the end of existing clip) → trim existing clip's timelineOut to `newIn`
     - **Middle split** (drop zone is inside existing clip) → split existing clip at `newIn` and `newOut`, delete the middle
  3. Place the dropped clip
- Implement as a **single compound store action** for atomic undo

### 2.4 Cross-track drag (TASK-018)
- Vertical mouse movement during drag switches target track
- Visual: highlight target track lane with a subtle color
- On drop: `moveClipToTrack(clipId, fromTrackId, toTrackId)` + horizontal position
- Same overwrite rules apply on the target track

### 2.5 Verify Phase 2
- [ ] Drag a clip from frame 0 to frame 500 → clip moves, undo reverts it
- [ ] Trim left edge → stops at source start boundary
- [ ] Trim right edge → stops at source end boundary
- [ ] Can NOT stretch clip beyond source duration
- [ ] Drop clip onto another → existing clip is split/trimmed correctly
- [ ] Drag clip from V1 to V2 → clip changes track
- [ ] All operations are undoable

---

## Phase 3: Playback & Zoom Polish

> Goal: Smooth playback across clip boundaries and better zoom UX.

### 3.1 Multi-clip playback on Edit/Export
- `TimelinePlaybackVideo` handles play state:
  - On play: start playing the video for the clip at playhead
  - When playhead reaches clip end: find next clip, switch video source, continue
  - In gaps between clips: show black, advance playhead at project fps, resume at next clip
  - Pre-load next clip's video element for seamless transition

### 3.2 Ctrl+scroll zoom
- Listen for `wheel` events on timeline with `ctrlKey`
- Zoom centered on cursor position
- Clamp zoom range to min/max pixels-per-frame

### 3.3 Zoom-to-fit
- Calculate total timeline extent (rightmost clip end)
- Set pixels-per-frame so all content fits visible width
- Add "Fit" button to EditTimelineShell toolbar
- Auto zoom-to-fit when opening project from Projects tab

### 3.4 Verify Phase 3
- [ ] Press play → video plays through clips, switches at boundaries
- [ ] Gaps show black during playback
- [ ] Ctrl+scroll zooms centered on cursor
- [ ] Fit button shows all clips
- [ ] Opening project auto-fits zoom

---

## Files to Modify

| File | Phase | Changes |
|------|-------|---------|
| `RecordingPlaybackVideo.tsx` | 1 | Restore clipTimelineIn, remove isInRange hack |
| `TimelinePlaybackVideo.tsx` | 1 | Fix clip resolution logic, black in gaps, proper seeking |
| `EditTab.tsx` | 1 | Use TimelinePlaybackVideo |
| `ExportTab.tsx` | 1 | Use TimelinePlaybackVideo |
| `App.tsx` | 1 | Clip at frame 0, keep createClip |
| `ProjectsTab.tsx` | 1 | Auto-repair clips on load, seekToFrame(0) |
| `index.mjs` (main) | 1 | Keep createReadStream protocol handler |
| `capture-service.mjs` | 1 | Keep FFmpeg remux |
| `TimelineStrip.tsx` | 2 | Drag-to-move, ghost, snap lines, overwrite |
| `project-store.ts` | 2 | Trim clamping, overwrite compound action, cross-track move |
| `EditTimelineShell.tsx` | 3 | Ctrl+scroll zoom, fit button |
| `TimelinePlaybackVideo.tsx` | 3 | Multi-clip playback, gap handling |

## Risk Mitigation

- **Test after each phase** — don't move to Phase 2 until Phase 1 is visually verified via Playwright CDP
- **Commit after each phase** — checkpoint known-good state
- **Don't modify working code** unless directly related to the current phase
- **Sequence architecture**: current clip model works for now; avoid adding fields that conflict with future `Take` vs `Clip` separation

## Research Sources

- [React Video Editor timeline architecture](https://www.reactvideoeditor.com/features/timeline)
- [Kdenlive overwrite mode documentation](https://docs.kdenlive.org/en/cutting_and_assembling/editing.html)
- [Electron protocol.handle seeking bug #38749](https://github.com/electron/electron/issues/38749)
- [Remotion timeline building guide](https://www.remotion.dev/docs/building-a-timeline)
- [react-timeline-editor](https://github.com/xzdarcy/react-timeline-editor)
