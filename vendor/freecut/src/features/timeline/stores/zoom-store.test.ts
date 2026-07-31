// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { usePlaybackStore } from '@/shared/state/playback'
import { _resetZoomStoreForTest, useZoomStore } from './zoom-store'

describe('zoom-store interaction split', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    usePlaybackStore.setState({ isPlaying: false })
    _resetZoomStoreForTest()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    usePlaybackStore.setState({ isPlaying: false })
    _resetZoomStoreForTest()
  })

  it('updates visual zoom immediately and settles content zoom after interaction stops', () => {
    useZoomStore.getState().setZoomLevelImmediate(1.4)

    expect(useZoomStore.getState()).toMatchObject({
      level: 1.4,
      pixelsPerSecond: 140,
      contentLevel: 1,
      contentPixelsPerSecond: 100,
      isZoomInteracting: true,
    })

    vi.advanceTimersByTime(99)
    expect(useZoomStore.getState()).toMatchObject({
      level: 1.4,
      contentLevel: 1,
      isZoomInteracting: true,
    })

    vi.advanceTimersByTime(1)
    expect(useZoomStore.getState()).toMatchObject({
      level: 1.4,
      pixelsPerSecond: 140,
      contentLevel: 1.4,
      contentPixelsPerSecond: 140,
      isZoomInteracting: false,
    })
  })

  it('keeps only the latest interaction zoom target before settling', () => {
    useZoomStore.getState().setZoomLevelImmediate(1.2)
    useZoomStore.getState().setZoomLevelImmediate(1.6)

    expect(useZoomStore.getState()).toMatchObject({
      level: 1.6,
      contentLevel: 1,
      isZoomInteracting: true,
    })

    vi.advanceTimersByTime(100)
    expect(useZoomStore.getState()).toMatchObject({
      level: 1.6,
      contentLevel: 1.6,
      isZoomInteracting: false,
    })
  })

  it('cancels and replaces playback-aware committed geometry work', () => {
    let nextId = 1
    const animationFrames = new Map<number, FrameRequestCallback>()
    const idleCallbacks = new Map<number, IdleRequestCallback>()
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        const id = nextId++
        animationFrames.set(id, callback)
        return id
      }),
    )
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => animationFrames.delete(id)),
    )
    vi.stubGlobal(
      'requestIdleCallback',
      vi.fn((callback: IdleRequestCallback) => {
        const id = nextId++
        idleCallbacks.set(id, callback)
        return id
      }),
    )
    vi.stubGlobal(
      'cancelIdleCallback',
      vi.fn((id: number) => idleCallbacks.delete(id)),
    )
    usePlaybackStore.setState({ isPlaying: true })

    useZoomStore.getState().setZoomLevelImmediate(1.4)
    vi.advanceTimersByTime(100)
    expect(useZoomStore.getState().contentLevel).toBe(1)
    expect(animationFrames.size).toBe(1)

    const firstFrame = animationFrames.entries().next().value as
      | [number, FrameRequestCallback]
      | undefined
    expect(firstFrame).toBeDefined()
    animationFrames.delete(firstFrame![0])
    firstFrame![1](100)
    expect(idleCallbacks.size).toBe(1)

    // A new wheel target invalidates the queued idle commit before it can wake
    // the rich timeline subtree.
    useZoomStore.getState().setZoomLevelImmediate(1.6)
    expect(idleCallbacks.size).toBe(0)
    vi.advanceTimersByTime(100)

    const finalFrame = animationFrames.entries().next().value as
      | [number, FrameRequestCallback]
      | undefined
    expect(finalFrame).toBeDefined()
    animationFrames.delete(finalFrame![0])
    finalFrame![1](200)
    const finalIdle = idleCallbacks.entries().next().value as
      | [number, IdleRequestCallback]
      | undefined
    expect(finalIdle).toBeDefined()
    idleCallbacks.delete(finalIdle![0])
    finalIdle![1]({ didTimeout: false, timeRemaining: () => 8 })

    expect(useZoomStore.getState()).toMatchObject({
      level: 1.6,
      contentLevel: 1.6,
      contentPixelsPerSecond: 160,
      isZoomInteracting: false,
    })
  })

  it('applies discrete zoom actions synchronously to both visual and content zoom', () => {
    useZoomStore.getState().zoomIn()

    const state = useZoomStore.getState()
    expect(state.level).toBeCloseTo(1.1)
    expect(state.pixelsPerSecond).toBeCloseTo(110)
    expect(state.contentLevel).toBeCloseTo(1.1)
    expect(state.contentPixelsPerSecond).toBeCloseTo(110)
    expect(state.isZoomInteracting).toBe(false)
  })

  it('can synchronize a direct zoom level update without leaving content behind', () => {
    useZoomStore.getState().setZoomLevelImmediate(1.8)

    expect(useZoomStore.getState()).toMatchObject({
      level: 1.8,
      contentLevel: 1,
      isZoomInteracting: true,
    })

    useZoomStore.getState().setZoomLevelSynchronized(0.75)

    expect(useZoomStore.getState()).toMatchObject({
      level: 0.75,
      pixelsPerSecond: 75,
      contentLevel: 0.75,
      contentPixelsPerSecond: 75,
      isZoomInteracting: false,
    })

    vi.advanceTimersByTime(100)
    expect(useZoomStore.getState()).toMatchObject({
      level: 0.75,
      contentLevel: 0.75,
      isZoomInteracting: false,
    })
  })
})
