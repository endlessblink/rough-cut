# Censor regions — implementation plan

Tracked as **TASK-252** in `MASTER_PLAN.md`.

## Goal

Let the user hide any rectangular area of the screen for a chosen span of the timeline, so
passwords, emails, API keys, notifications and faces never reach an export. The censor stays
locked to the content it covers while zoom, pan and crop move that content around, and it works
on recordings that already exist without re-recording them.

Decisions locked with the user (2026-07-25):

- **Styles:** solid fill and pixelate, with an optional cosmetic softening blur _on top of_
  the destroyed pixels. The blur never samples the original frame, so it stays irreversible.
- **Motion:** static rectangle per region in v1. No keyframes, no tracking.
- **Timeline:** dedicated censor lane with draggable range chips, under the zoom lane.
- **Creation:** drag a box directly on the preview.

---

## 1. Why this shape

The preview and the export already agree on pixels because the headless export renderer
composites through the same canvas description the preview does. Zoom is a source-rect
`drawImage` plus a screen crop; the cursor overlay already maps source-recording coordinates
onto the composited canvas every frame and has been hardened for exactly this class of bug.

So a censor region is:

- **Data**, stored on the recording presentation next to zoom markers — not a baked pixel op.
- **Rendered in the existing 2D overlay pass**, between the screen layer draw and the cursor
  draw, inside the _same_ canvas transform the cursor overlay draws in.

That last point is what keeps this cheap. The preview has four renderer tiers
(`webgpu-external-texture`, `webgl2-videoframe`, `webgl`, `canvas2d` —
`screen-layer-renderer-capabilities.ts`). Implementing a censor _inside_ the screen layer
would mean four implementations plus a fifth in the export renderer. But by the time the
overlay pass runs, every tier has already composited the zoomed screen onto the presentation
2D context (`screen-layer-renderer.ts:1569`, `:1604`). **One 2D implementation covers all
tiers.**

### The mapping is already solved — do not rebuild it

Found while reading the code, and it makes this simpler than first sketched:
`applyScreenSourceTransform` (`zoom-motion-renderer.ts:86`) sets up the canvas transform so
that **drawing in source-recording pixel coordinates lands correctly on the composited
canvas**, whatever the zoom, pan and crop are doing. The cursor overlay is called inside that
scope (`styled-video-preview.tsx:1798`) and draws in raw source coordinates.

The censor draws in the same scope. There is therefore **no source→canvas mapping to write at
all** — the largest risk in the original sketch is designed out rather than mitigated.

Hard rule: do not derive a second mapping, and do not move the censor draw outside the
`applyScreenSourceTransform` scope. A censor that drifts off its target is a leak, not a
cosmetic bug.

### The mosaic samples the video, not the canvas

Pixelation draws the video's source region into a small offscreen canvas and scales it back up
inside the transform. No reading pixels back out of the presentation canvas: the result is
independent of draw order, costs no readback, and the mosaic zooms with the content instead of
being recomputed in screen space every frame.

---

## 2. Data model

New optional field on `RecordingPresentation` (`packages/project-model/src/types.ts:210`),
sibling of `zoom` / `cutRanges`:

```ts
export type CensorRegionId = string & { readonly __brand: 'CensorRegionId' };

export type CensorMode = 'solid' | 'pixelate';

export interface CensorRegion {
  readonly id: CensorRegionId;
  /** Source-recording frames, same space as ZoomMarker and CutRange. */
  readonly startFrame: Frame;
  readonly endFrame: Frame;
  /** Normalized 0–1 within the FULL source recording frame, before screenCrop. */
  readonly rect: NormalizedRect;
  readonly mode: CensorMode;
  /** Mosaic block size in source pixels. Pixelate only. */
  readonly blockSize: number;
  /** Cosmetic blur applied over the already-destroyed pixels. */
  readonly soften: boolean;
  /** Solid only. Defaults to opaque near-black. */
  readonly fillColor?: string;
  readonly label?: string;
}

// RecordingPresentation gains:
readonly censorRegions?: readonly CensorRegion[];
```

**Coordinate basis — normalized to the full source frame, pre-crop.** Rationale: matches the
`ZoomFocalPoint` / `NormalizedRect` precedent, is resolution-independent, and converting to the
source pixels `screenCrop` speaks is a single multiply. Write this down in the type doc comment;
it is the detail that breaks silently later.

**Frame basis — source frames, same as `ZoomMarker` and `CutRange`.** This is what makes trims,
ripple deletes and cut ranges behave for censors exactly as they already do for zoom markers,
and it lets the timeline lane reuse `frameRangeToPlacement` unchanged.

Schema (`schemas.ts`): `CensorRegionSchema` alongside `ZoomMarkerSchema`; add
`censorRegions: z.array(CensorRegionSchema).optional()` to `RecordingPresentationSchema`.
Optional + no default on read, so v15 documents parse untouched.

Migration: bump 15 → 16 in `migrations.ts`. The migration is a version bump only — the field is
optional and absent means "no censors". Add the case to `migrations.test.ts`.

---

## 3. Resolution — one authority

Per TASK-247 the frame resolver is the layout authority, so censors resolve there too.

`packages/frame-resolver/src/types.ts` — `RenderFrame` gains:

```ts
/** Censor regions active at this frame, in source-normalized coordinates. */
censorRegions?: readonly ResolvedCensorRegion[];
```

`ResolvedCensorRegion` is a `CensorRegion` minus the frame range (already filtered), so
consumers cannot re-filter and disagree.

Shared pure module `apps/desktop/src/shared/censor-regions.mjs` (**built in slice 1**),
unit-tested, exporting:

- `activeCensorRegionsAt(regions, sourceFrame)` — start-inclusive, end-exclusive, so two
  back-to-back regions never double-draw on the seam frame.
- `censorRectToSourceRect(rect, sourceWidth, sourceHeight)` — normalized → source pixels,
  clamped to the frame, `null` when there is no visible area. Callers must treat `null` as
  "draw nothing"; never fall back to a default rect, or a malformed region paints over the
  wrong part of the screen.
- `resolveCensorSourceScale({ screenDrawScale, transform })` — canvas pixels per source pixel.
  Canvas filters and offscreen buffers are sized in device pixels, so anything expressed in
  source pixels converts through this.
- `resolveCensorMosaicGrid(sourceRect, region)` — offscreen buffer size in cells, capped at 512
  per axis so a tiny block size cannot allocate a near-full-resolution buffer per frame. The cap
  makes the mosaic coarser, never finer, so the region stays at least as censored as requested.
- `resolveCensorSoftenRadiusPx(region, sourceScale)`, `resolveCensorBlockSize(region)`,
  `resolveCensorFillColor(region)`.

Both the preview and the headless export renderer import this. The _drawing_ is duplicated
(the headless renderer runs as an injected browser script), but the **math is shared and
tested once**. That is the parity seam — call it out in review.

---

## 4. Rendering

New optional method on the `ScreenLayerRenderer` interface, implemented once on the 2D path:

```
drawCensorOverlay({ ctx, video, regions, sourceWidth, sourceHeight, screenDrawScale, transform })
```

Called from `styled-video-preview.tsx` **after** the screen layer draw and **before**
`drawCursorOverlay`, inside the existing `applyScreenSourceTransform` scope, so the cursor stays
visible on top of a censor and the censor needs no coordinate mapping of its own.

Per region, all coordinates in source pixels:

1. `censorRectToSourceRect(...)`; skip when `null`.
2. `ctx.save()`, clip to the rect. The outer screen-frame clip is already in effect from the
   caller, so a censor near the frame edge cannot spill onto the background.
3. **solid** → `fillRect` with `resolveCensorFillColor(region)`. Nothing of the original
   survives and no pixels are sampled at all. Cheapest and safest path.
   **pixelate** → `drawImage` the video's source rect into an offscreen canvas sized by
   `resolveCensorMosaicGrid(...)`, then `drawImage` it back over the rect with
   `imageSmoothingEnabled = false`.
4. **soften** → re-draw the _now-destroyed_ patch through
   `ctx.filter = 'blur(<resolveCensorSoftenRadiusPx(...)>px)'`, sampling only from inside the
   destroyed area. Never read outside it — that is what keeps the result irreversible.
5. `ctx.restore()`, and restore the previous `ctx.filter`.

Soften radius is a **fixed tasteful amount** derived from block size, not a user slider, unless
the user asks for the control later.

Two things settled while building slice 3:

- **Soften is a no-op for solid fill.** A blurred flat colour clipped to its own rect is
  indistinguishable from the unblurred one, so the pass is skipped rather than burned. Soften
  applies to pixelate only.
- **The preview has two draw paths that never join** — the accelerated compositor path returns
  early, and the Canvas2D path runs below it. Both get a censor draw, and
  `styled-video-preview.test.mjs` asserts there are exactly two call sites. A third draw path
  would need a third call; the test is what catches that.

`headless-export-renderer.mjs` gets the same sequence, inserted at the same point in its draw
order relative to its cursor overlay.

### Cut ranges

Censor frames are source frames, and cut ranges remove source frames. Mirror whatever
`cut-ranges.mjs` already does to zoom markers (shift / split / drop) for censor regions, in the
same function, so the two can never diverge. Add a test asserting a censor spanning a cut ends
up with the same treatment a zoom marker in that position gets.

---

## 5. Timeline lane

`timeline-rail.mjs` / `.d.mts` — `TimelineModel.lanes` gains
`censor: readonly TimelineRegion[]`, built from `presentation.censorRegions` with the existing
`frameRangeToPlacement`. `kind` carries the censor mode so the chip can style solid vs pixelate.

`main.tsx` — new lane row beneath the zoom lane, rendered with the existing lane/chip
components:

- Range chips with draggable start/end boundary handles (reuse the zoom marker boundary
  `role="slider"` pattern at `main.tsx:5431`).
- Click selects; selection drives the preview handles.
- Delete/Backspace removes the selected region.
- Snapping to playhead and clip bounds, as zoom chips do.

---

## 6. Preview interaction

An **Add censor** control puts the preview into draw mode. Pointer drag on the preview canvas
draws a rectangle, following the existing camera-frame drag pattern (`cameraDragRef`,
`main.tsx:6086`) — including its inverse mapping from canvas coordinates back to source space,
which is exactly what is needed here.

On release: create a region whose rect is the drawn box in source-normalized coordinates, and
whose range is **playhead → end of the recording**. Deliberate default: under-censoring is the
dangerous failure, and pulling the end in on the lane is one drag.

A selected region draws move/resize handles on the preview and can be retimed on the lane.
Handles are hidden during playback.

---

## 7. Slices

Each slice ends green — typecheck, unit tests, and where noted the UI smoke screenshot.

| #   | Slice                                                     | Gate                                                                                                                                                                |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ✅ **DONE** — types, schema, migration 15→16, `censor-regions.mjs` math | `migrations.test.ts` (+3 cases), new `censor-regions.test.mjs` (18 cases): range boundaries, resolution independence, edge clamping, null-not-fallback, scale, mosaic cap, soften bounds |
| 2   | ✅ **DONE** — frame resolver resolves active regions into `RenderFrame` | `resolve-frame.test.ts` (+3), `frame-utils.test.ts` (+4): filtering, seam frame, overlap order, gap frames |
| 3   | ✅ **DONE** — `censor-overlay.ts` + both preview call sites | `styled-video-preview.test.mjs` (+4): censor on both draw paths, drawn after screen and before cursor, no canvas readback, fails closed, skips zero-area regions |
| 4a  | ✅ **DONE** — canvas/headless export backend censors | `headless-export-renderer.test.mjs` (+5): draw order, Canvas2D fallback for censored frames, fail-closed fill, painted count |
| 4b  | ✅ **DONE** — the user-facing `styled` FFmpeg export | `export-service.test.mjs` (+9) and `scripts/smoke-censor-export.mjs`, which exports clean vs censored and measures the pixels, with and without zoom |
| 5   | ✅ **DONE** — timeline censor lane + chips | `timeline-rail.test.mjs` (+3); UI smoke screenshot opened and a layout bug found and fixed |
| 6   | ✅ **DONE** — preview draw mode, Escape to cancel, delete | `censor-overlay.test.mjs` round-trips the pointer inverse against the real forward transform; `censor-markers.test.mjs` (+15) |
| 7   | Cut-range interaction                                     | `cut-ranges.test.mjs`                                                                                                                                               |

Slices 5 and 6 touch UI, so per `CLAUDE.md` they run with a design skill loaded (`impeccable`)
and are not called done until the wide smoke screenshot has been opened.

---

## 7a. The styled export gap (closed)

Worth recording because it was invisible to every other kind of test.

There are **two export backends**, and the censor pass initially covered only one:

- `mode: 'experimental-headless'` composites frame-by-frame on a canvas.
- `mode: 'styled'` — the path the Export button actually uses — builds an FFmpeg
  `-filter_complex` chain in `buildStyledExportArgs`. No canvas, so no censor.

Unit tests, typecheck and the UI smoke were all green while exports shipped the
secret. What caught it was `scripts/smoke-censor-export.mjs`: export the same project
clean and censored, then compare pixels. It reported `changedInsideRatio: 0` and
byte-identical files.

**Fix:** `buildCensorSourceFilters` emits one `drawbox=...:t=fill` per region, spliced
into the chain at `[base]` — before the cursor burn-in and before the zoom crop.
Because the censor goes on while the frame is still in source space, the zoom crop
downstream carries it automatically.

Time gating is `enable='between(t,start/fps,end/fps)'` — the same
source-frame-over-fps convention `buildZoomSendcmd` uses, so if that convention is
ever wrong under trims, zoom and censor are wrong together rather than drifting apart.

`canUseSimpleStyledExportFastPath` returns `false` when censors exist: that path skips
the screen chain the censor filters live in, so taking it would export the thing the
user asked to hide.

### The mosaic must be `geq`, never `split` + `overlay`

`solid` is one `drawbox`. `pixelate` is a `geq` that quantizes the sample coordinate
inside the region — a real mosaic, every block a flat colour — plus, when softness is
above 0, a second `geq` that box-averages inside the region to soften the block edges.
Blocks stay visible; that is "blur over the pixelation" rather than smoothing the
pixelation away.

Every tap in the smoothing pass is `clip()`-ed to the region bounds. That is the
safety property, not a style choice: an unclipped average would read real pixels just
outside the boundary, pulling detail in and smearing the censor outward. Measured by
comparing the crisp mosaic against the blurred one through an identical format path:
**zero pixels outside the region changed**, while 64% inside did.

Softness 0 skips the second pass entirely rather than emitting a zero-spacing average,
which would cost a whole extra pass for an identical image: 39ms/frame crisp versus
99ms/frame blurred at 1080p.

An earlier attempt used bilinear interpolation between block centres. Rendered and
compared side by side, that removes the blockiness completely — a different effect from
the one asked for — so it was rejected in favour of the clamped box average.

The obvious mosaic (`split`, `crop`, downscale, `scale=...:flags=neighbor` back up,
`overlay`) works fine without zoom and **deadlocks with zoom**: ffmpeg parked at 0%
CPU with a 48-byte output file and stayed there for 13 minutes before being killed.
Measured on the real arg builder:

| chain | result |
|---|---|
| zoom + mosaic via `split`+`overlay` | **hangs forever** |
| zoom + single-filter censor | completes |
| zoom, no censor | completes |

The zoom `sendcmd`/`crop` downstream pulls frames in a pattern that starves one split
branch. `fifo` on the split branches does not help — it is a no-op in modern ffmpeg.

`geq` also has to run on native yuv420p. An earlier attempt routed it through `gbrp`
so a single expression could cover all planes; that shifted colour across ~4% of the
**whole frame**. The luma and chroma expressions are therefore written separately,
with the chroma region bounds and block size halved because yuv420p chroma planes are
half resolution. A `format=yuv420p` is pinned first, because the timeline-segment path
hands the chain rgba, where `lum`/`cb`/`cr` do not exist and the mosaic would silently
do nothing.

Cost: roughly 30ms per 1080p frame, only on projects that have censors.

Anyone changing this must re-run `scripts/smoke-censor-export.mjs`. It covers the
zoomed case specifically, because that is the one that hangs, and it asserts the
result is genuinely blocky rather than merely different — the fixture is a detailed
`mandelbrot` rather than colour bars, because a mosaic over flat bars barely changes
any pixels and would let a broken mosaic pass.

**Lesson for the next effect:** a feature that must appear in an exported file is not
done when unit tests pass. It is done when a script has exported the file and
measured the pixels.

## 7b. Creating and positioning a censor

Two creation gestures, both landing in `addCensorRegionAt`:

- **Drag a span on the Censor lane** (primary). Mirrors `handleZoomLanePointerDown`,
  including the trim clamp and the click-versus-drag gate. The censor lands as a
  centred 30% box, selected, ready to position. A click rather than a drag still
  creates one running to the end, matching the Censor button.
- **Draw a box on the preview** with the Censor tool armed, for when the area is known
  first.

`addCensorRegionAt` uniquifies ids. Deriving the id from the frame plus the rect was
fine while every rect was hand-drawn, but timeline creation uses one fixed default box,
so two censors created at the same frame collided and the second overwrote the first.

Moving and resizing the selected censor reuses the camera/screen frame machinery —
`resizeHandleAtPoint`, `cursorForResizeHandle`, `drawEditorFrameControls` — so it looks
and feels like the frame editing already in the app. The rect maths runs in **source**
space (`moveCensorRect`, `resizeCensorRect` in `censor-regions.mjs`), not the
canvas-normalized space the frame helpers return, because a censor rect is normalized
to the source frame.

Handles are drawn in **canvas** space at their own call site, outside
`applyScreenSourceTransform`. Drawing them inside the censor pass, which runs in source
space, would scale the handles with the zoom. `sourceRectToCanvasRect` provides the
canvas rect and is round-trip tested against the pointer inverse.

Pointer priority: armed-draw → focal target → camera PiP → **selected censor** →
screen frame. The censor only participates while selected, so it cannot steal drags the
rest of the time; it beats the screen frame because the frame is the backdrop, and
loses to the PiP because the PiP is a small distinct object on top.

## 8. Risks

- ~~**Mapping drift under zoom.**~~ Designed out in slice 1: the censor draws inside
  `applyScreenSourceTransform`, so there is no mapping to drift. The remaining form of this risk
  is someone later moving the censor draw outside that scope.
- **Preview/export divergence.** The drawing code is duplicated across two renderers. Mitigated
  by shared math plus a frame-comparison test at a zoomed frame.
- **Pixelate cost.** No canvas readback — the mosaic samples the video into a small offscreen
  buffer capped at 512×512 cells. If it still shows during playback on the accelerated tiers,
  fall back to solid fill while scrubbing and pixelate on pause/export.
- **Soften leaking detail.** Structurally prevented: the blur pass reads only from inside the
  already-destroyed rect, never the original frame. This must stay true and is worth a test.
- **Regions on cut boundaries.** Done. The trim and the cut both renumber frames upstream of
  the censor filters, so the gates are built in the stream those filters actually see rather
  than in recording time — a censor after a cut used to fire late, showing the thing it hides.
  Spans are also split at cut boundaries, so a tracked censor jumps across a cut instead of
  interpolating through frames that never play, and a censor swallowed whole by a cut emits
  nothing.

## 9. Not in v1

Keyframed or tracked rectangles; automatic detection of emails/keys/tokens via text scanning;
non-rectangular shapes; per-region soften slider. The data model leaves room for all of them —
`mode` is an open enum position and geometry is a single rect that can later become a rect plus
keyframes without a breaking migration.
