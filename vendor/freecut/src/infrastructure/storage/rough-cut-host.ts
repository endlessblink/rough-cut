import type { MediaMetadata } from '@/types/storage'
import type { Project } from '@/types/project'
import {
  associateMediaWithProject,
  createMedia,
  createProject,
  getMedia,
  getProject,
  updateMedia,
  updateProject,
} from '@/infrastructure/storage'
import { bootstrapWorkspace } from './workspace-fs/bootstrap'
import { setWorkspaceRoot } from './workspace-fs/root'

type RoughCutSnapshot = {
  schemaVersion: number
  projects: Array<Project & { media?: MediaMetadata[] }>
}

export function isRoughCutHost(): boolean {
  return window.location.pathname.startsWith('/projects') || window.location.pathname.startsWith('/editor')
}

export async function activateRoughCutHost(): Promise<void> {
  const response = await fetch('/__rough_cut__/snapshot', { cache: 'no-store' })
  if (!response.ok) throw new Error(`Rough Cut host snapshot failed (${response.status})`)
  const snapshot = (await response.json()) as RoughCutSnapshot
  const root = await navigator.storage.getDirectory()
  setWorkspaceRoot(root)
  await bootstrapWorkspace(root)

  for (const incoming of snapshot.projects) {
    const existing = await getProject(incoming.id)
    if (existing) await updateProject(incoming.id, incoming)
    else await createProject(incoming)
    for (const media of incoming.media ?? []) {
      const existingMedia = await getMedia(media.id)
      if (existingMedia) await updateMedia(media.id, media)
      else await createMedia(media)
      await associateMediaWithProject(incoming.id, media.id)
    }
  }
}

export async function persistRoughCutProject(project: Project): Promise<void> {
  const roughCutPath = (project as Project & { roughCutPath?: string }).roughCutPath
  if (!roughCutPath) return
  const response = await fetch('/__rough_cut__/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  })
  if (!response.ok) throw new Error(`Rough Cut project save failed (${response.status})`)
}
