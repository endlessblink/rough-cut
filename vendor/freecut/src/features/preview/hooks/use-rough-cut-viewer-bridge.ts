import { useEffect, type RefObject } from 'react'
import { useResolvedPlaybackFrame } from '@/shared/state/playback/use-resolved-playback-frame'
import { usePlaybackStore } from '@/shared/state/playback'
import { useItemsStore } from '@/features/preview/deps/timeline-store'

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

  // The host's compositor plays this timeline's sound, the same mix Recording
  // edit plays — screen and camera together. This editor's own monitor plays the
  // same recording a few frames apart, which is heard as an echo, so it stays
  // silent while embedded. Its monitor volume control is meaningless here for
  // the same reason its picture is: the host is the one output.
  useEffect(() => {
    if (window.parent === window) return undefined
    const { setMuted } = usePlaybackStore.getState()
    setMuted(true)
    // Anything that flips it back — a restored session, a stray keyboard
    // shortcut — would bring the echo back, so hold it muted.
    return usePlaybackStore.subscribe((state) => {
      if (!state.muted) usePlaybackStore.getState().setMuted(true)
    })
  }, [])
  // Everything on this timeline. The host draws the recording composite from its
  // own project, and these on top, so a layer added here shows in BOTH views —
  // the host's compositor is the only thing painting either of them.
  const items = useItemsStore((state) => state.items)
  // Track order is the z-order, exactly as in any NLE: a clip on a higher
  // track covers one below it. The recording occupies a track in this same
  // stack, so the host needs the whole stack to draw in the right order.
  const tracks = useItemsStore((state) => state.tracks)

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
        // Every track, in FreeCut's stack order. Lower order numbers are higher
        // visual tracks, so the host can preserve the Editor's z-order exactly.
        tracks: (tracks ?? []).map((track, index) => {
          const tr = track as Record<string, unknown>
          return { id: tr.id, order: typeof tr.order === 'number' ? tr.order : index }
        }),
        // ALL items, including the one carrying Rough Cut's recording. That one
        // is not drawn from here — the host draws the recording from its own
        // project — but the host must know which track it sits on to place
        // everything else above or below it correctly.
        layers: (items ?? [])
          .map((item) => {
            const it = item as Record<string, unknown>
            return {
              id: it.id,
              type: it.type,
              isRecording: String(it.mediaId ?? '').endsWith('__program'),
              trackId: it.trackId,
              from: it.from,
              durationInFrames: it.durationInFrames,
              mediaId: it.mediaId,
              src: it.src,
              text: it.text,
              sourceStart: it.sourceStart,
              transform: it.transform,
              x: it.x,
              y: it.y,
              width: it.width,
              height: it.height,
            }
          }),
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
  }, [viewerRef, frame, fps, isPlaying, items, tracks])
}
