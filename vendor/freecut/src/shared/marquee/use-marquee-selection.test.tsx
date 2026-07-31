import { useMemo, useRef, type ReactNode } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { useMarqueeSelection, type Rect } from './use-marquee-selection'

interface MarqueeHarnessProps {
  children?: ReactNode
  onSelectionChange: (ids: string[]) => void
  onPreviewSelectionChange?: (ids: string[]) => void
  onGestureEnd: (event: MouseEvent, wasActualDrag: boolean) => void
}

function createRect(left: number, top: number, right: number, bottom: number): Rect {
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  }
}

function MarqueeHarness({
  children,
  onSelectionChange,
  onPreviewSelectionChange,
  onGestureEnd,
}: MarqueeHarnessProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const items = useMemo(
    () => [
      { id: 'clip-1', getBoundingRect: () => createRect(20, 20, 40, 40) },
      { id: 'clip-2', getBoundingRect: () => createRect(70, 70, 90, 90) },
    ],
    [],
  )

  useMarqueeSelection({
    containerRef: containerRef as React.RefObject<HTMLElement>,
    items,
    onSelectionChange,
    onPreviewSelectionChange,
    onGestureEnd,
    commitSelectionOnMouseUp: true,
  })

  return (
    <div ref={containerRef} data-testid="marquee-container">
      {children}
    </div>
  )
}

describe('useMarqueeSelection deferred commits', () => {
  let nextAnimationFrameId = 1
  let animationFrameCallbacks = new Map<number, FrameRequestCallback>()

  beforeEach(() => {
    nextAnimationFrameId = 1
    animationFrameCallbacks = new Map()

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextAnimationFrameId
      nextAnimationFrameId += 1
      animationFrameCallbacks.set(id, callback)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      animationFrameCallbacks.delete(id)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function flushAnimationFrames() {
    const callbacks = Array.from(animationFrameCallbacks.values())
    animationFrameCallbacks.clear()
    act(() => {
      for (const callback of callbacks) {
        callback(performance.now())
      }
    })
  }

  it('updates the lightweight preview during drag and commits global selection once on mouseup', () => {
    const onSelectionChange = vi.fn<(ids: string[]) => void>()
    const onPreviewSelectionChange = vi.fn<(ids: string[]) => void>()
    const onGestureEnd = vi.fn<(event: MouseEvent, wasActualDrag: boolean) => void>()
    const { getByTestId } = render(
      <MarqueeHarness
        onSelectionChange={onSelectionChange}
        onPreviewSelectionChange={onPreviewSelectionChange}
        onGestureEnd={onGestureEnd}
      />,
    )
    const container = getByTestId('marquee-container')

    Object.defineProperties(container, {
      clientWidth: { configurable: true, value: 200 },
      clientHeight: { configurable: true, value: 200 },
      getBoundingClientRect: {
        configurable: true,
        value: () => createRect(0, 0, 200, 200),
      },
    })

    fireEvent.mouseDown(container, { button: 0, clientX: 5, clientY: 5 })
    fireEvent.mouseMove(document, { clientX: 50, clientY: 50 })
    flushAnimationFrames()

    expect(onPreviewSelectionChange).toHaveBeenNthCalledWith(1, [])
    expect(onPreviewSelectionChange).toHaveBeenNthCalledWith(2, ['clip-1'])
    expect(onSelectionChange).not.toHaveBeenCalled()

    fireEvent.mouseMove(document, { clientX: 100, clientY: 100 })
    flushAnimationFrames()

    expect(onPreviewSelectionChange).toHaveBeenNthCalledWith(3, ['clip-1', 'clip-2'])
    expect(onSelectionChange).not.toHaveBeenCalled()

    fireEvent.mouseUp(document, { clientX: 100, clientY: 100 })

    expect(onGestureEnd).toHaveBeenCalledTimes(1)
    expect(onGestureEnd.mock.calls[0]?.[1]).toBe(true)
    expect(onPreviewSelectionChange).toHaveBeenLastCalledWith([])
    expect(onSelectionChange).toHaveBeenCalledTimes(1)
    expect(onSelectionChange).toHaveBeenCalledWith(['clip-1', 'clip-2'])
  })

  it('keeps global selection frozen during a release-only canvas marquee', () => {
    const onSelectionChange = vi.fn<(ids: string[]) => void>()
    const onGestureEnd = vi.fn<(event: MouseEvent, wasActualDrag: boolean) => void>()
    const { getByTestId } = render(
      <MarqueeHarness onSelectionChange={onSelectionChange} onGestureEnd={onGestureEnd} />,
    )
    const container = getByTestId('marquee-container')

    Object.defineProperties(container, {
      clientWidth: { configurable: true, value: 200 },
      clientHeight: { configurable: true, value: 200 },
      getBoundingClientRect: {
        configurable: true,
        value: () => createRect(0, 0, 200, 200),
      },
    })

    fireEvent.mouseDown(container, { button: 0, clientX: 5, clientY: 5 })
    fireEvent.mouseMove(document, { clientX: 50, clientY: 50 })
    flushAnimationFrames()
    fireEvent.mouseMove(document, { clientX: 100, clientY: 100 })
    flushAnimationFrames()

    expect(onSelectionChange).not.toHaveBeenCalled()

    fireEvent.mouseUp(document, { clientX: 100, clientY: 100 })

    expect(onGestureEnd).toHaveBeenCalledTimes(1)
    expect(onSelectionChange).toHaveBeenCalledTimes(1)
    expect(onSelectionChange).toHaveBeenCalledWith(['clip-1', 'clip-2'])
  })

  it('does not claim a drag that starts on a playhead handle', () => {
    const onSelectionChange = vi.fn<(ids: string[]) => void>()
    const onPreviewSelectionChange = vi.fn<(ids: string[]) => void>()
    const onGestureEnd = vi.fn<(event: MouseEvent, wasActualDrag: boolean) => void>()
    const { getByTestId } = render(
      <MarqueeHarness
        onSelectionChange={onSelectionChange}
        onPreviewSelectionChange={onPreviewSelectionChange}
        onGestureEnd={onGestureEnd}
      >
        <div data-playhead-handle data-testid="playhead-handle" />
      </MarqueeHarness>,
    )
    const container = getByTestId('marquee-container')
    const playheadHandle = getByTestId('playhead-handle')

    Object.defineProperties(container, {
      clientWidth: { configurable: true, value: 200 },
      clientHeight: { configurable: true, value: 200 },
      getBoundingClientRect: {
        configurable: true,
        value: () => createRect(0, 0, 200, 200),
      },
    })

    fireEvent.mouseDown(playheadHandle, { button: 0, clientX: 5, clientY: 5 })
    fireEvent.mouseMove(document, { clientX: 100, clientY: 100 })
    flushAnimationFrames()
    fireEvent.mouseUp(document, { clientX: 100, clientY: 100 })

    expect(onGestureEnd).not.toHaveBeenCalled()
    expect(onPreviewSelectionChange).not.toHaveBeenCalled()
    expect(onSelectionChange).not.toHaveBeenCalled()
  })
})
