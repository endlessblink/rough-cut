# Zoom camera model — Mode A (zoom-around-cursor)

The Rough Cut MVP zoom engine uses **Mode A**: the focal point stays at its
source-relative screen position throughout the zoom. Content magnifies
*around* the focal point instead of flying *toward* it. This matches the
behavior of polished screen recorders (Recordly, Screen Studio).

## Transform formula

For a source pixel `p ∈ [0, 1]` at zoom scale `s` with focal `f ∈ [0, 1]`:

```
screen_p = (p - 0.5) * s + 0.5 + (f - 0.5) * (1 - s)
```

When `p == f` (i.e. the focal is the cursor itself), this reduces to
`screen_p = p` — the focal point renders at its source-relative position
regardless of `s`. The cursor stays pinned on screen; the rest of the frame
magnifies around it.

## Code

Implemented in `packages/timeline-engine/src/zoom-transform.ts`,
`computeTranslate`:

```ts
function computeTranslate(scale, focalX, focalY) {
  return {
    translateX: (focalX - 0.5) * (1 - scale),
    translateY: (focalY - 0.5) * (1 - scale),
  };
}
```

At the canvas-rendering boundary (`apps/desktop/src/renderer/src/main.tsx`),
the transform is applied:

```ts
ctx.translate(sourceWidth / 2 + offsetX, sourceHeight / 2 + offsetY);
ctx.scale(scale, scale);
ctx.translate(-sourceWidth / 2, -sourceHeight / 2);
ctx.drawImage(video, 0, 0, sourceWidth, sourceHeight);
```

where `offsetX = translateX * sourceWidth`, `offsetY = translateY * sourceHeight`.

## Why Mode A (not Mode B "zoom-toward-center")

The previous model — `translate = -(focal - 0.5) * scale` — put the focal
at the screen *center* at full zoom. For an off-center cursor, this
required the cursor to slide across the screen during the ramp-in. That
slide is small in any single frame but visible across the ramp and reads
as "wobble" or "camera correction" to the user.

Mode A makes the cursor stay put. The ramp-in is a pure scale change with
no on-screen cursor motion. Reported by users as the natural-feeling zoom.

## Visible window

The visible source range at scale `s` and translate `t`:

```
visible_min = 0.5 - 0.5/s - t/s
visible_max = 0.5 + 0.5/s - t/s
```

For any `f ∈ [0, 1]`, the visible range stays within `[0, 1]` — no
clamping needed. This is why Mode A doesn't require the
`[1/(2·s), 1 - 1/(2·s)]` focal clamp the old model needed.

## Focal point source

The focal point is computed in `resolveSpringSmoothedFocal` (same file).
A spring smooths cursor motion, seeded at the cursor's position at marker
start. A safe-zone camera (Recordly's pattern) keeps the spring's target
constant while the cursor is inside an inner safe zone, and shifts the
target when the cursor leaves. This produces a piecewise-constant target
that the spring smooths into the rendered focal trajectory.

Two user-facing tunables:

- **Cursor smoothing** (`cursorSmoothing` in `ZoomPresentation`, 0–2): spring
  stiffness. 0 = near-instant chase, 2 = floaty/cinematic.
- **Safe zone** (`followPadding`, 0–0.3): inset on each viewport edge defining
  the safe zone. 0 = camera holds still until cursor would leave the
  viewport entirely; 0.3 = small central safe zone, camera reacts to most
  cursor motion.

## Test coverage

- `zoom-transform.test.ts` — 35 tests covering the public API surface.
- `zoom-mode-a.test.ts` — 78 tests covering the geometric contract:
  identity at scale=1, focal pinned to cursor under all marker
  configurations, visible window stays in source for any cursor position,
  scale monotonicity through ramps, translate continuity.
- `zoom-wobble.test.ts` — 7 tests asserting screen-position drift under
  static-cursor scenarios stays < 2% of viewport across the entire marker.
- `zoom-unified.test.ts` — manual + auto markers produce equivalent
  trajectories; slider controls actually change spring behavior.
- `spring-solver.test.ts` — analytic damped-spring solver correctness.
- `zoom-markers-remove.test.mjs` (in apps/desktop) — `removeMarker` removes
  exactly one marker, IDs are distinct, etc.
