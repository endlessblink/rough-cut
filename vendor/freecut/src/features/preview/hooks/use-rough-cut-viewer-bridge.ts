import { useEffect, type RefObject } from 'react'
import { useResolvedPlaybackFrame } from '@/shared/state/playback/use-resolved-playback-frame'
import { usePlaybackStore } from '@/shared/state/playback'

/**
 * Reports this editor's viewer rectangle and playhead to the Rough Cut host.
 *
 * Rough Cut owns a compositor that already draws the exact picture the user
 * expects — screen, camera PiP, background, zoom and a telemetry-driven cursor.
 * This editor's renderer has no concept of most of that, so matching it here
 * would mean re-implementing ~3200 lines in a second engine and letting the two
 * drift apart forever. Instead the host paints over this viewer with its own
 * compositor, which means there is only ever ONE thing drawing the picture.
 *
 * That requires exactly two things from us, and nothing else: where the viewer
 * is on screen, and which frame it is showing. Both are posted to the parent.
 *
 * No-ops when not embedded, so standalone FreeCut is unaffected.
 */
export function useRoughCutViewerBridge(
  viewerRef: RefObject<HTMLElement | null>,
  fps: number,
): void {
  const frame = useResolvedPlaybackFrame()
  const isPlaying = usePlaybackStore((state) => state.isPlaying)

  useEffect(() => {
    if (window.parent === window) return undefined
    const element = viewerRef.current
    if (!element) return undefined

    let lastKey = ''
    const post = () => {
      const rect = element.getBoundingClientRect()
      // The host positions its overlay from this, so sub-pixel churn would make
      // it jitter. Round, and skip the message when nothing actually moved.
      const payload = {
        type: 'freecut:viewer',
        rect: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        frame,
        fps,
        playing: isPlaying,
      }
      const key = JSON.stringify(payload)
      if (key === lastKey) return
      lastKey = key
      window.parent.postMessage(payload, '*')
    }

    post()
    const observer = new ResizeObserver(post)
    observer.observe(element)
    window.addEventListener('resize', post)
    window.addEventListener('scroll', post, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', post)
      window.removeEventListener('scroll', post, true)
    }
  }, [viewerRef, frame, fps, isPlaying])
}
