import { getTimelineWidth } from './timeline-layout'

interface ApplyTimelineLiveGeometryOptions {
  outer: HTMLElement
  surface: HTMLElement
  duration: number
  viewportWidth: number
  livePixelsPerSecond: number
  fps?: number
}

function setStyle(style: CSSStyleDeclaration, property: string, value: string) {
  if (style.getPropertyValue(property) !== value) {
    style.setProperty(property, value)
  }
}

/**
 * Applies live zoom as real timeline geometry. Clip left/width values already
 * use --timeline-px-per-frame, so this preserves natural text, thumbnail,
 * waveform, handle, and border proportions without scaling mounted content.
 */
export function applyTimelineLiveGeometry({
  outer,
  surface,
  duration,
  viewportWidth,
  livePixelsPerSecond,
  fps,
}: ApplyTimelineLiveGeometryOptions) {
  const effectiveViewportWidth = viewportWidth > 0 ? viewportWidth : 1920
  const liveWidth = getTimelineWidth({
    contentWidth: duration * livePixelsPerSecond,
    viewportWidth: effectiveViewportWidth,
  })

  setStyle(outer.style, 'width', `${liveWidth}px`)
  setStyle(surface.style, 'width', `${liveWidth}px`)
  setStyle(surface.style, 'transform', 'none')

  if (fps !== undefined) {
    const livePixelsPerFrame = fps > 0 ? livePixelsPerSecond / fps : 0
    setStyle(outer.style, '--timeline-px-per-frame', `${livePixelsPerFrame}px`)
    setStyle(outer.style, '--timeline-pixels-per-second', `${livePixelsPerSecond}px`)
    setStyle(surface.style, '--timeline-px-per-frame', `${livePixelsPerFrame}px`)
    setStyle(surface.style, '--timeline-pixels-per-second', `${livePixelsPerSecond}px`)
  }

  outer.dataset.timelineLiveWidth = String(liveWidth)
  surface.dataset.timelineGeometryWidth = String(liveWidth)
}
