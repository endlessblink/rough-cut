import { memo, useEffect, useMemo, useRef, useState } from 'react'

import type { FilmstripFrame } from '../../hooks/use-filmstrip'
import {
  computeCoverDrawRect,
  computeFilmstripCanvasGeometry,
} from './filmstrip-canvas-geometry'
import {
  getDecodedFilmstripImage,
  subscribeFilmstripImage,
} from './filmstrip-image-cache'

const MAX_FILMSTRIP_CANVAS_DPR = 2

export interface FilmstripCanvasTile {
  slot: number
  frame: FilmstripFrame
  x: number
  width: number
}

type DrawableFilmstripSource = ImageBitmap | HTMLImageElement

interface VisibleFilmstripCanvasProps {
  renderWidth: number
  height: number
  visibleStartPx: number
  visibleEndPx: number
  tiles: FilmstripCanvasTile[]
  coverFrame: FilmstripFrame | null
  onSourceError?: (frameIndex: number) => void
}

function isDrawableBitmap(bitmap: ImageBitmap | undefined): bitmap is ImageBitmap {
  return !!bitmap && bitmap.width > 0 && bitmap.height > 0
}

export const VisibleFilmstripCanvas = memo(function VisibleFilmstripCanvas({
  renderWidth,
  height,
  visibleStartPx,
  visibleEndPx,
  tiles,
  coverFrame,
  onSourceError,
}: VisibleFilmstripCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const subscriptionsRef = useRef<Map<string, () => void>>(new Map())
  const redrawRafRef = useRef<number | null>(null)
  const mountedRef = useRef(true)
  const [imageRevision, setImageRevision] = useState(0)

  const sourceFrames = useMemo(() => {
    const byUrl = new Map<string, FilmstripFrame>()
    if (coverFrame?.url && !isDrawableBitmap(coverFrame.bitmap)) {
      byUrl.set(coverFrame.url, coverFrame)
    }
    for (const tile of tiles) {
      if (tile.frame.url && !isDrawableBitmap(tile.frame.bitmap)) {
        byUrl.set(tile.frame.url, tile.frame)
      }
    }
    return Array.from(byUrl.values())
  }, [coverFrame, tiles])
  useEffect(() => {
    const neededUrls = new Set(sourceFrames.map((frame) => frame.url))
    const scheduleRedraw = () => {
      if (!mountedRef.current || redrawRafRef.current !== null) return
      redrawRafRef.current = requestAnimationFrame(() => {
        redrawRafRef.current = null
        if (mountedRef.current) {
          setImageRevision((revision) => revision + 1)
        }
      })
    }

    for (const frame of sourceFrames) {
      if (subscriptionsRef.current.has(frame.url)) continue
      subscriptionsRef.current.set(
        frame.url,
        subscribeFilmstripImage(frame.url, scheduleRedraw, () => {
          onSourceError?.(frame.index)
          scheduleRedraw()
        }),
      )
    }

    for (const [url, unsubscribe] of subscriptionsRef.current) {
      if (neededUrls.has(url)) continue
      unsubscribe()
      subscriptionsRef.current.delete(url)
    }
  }, [onSourceError, sourceFrames])

  useEffect(() => {
    mountedRef.current = true
    const subscriptions = subscriptionsRef.current
    return () => {
      mountedRef.current = false
      if (redrawRafRef.current !== null) {
        cancelAnimationFrame(redrawRafRef.current)
        redrawRafRef.current = null
      }
      for (const unsubscribe of subscriptions.values()) {
        unsubscribe()
      }
      subscriptions.clear()
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || height <= 0) return

    const geometry = computeFilmstripCanvasGeometry(
      renderWidth,
      visibleStartPx,
      visibleEndPx,
    )
    if (geometry.width <= 0) {
      canvas.style.display = 'none'
      return
    }

    const dpr = Math.max(
      1,
      Math.min(MAX_FILMSTRIP_CANVAS_DPR, window.devicePixelRatio || 1),
    )
    canvas.style.display = 'block'
    canvas.style.left = `${geometry.left}px`
    canvas.style.width = `${geometry.width}px`
    canvas.style.height = `${height}px`
    canvas.width = Math.max(1, Math.ceil(geometry.width * dpr))
    canvas.height = Math.max(1, Math.ceil(height * dpr))

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, geometry.width, height)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'low'

    const resolveSource = (
      frame: FilmstripFrame | null,
    ): DrawableFilmstripSource | null => {
      if (!frame) return null
      if (isDrawableBitmap(frame.bitmap)) return frame.bitmap
      if (!frame.url) return null
      return getDecodedFilmstripImage(frame.url)
    }
    const coverSource = resolveSource(coverFrame)

    for (const tile of tiles) {
      const localX = tile.x - geometry.left
      if (localX >= geometry.width || localX + tile.width <= 0) continue

      const source = resolveSource(tile.frame) ?? coverSource
      if (!source) continue

      const sourceWidth = source.width
      const sourceHeight = source.height
      const drawRect = computeCoverDrawRect(sourceWidth, sourceHeight, tile.width, height)
      if (drawRect.width <= 0 || drawRect.height <= 0) continue

      ctx.save()
      ctx.beginPath()
      ctx.rect(localX, 0, tile.width, height)
      ctx.clip()
      try {
        ctx.drawImage(
          source,
          localX + drawRect.x,
          drawRect.y,
          drawRect.width,
          drawRect.height,
        )
      } catch {
        // A transferred ImageBitmap can be replaced and closed between render
        // and paint. The next cache update supplies its persisted URL frame.
      }
      ctx.restore()
    }
  }, [
    coverFrame,
    height,
    imageRevision,
    renderWidth,
    tiles,
    visibleEndPx,
    visibleStartPx,
  ])

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 pointer-events-none"
      data-filmstrip-canvas
      aria-hidden="true"
    />
  )
})
