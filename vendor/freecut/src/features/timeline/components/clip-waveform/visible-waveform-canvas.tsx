import { memo, useEffect, useLayoutEffect, useRef } from 'react'

import {
  computeLiveViewportWaveformCanvasGeometry,
  computeVisibleWaveformCanvasGeometry,
  type VisibleWaveformCanvasGeometry,
} from './visible-waveform-canvas-geometry'
import { useZoomStore } from '../../stores/zoom-store'

interface VisibleWaveformCanvasProps {
  /** Total logical width of the clip waveform. */
  width: number
  height: number
  /** Visible logical pixel range within the clip. */
  visibleStartPx: number
  visibleEndPx: number
  /**
   * Changes when the viewport ratios change. Unlike the pixel range, this stays
   * stable while zoom geometry is changing, so zoom redraws remain throttled by
   * `version`.
   */
  viewportVersion: string
  /** Throttled content/zoom version. */
  version: string | number
  /** Measure the real live clip/viewport intersection before drawing. */
  liveTimelineViewport?: boolean
  liveViewportOverscanPx?: number
  renderWindow: (
    ctx: CanvasRenderingContext2D,
    windowOffsetPx: number,
    windowWidthPx: number,
  ) => void
}

function measureLiveTimelineGeometry(
  canvas: HTMLCanvasElement,
  overscanPx: number,
): VisibleWaveformCanvasGeometry | null {
  const host = canvas.parentElement
  const timelineViewport = canvas.closest<HTMLElement>('[data-timeline-scroll-container]')
  if (!host || !timelineViewport) return null

  const hostRect = host.getBoundingClientRect()
  const viewportRect = timelineViewport.getBoundingClientRect()
  return computeLiveViewportWaveformCanvasGeometry({
    hostLeft: hostRect.left,
    hostWidth: hostRect.width,
    viewportLeft: viewportRect.left,
    viewportWidth: viewportRect.width,
    overscanPx,
  })
}

interface LiveCanvasRegistration {
  canvas: HTMLCanvasElement
  overscanPx: number
  redraw: (geometry: VisibleWaveformCanvasGeometry) => void
}

const liveCanvasRegistrations = new Set<LiveCanvasRegistration>()
let liveCanvasPositionUpdateQueued = false
let unsubscribeLiveCanvasZoom: (() => void) | null = null

function scheduleLiveCanvasPositionUpdate(): void {
  if (liveCanvasPositionUpdateQueued) return
  liveCanvasPositionUpdateQueued = true
  queueMicrotask(() => {
    liveCanvasPositionUpdateQueued = false
    const updates: Array<{
      registration: LiveCanvasRegistration
      geometry: VisibleWaveformCanvasGeometry
      needsRedraw: boolean
    }> = []

    // Read every live rect first, then write every style. This avoids forcing a
    // fresh layout between sibling waveform canvases on dense timelines.
    for (const registration of liveCanvasRegistrations) {
      if (!registration.canvas.isConnected) continue
      const geometry = measureLiveTimelineGeometry(
        registration.canvas,
        registration.overscanPx,
      )
      if (geometry && geometry.width > 0) {
        const currentWidth = Number.parseFloat(registration.canvas.style.width) || 0
        updates.push({
          registration,
          geometry,
          needsRedraw:
            registration.canvas.style.display === 'none' ||
            currentWidth + 0.5 < geometry.width,
        })
      }
    }
    for (const update of updates) {
      if (update.needsRedraw) {
        // A growing clip/window needs real new pixels. This is uncommon and
        // redraws only the bounded intersection; changing CSS width alone would
        // stretch and blur the old bitmap.
        update.registration.redraw(update.geometry)
      } else {
        // Keep the existing sharp bitmap and backing size; only move it into the
        // new viewport window until the cadence-limited redraw catches up.
        update.registration.canvas.style.left = `${update.geometry.left}px`
      }
    }
  })
}

function registerLiveCanvasPositionUpdates(
  canvas: HTMLCanvasElement,
  overscanPx: number,
  redraw: (geometry: VisibleWaveformCanvasGeometry) => void,
): () => void {
  const registration = { canvas, overscanPx, redraw }
  liveCanvasRegistrations.add(registration)
  if (!unsubscribeLiveCanvasZoom) {
    unsubscribeLiveCanvasZoom = useZoomStore.subscribe((state, previousState) => {
      if (state.pixelsPerSecond !== previousState.pixelsPerSecond) {
        scheduleLiveCanvasPositionUpdate()
      }
    })
  }

  return () => {
    liveCanvasRegistrations.delete(registration)
    if (liveCanvasRegistrations.size === 0 && unsubscribeLiveCanvasZoom) {
      unsubscribeLiveCanvasZoom()
      unsubscribeLiveCanvasZoom = null
    }
  }
}

/**
 * A single viewport-bounded waveform canvas.
 *
 * The element's CSS size and backing bitmap are committed together. In
 * particular, width changes never stretch an older bitmap while a zoom redraw
 * is waiting for its cadence-limited commit.
 */
export const VisibleWaveformCanvas = memo(function VisibleWaveformCanvas({
  width,
  height,
  visibleStartPx,
  visibleEndPx,
  viewportVersion,
  version,
  liveTimelineViewport = false,
  liveViewportOverscanPx = 0,
  renderWindow,
}: VisibleWaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const latestGeometryRef = useRef({ width, visibleStartPx, visibleEndPx })
  latestGeometryRef.current = { width, visibleStartPx, visibleEndPx }
  const redrawGeometryRef = useRef<(geometry: VisibleWaveformCanvasGeometry) => void>(
    () => {},
  )

  useEffect(() => {
    if (!liveTimelineViewport) return
    const canvas = canvasRef.current
    if (!canvas) return
    return registerLiveCanvasPositionUpdates(canvas, liveViewportOverscanPx, (geometry) => {
      redrawGeometryRef.current(geometry)
    })
  }, [liveTimelineViewport, liveViewportOverscanPx])

  redrawGeometryRef.current = (geometry) => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (geometry.width <= 0 || height <= 0) {
      canvas.style.display = 'none'
      return
    }

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
    const backingWidth = Math.max(1, Math.ceil(geometry.width * dpr))
    const backingHeight = Math.max(1, Math.ceil(height * dpr))

    // Commit layout and backing dimensions together. Never mutate only the CSS
    // width: that would resample and blur the previous bitmap.
    canvas.style.display = 'block'
    canvas.style.left = `${geometry.left}px`
    canvas.style.width = `${geometry.width}px`
    canvas.style.height = `${height}px`
    canvas.width = backingWidth
    canvas.height = backingHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, geometry.width, height)
    renderWindow(ctx, geometry.left, geometry.width)
  }

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const latest = latestGeometryRef.current
    let geometry = computeVisibleWaveformCanvasGeometry(
      latest.width,
      latest.visibleStartPx,
      latest.visibleEndPx,
    )
    if (liveTimelineViewport) {
      geometry =
        measureLiveTimelineGeometry(canvas, liveViewportOverscanPx) ?? geometry
    }
    redrawGeometryRef.current(geometry)
  }, [
    height,
    liveTimelineViewport,
    liveViewportOverscanPx,
    renderWindow,
    version,
    viewportVersion,
  ])

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 pointer-events-none"
      aria-hidden="true"
    />
  )
})
