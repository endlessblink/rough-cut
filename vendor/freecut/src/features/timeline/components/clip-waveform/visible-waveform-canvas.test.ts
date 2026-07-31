import { createElement } from 'react'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import {
  computeLiveViewportWaveformCanvasGeometry,
  computeVisibleWaveformCanvasGeometry,
} from './visible-waveform-canvas-geometry'
import { VisibleWaveformCanvas } from './visible-waveform-canvas'
import { _resetZoomStoreForTest, useZoomStore } from '../../stores/zoom-store'

beforeEach(() => {
  _resetZoomStoreForTest()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('computeVisibleWaveformCanvasGeometry', () => {
  it('creates a whole-pixel canvas for only the visible clip window', () => {
    expect(computeVisibleWaveformCanvasGeometry(100_000, 49_999.4, 51_920.2)).toEqual({
      left: 49_999,
      width: 1_922,
    })
  })

  it('clamps the canvas to the clip without expanding to the full duration', () => {
    expect(computeVisibleWaveformCanvasGeometry(2_000, -20, 2_040)).toEqual({
      left: 0,
      width: 2_000,
    })
    expect(computeVisibleWaveformCanvasGeometry(2_000, 2_100, 2_200)).toEqual({
      left: 2_000,
      width: 0,
    })
  })

  it('keeps a long live clip bounded to the real viewport plus overscan', () => {
    expect(
      computeLiveViewportWaveformCanvasGeometry({
        hostLeft: -10_000,
        hostWidth: 200_000,
        viewportLeft: 713,
        viewportWidth: 1331,
        overscanPx: 600,
      }),
    ).toEqual({
      left: 10_113,
      width: 2531,
    })
  })
})

describe('VisibleWaveformCanvas', () => {
  it('commits layout, backing size, and waveform drawing atomically on rerender', () => {
    const ctx = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    ;(
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext') as unknown as {
        mockReturnValue: (value: CanvasRenderingContext2D) => void
      }
    ).mockReturnValue(ctx)
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2)
    const renderWindow = vi.fn()
    const props = {
      width: 1000,
      height: 24,
      visibleStartPx: 100,
      visibleEndPx: 300,
      viewportVersion: 'viewport-1',
      version: 'zoom-1',
      renderWindow,
    }

    const { container, rerender } = render(createElement(VisibleWaveformCanvas, props))
    const canvas = container.querySelector('canvas')
    expect(canvas).not.toBeNull()
    expect(canvas!.style.left).toBe('100px')
    expect(canvas!.style.width).toBe('200px')
    expect(canvas!.width).toBe(400)
    expect(canvas!.height).toBe(48)
    expect(renderWindow).toHaveBeenLastCalledWith(ctx, 100, 200)

    rerender(
      createElement(VisibleWaveformCanvas, {
        ...props,
        width: 2000,
        visibleStartPx: 500,
        visibleEndPx: 900,
        version: 'zoom-2',
      }),
    )

    expect(canvas!.style.left).toBe('500px')
    expect(canvas!.style.width).toBe('400px')
    expect(canvas!.width).toBe(800)
    expect(canvas!.height).toBe(48)
    expect(renderWindow).toHaveBeenLastCalledWith(ctx, 500, 400)
  })

  it('draws and repositions from the measured live timeline intersection', async () => {
    const ctx = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    ;(
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext') as unknown as {
        mockReturnValue: (value: CanvasRenderingContext2D) => void
      }
    ).mockReturnValue(ctx)
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2)
    const renderWindow = vi.fn()
    const createTree = (version: string) =>
      createElement(
        'div',
        { 'data-timeline-scroll-container': true },
        createElement(
          'div',
          null,
          createElement(VisibleWaveformCanvas, {
            width: 200_000,
            height: 24,
            visibleStartPx: 50_000,
            visibleEndPx: 50_100,
            viewportVersion: 'viewport-1',
            version,
            liveTimelineViewport: true,
            liveViewportOverscanPx: 600,
            renderWindow,
          }),
        ),
      )
    const { container, rerender } = render(createTree('zoom-1'))
    const viewport = container.querySelector(
      '[data-timeline-scroll-container]',
    ) as HTMLDivElement
    const canvas = container.querySelector('canvas')!
    const host = canvas.parentElement!
    const asRect = (left: number, width: number) =>
      ({
        bottom: 24,
        height: 24,
        left,
        right: left + width,
        top: 0,
        width,
        x: left,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
    let hostLeft = -10_000
    let hostWidth = 200_000
    vi.spyOn(host, 'getBoundingClientRect').mockImplementation(() =>
      asRect(hostLeft, hostWidth),
    )
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(asRect(713, 1331))

    rerender(createTree('zoom-2'))

    expect(canvas.style.left).toBe('10113px')
    expect(canvas.style.width).toBe('2531px')
    expect(canvas.width).toBe(5062)
    expect(renderWindow).toHaveBeenLastCalledWith(ctx, 10_113, 2531)

    const backingWidth = canvas.width
    const redrawCount = renderWindow.mock.calls.length
    hostLeft = -20_000
    await act(async () => {
      useZoomStore.setState({ pixelsPerSecond: 180, isZoomInteracting: true })
      await Promise.resolve()
    })

    expect(canvas.style.left).toBe('20113px')
    expect(canvas.style.width).toBe('2531px')
    expect(canvas.width).toBe(backingWidth)
    expect(renderWindow).toHaveBeenCalledTimes(redrawCount)

    hostLeft = 713
    hostWidth = 800
    rerender(createTree('zoom-3'))

    expect(canvas.style.left).toBe('0px')
    expect(canvas.style.width).toBe('800px')
    expect(canvas.width).toBe(1600)
    expect(renderWindow).toHaveBeenLastCalledWith(ctx, 0, 800)

    const shortClipRedrawCount = renderWindow.mock.calls.length
    hostWidth = 1200
    await act(async () => {
      useZoomStore.setState({ pixelsPerSecond: 220, isZoomInteracting: true })
      await Promise.resolve()
    })

    expect(canvas.style.left).toBe('0px')
    expect(canvas.style.width).toBe('1200px')
    expect(canvas.width).toBe(2400)
    expect(renderWindow).toHaveBeenCalledTimes(shortClipRedrawCount + 1)
    expect(renderWindow).toHaveBeenLastCalledWith(ctx, 0, 1200)
  })
})
