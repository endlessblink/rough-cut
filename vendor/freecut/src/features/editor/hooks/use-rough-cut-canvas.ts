import { useEffect } from 'react'
import { useProjectStore } from '@/features/editor/deps/projects'

type RoughCutCanvasMessage = {
  type: 'freecut:set-canvas'
  width?: number
  height?: number
}

/**
 * Keeps this editor's canvas on the shape the host's project has.
 *
 * The frame is a property of the project, not of a view: Rough Cut's Recording
 * edit offers wide, vertical, square, classic, tall and portrait, and the host's
 * compositor paints this viewer with a program cut to whichever one is chosen.
 * The snapshot that seeds this editor only arrives once, at boot, so switching
 * the shape afterwards used to leave the viewer on the old frame until a reload
 * — one timeline showing two different pictures. The host posts the canvas
 * whenever it changes and this applies it, so both views agree immediately.
 *
 * No-ops when not embedded, so standalone FreeCut is unaffected.
 */
export function useRoughCutCanvas(): void {
  useEffect(() => {
    if (window.parent === window) return undefined

    const onMessage = (event: MessageEvent<RoughCutCanvasMessage>) => {
      if (event.source !== window.parent) return
      if (event.data?.type !== 'freecut:set-canvas') return
      const width = Math.round(Number(event.data.width) / 2) * 2
      const height = Math.round(Number(event.data.height) / 2) * 2
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) return
      const { currentProject, updateProject } = useProjectStore.getState()
      if (!currentProject) return
      if (currentProject.metadata.width === width && currentProject.metadata.height === height) return
      // Deliberately not routed through `commitProjectMetadataChange`: this is
      // not an edit the user made here, so it must not land on this editor's
      // undo stack — undoing it would put the viewer back onto a frame the
      // project no longer has.
      void updateProject(currentProject.id, { width, height })
    }

    window.addEventListener('message', onMessage)
    // The host cannot know when this editor's project store is populated, so ask
    // for the current canvas once we are listening.
    window.parent.postMessage({ type: 'freecut:request-canvas' }, '*')
    return () => window.removeEventListener('message', onMessage)
  }, [])
}
