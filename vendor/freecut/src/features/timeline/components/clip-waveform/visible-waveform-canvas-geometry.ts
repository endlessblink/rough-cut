export interface VisibleWaveformCanvasGeometry {
  left: number
  width: number
}

export function computeLiveViewportWaveformCanvasGeometry({
  hostLeft,
  hostWidth,
  viewportLeft,
  viewportWidth,
  overscanPx,
}: {
  hostLeft: number
  hostWidth: number
  viewportLeft: number
  viewportWidth: number
  overscanPx: number
}): VisibleWaveformCanvasGeometry {
  const safeHostWidth = Math.max(0, hostWidth)
  const safeViewportWidth = Math.max(0, viewportWidth)
  const safeOverscan = Math.max(0, overscanPx)
  const left = Math.max(
    0,
    Math.min(safeHostWidth, viewportLeft - safeOverscan - hostLeft),
  )
  const right = Math.max(
    left,
    Math.min(
      safeHostWidth,
      viewportLeft + safeViewportWidth + safeOverscan - hostLeft,
    ),
  )

  return {
    left: Math.floor(left),
    width: Math.max(0, Math.ceil(right) - Math.floor(left)),
  }
}

export function computeVisibleWaveformCanvasGeometry(
  width: number,
  visibleStartPx: number,
  visibleEndPx: number,
): VisibleWaveformCanvasGeometry {
  const safeWidth = Math.max(0, width)
  const left = Math.max(0, Math.min(safeWidth, Math.floor(visibleStartPx)))
  const right = Math.max(left, Math.min(safeWidth, Math.ceil(visibleEndPx)))

  return {
    left,
    width: Math.max(0, right - left),
  }
}
