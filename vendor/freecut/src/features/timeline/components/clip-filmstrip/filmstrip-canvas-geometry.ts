export interface FilmstripCanvasGeometry {
  left: number
  width: number
}

export function computeFilmstripCanvasGeometry(
  renderWidth: number,
  visibleStartPx: number,
  visibleEndPx: number,
): FilmstripCanvasGeometry {
  const safeRenderWidth = Math.max(0, renderWidth)
  const left = Math.max(0, Math.min(safeRenderWidth, Math.floor(visibleStartPx)))
  const right = Math.max(
    left,
    Math.min(safeRenderWidth, Math.ceil(visibleEndPx)),
  )

  return {
    left,
    width: Math.max(0, right - left),
  }
}

export interface CoverDrawRect {
  x: number
  y: number
  width: number
  height: number
}

export function computeCoverDrawRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): CoverDrawRect {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale

  return {
    x: (targetWidth - width) * 0.5,
    y: (targetHeight - height) * 0.5,
    width,
    height,
  }
}
