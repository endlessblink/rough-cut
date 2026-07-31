import { useEffect, useState } from 'react'
import { useTimelineViewportStore } from '../stores/timeline-viewport-store'
import { useZoomStore } from '../stores/zoom-store'

/**
 * Pixels of margin beyond the viewport for considering a clip "visible".
 * Increased from 200 to 600 to absorb the 50ms viewport store throttle —
 * at fast scroll speeds (~200px/frame × 3 frames), tiles stay pre-rendered
 * 600px ahead, preventing blank flashes at the leading edge.
 */
export const CLIP_VISIBILITY_PREFETCH_MARGIN_PX = 600
const RATIO_EPSILON = 0.002

export interface ClipVisibilityState {
  isVisible: boolean
  visibleStartRatio: number
  visibleEndRatio: number
}

/**
 * Hook to detect when a timeline clip is visible in the shared timeline viewport.
 * Uses clip geometry in timeline-content coordinates (left/width) and avoids
 * per-clip scroll listeners/observers.
 *
 * During zoom interaction, clip positions and the viewport temporarily use
 * different coordinate spaces. Keep the last valid bounded window until zoom
 * settles instead of expanding every clip to its full duration.
 */
export function useClipVisibility(clipLeftPx: number, clipWidthPx: number): ClipVisibilityState {
  const [visibility, setVisibility] = useState<ClipVisibilityState>(() =>
    computeVisibility(useTimelineViewportStore.getState(), clipLeftPx, clipWidthPx),
  )

  useEffect(() => {
    const apply = (viewport: TimelineViewportSnapshot) => {
      // During zoom, clip positions and viewport scroll are in different
      // coordinate spaces. Freeze the last valid bounded window.
      if (useZoomStore.getState().isZoomInteracting) {
        return
      }

      const next = computeVisibility(viewport, clipLeftPx, clipWidthPx)
      setVisibility((prev) => {
        if (
          prev.isVisible === next.isVisible &&
          Math.abs(prev.visibleStartRatio - next.visibleStartRatio) < RATIO_EPSILON &&
          Math.abs(prev.visibleEndRatio - next.visibleEndRatio) < RATIO_EPSILON
        ) {
          return prev
        }
        return next
      })
    }

    apply(useTimelineViewportStore.getState())
    const unsubViewport = useTimelineViewportStore.subscribe(apply)
    // Recompute when zoom interaction ends so the frozen window catches up.
    const unsubZoom = useZoomStore.subscribe((curr, prev) => {
      if (prev.isZoomInteracting && !curr.isZoomInteracting) {
        apply(useTimelineViewportStore.getState())
      }
    })
    return () => {
      unsubViewport()
      unsubZoom()
    }
  }, [clipLeftPx, clipWidthPx])

  return visibility
}

interface TimelineViewportSnapshot {
  scrollLeft: number
  scrollTop: number
  viewportWidth: number
  viewportHeight: number
}

function computeVisibility(
  viewport: TimelineViewportSnapshot,
  clipLeftPx: number,
  clipWidthPx: number,
  prefetchMarginPx = CLIP_VISIBILITY_PREFETCH_MARGIN_PX,
): ClipVisibilityState {
  if (clipWidthPx <= 0 || viewport.viewportWidth <= 0) {
    return {
      isVisible: false,
      visibleStartRatio: 0,
      visibleEndRatio: 1,
    }
  }

  const viewLeft = viewport.scrollLeft - prefetchMarginPx
  const viewRight = viewport.scrollLeft + viewport.viewportWidth + prefetchMarginPx
  const clipRightPx = clipLeftPx + clipWidthPx

  const overlapLeft = Math.max(clipLeftPx, viewLeft)
  const overlapRight = Math.min(clipRightPx, viewRight)
  const isVisible = overlapRight > overlapLeft

  if (!isVisible) {
    return {
      isVisible: false,
      visibleStartRatio: 0,
      visibleEndRatio: 1,
    }
  }

  const startRatio = Math.max(0, Math.min(1, (overlapLeft - clipLeftPx) / clipWidthPx))
  const endRatio = Math.max(startRatio, Math.min(1, (overlapRight - clipLeftPx) / clipWidthPx))

  return {
    isVisible: true,
    visibleStartRatio: startRatio,
    visibleEndRatio: endRatio,
  }
}
