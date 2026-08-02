import type { MediaMetadata, MediaTranscript } from '@/types/storage'
import type { Project } from '@/types/project'
import {
  associateMediaWithProject,
  createMedia,
  createProject,
  getMedia,
  getProject,
  getProjectMediaIds,
  removeMediaBatchFromProject,
  saveTranscript,
  updateMedia,
  updateProject,
} from '@/infrastructure/storage'
import { bootstrapWorkspace } from './workspace-fs/bootstrap'
import { setWorkspaceRoot } from './workspace-fs/root'

type RoughCutSnapshot = {
  schemaVersion: number
  projects: Array<Project & { media?: MediaMetadata[] }>
  transcripts?: MediaTranscript[]
}

const roughCutProjectVersions = new Map<string, number>()

export function isRoughCutHost(): boolean {
  return window.location.pathname.startsWith('/projects') || window.location.pathname.startsWith('/editor')
}

export async function activateRoughCutHost(): Promise<void> {
  const response = await fetch('/__rough_cut__/snapshot', { cache: 'no-store' })
  if (!response.ok) throw new Error(`Rough Cut host snapshot failed (${response.status})`)
  const snapshot = (await response.json()) as RoughCutSnapshot
  await applyRoughCutSnapshot(snapshot)
}

async function applyRoughCutSnapshot(snapshot: RoughCutSnapshot): Promise<void> {
  const root = await navigator.storage.getDirectory()
  setWorkspaceRoot(root)
  await bootstrapWorkspace(root)

  for (const incoming of snapshot.projects) {
    const existing = await getProject(incoming.id)
    if (existing) await updateProject(incoming.id, incoming)
    else await createProject(incoming)
    roughCutProjectVersions.set(incoming.id, incoming.updatedAt ?? 0)
    const incomingMedia = incoming.media ?? []
    const incomingMediaIds = new Set(incomingMedia.map((media) => media.id))
    const staleMediaIds = (await getProjectMediaIds(incoming.id)).filter((id) => !incomingMediaIds.has(id))
    if (staleMediaIds.length > 0) await removeMediaBatchFromProject(incoming.id, staleMediaIds)
    for (const media of incomingMedia) {
      const existingMedia = await getMedia(media.id)
      if (existingMedia) await updateMedia(media.id, media)
      else await createMedia(media)
      await associateMediaWithProject(incoming.id, media.id)
    }
  }
  for (const transcript of snapshot.transcripts ?? []) {
    await saveTranscript(transcript)
  }
}

export async function persistRoughCutProject(project: Project): Promise<void> {
  const roughCutPath = (project as Project & { roughCutPath?: string }).roughCutPath
  if (!roughCutPath) return
  const command = {
    opId: crypto.randomUUID(),
    projectId: project.id,
    type: 'PROJECT_SNAPSHOT_APPLY',
    timestamp: Date.now(),
    clientSequence: Date.now(),
    payload: { project },
  }
  const target = window.parent !== window ? window.parent : window
  const response = await new Promise<{ ok?: boolean; reason?: string }>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', onMessage)
      reject(new Error('Rough Cut command acknowledgment timed out'))
    }, 10000)
    function onMessage(event: MessageEvent<{ type?: string; ok?: boolean; reason?: string }>) {
      if (event.source !== target || event.data?.type !== 'freecut-command-ack') return
      window.clearTimeout(timeout)
      window.removeEventListener('message', onMessage)
      resolve(event.data)
    }
    window.addEventListener('message', onMessage)
    target.postMessage({ type: 'freecut-command', command }, '*')
  })
  if (!response.ok) throw new Error(response.reason ?? 'Rough Cut project command failed')
}
