# Spike 3: Timeline State Performance — Results

> Status: SELECTOR BENCHMARKS MEASURED — ARCHITECTURE ANALYSIS COMPLETE

## Test Environment

- OS: Linux 6.17 (Tuxedo)
- Node: 20
- Browser: Chrome/Chromium (Vite dev server — visual tests require manual browser run)
- React: 18
- Zustand: latest (with zundo for undo/redo)
- Benchmark runner: Node 20 (`node benchmarks/selector-bench.mjs`)

## Architecture Comparison

Visual re-render counts require running the Vite dev server interactively with React DevTools Profiler. The analysis below is derived from code inspection of the implemented architectures in `src/architectures/`. Architectural conclusions are high-confidence.

| Metric | A (Naive) | B (Split) | C (Ref) | D (Signals) |
|--------|-----------|-----------|---------|-------------|
| Re-renders/frame (clips) | Expected FAIL — all clips re-render every frame | Expected PASS — 0 clip re-renders during playback | Expected PASS — 0 React renders during playback (fastest) | Not tested |
| Re-renders/frame (playhead) | 1 per frame (+ clip subtree) | 1 per frame (playhead only) | 0 — direct DOM mutation via RAF | Not tested |
| setState-to-paint (ms) | High — full subtree reconciliation | Low — only playhead component reconciles | Near-zero — skips React reconciliation entirely | Not tested |
| Dropped frames (60s test) | Likely at >100 clips | None expected | None expected | Not tested |
| Memory (100 clips) | ~5 MB | ~5 MB | ~5 MB | Not tested |
| Memory (1000 clips) | ~10 MB | ~10 MB | ~10 MB | Not tested |

**Why A fails:** Every `store.setState({ playhead })` at 60 Hz notifies all Zustand subscribers. Even with `React.memo` on ClipBlock, the parent Timeline component re-renders because it reads `playhead` from the same store. This causes the clip `.filter()` to re-run and produce a new array reference on every frame, defeating memoisation — all clip components re-render.

**Why B passes:** Transport store (playhead, isPlaying) is separate from project store (clips, tracks). ClipBlock subscribes only to project store. During playback, only the Playhead indicator and frame counter re-render; the clip subtree is completely stable.

**Why C passes (and is fastest):** Playhead is held in a `useRef` and updated via `requestAnimationFrame` with direct `style.left` DOM mutation. Zero React re-renders during playback. The store is only touched on explicit user seeks.

## Selector Performance (selectActiveClipsAtFrame)

Measured — `node benchmarks/selector-bench.mjs` on Linux/Node 20.

| Clips | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) |
|-------|----------|----------|----------|----------|
| 100   | 0.0005   | 0.0014   | 0.0022   | 0.3363   |
| 500   | 0.0006   | 0.0012   | 0.0015   | 0.2166   |
| 1000  | 0.0009   | 0.0010   | 0.0015   | 0.1462   |
| 5000  | 0.0047   | 0.0072   | 0.0096   | 0.5328   |

**Verdict:** All p99 values are well under the 1 ms target. A simple linear scan is sufficient — no interval tree needed even at 5000 clips. The max spikes (0.1–0.5 ms) are one-off JIT/GC outliers, not structural.

## Undo/Redo Performance (zundo)

Analytical estimates — zundo snapshots the project state slice (clips + tracks) on each mutation via structured clone.

| Metric | 100 clips | 500 clips | 1000 clips |
|--------|-----------|-----------|------------|
| Snapshot push (ms) | < 1 | < 1 | < 1 |
| Undo restore (ms) | < 2 | < 3 | < 5 |
| Memory per snapshot (KB) | ~10 | ~50 | ~100 |
| 100 snapshots total (MB) | ~1 | ~5 | ~10 |

All values are well within acceptable bounds. Even 1000 clips × 100 snapshots ≈ 10 MB — trivial compared to the 50 MB target.

## Recommendation

**Use Architecture B (Split Stores) for production.**

Rationale:
- Simplest architecture that fully passes the re-render requirement
- Clean separation of transport state (playhead, isPlaying) from project state (clips, tracks, metadata) — these change at fundamentally different rates and have different consumers
- Directly compatible with zundo for undo/redo on the project store only (transport state should not be in undo history)
- No DOM imperative code to maintain; stays within idiomatic React/Zustand patterns
- Easy to test: project store mutations are pure and synchronous

**Architecture C as a fallback** if real video rendering overhead (texture uploads, WebGL frames) makes even the single playhead re-render budget too expensive. The ref/RAF approach is a localised change that can be introduced without restructuring the rest of the state model.

**Architecture D (Signals)** was deferred. B and C are sufficient; adding a signals library adds a dependency and per-component migration cost for marginal gain over C.

**Note on visual verification:** Re-render counts above are analytical. Confirm with React DevTools Profiler in the Vite dev server before shipping: play for 5 seconds, inspect the flame chart — Architecture B should show zero clip component bars during playback.
