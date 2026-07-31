/**
 * Headless render harness.
 *
 * This is a dedicated Vite entry (loaded by `headless.html`) that exposes a
 * small `window.freecut` API so a Node/Playwright driver can render projects to
 * video inside a real (headless) Chrome — reusing the exact same render engine
 * the editor uses, with no React UI, router, or workspace gate mounted.
 *
 * Browser APIs the render path depends on (WebCodecs, WebGPU, OffscreenCanvas,
 * OfflineAudioContext) all work in headless Chrome on a secure-context origin
 * (localhost), so fidelity matches the in-app export.
 *
 * Media is provided as fetchable URLs (served same-origin by the driver) and
 * seeded into `blobUrlManager`, so the real `resolveMediaUrls()` and the
 * engine's sub-composition media lookup resolve without the workspace/storage
 * layer being present.
 */
import type { Project } from '@/types/project'
import type { TimelineTrack, TimelineItem } from '@/types/timeline'
import type { Transition } from '@/types/transition'
import type { ItemKeyframes } from '@/types/keyframe'
import type { AudioEqSettings } from '@/types/audio'
import type { CompositionInputProps } from '@/types/export'
import type { MediaMetadata } from '@/types/storage'
import type { ItemEffect } from '@/types/effects'

import { createLogger } from '@/shared/logging/logger'
import { CURRENT_SCHEMA_VERSION, migrateProject } from '@/shared/projects/migrations'
import {
  DEFAULT_PROJECT_FPS,
  DEFAULT_PROJECT_HEIGHT,
  DEFAULT_PROJECT_WIDTH,
} from '@/shared/projects/defaults'
import { validateProject } from '@/features/project-bundle/schemas/project-schema'
import { mediaProcessorService } from '@/features/media-library/services/media-processor-service'
import { getMimeType, validateMediaFileContent } from '@/features/media-library/utils/validation'
import { convertTimelineToComposition } from '@/features/export/utils/timeline-to-composition'
import {
  renderComposition,
  renderAudioOnly,
} from '@/features/export/utils/canvas-render-orchestrator'
import type { ClientExportSettings, RenderProgress } from '@/features/export/utils/client-renderer'
import {
  getSupportedCodecs,
  selectFallbackVideoCodec,
  getPreferredContainerForCodec,
  getDefaultAudioCodec,
} from '@/features/export/utils/client-renderer'
import type { ClientVideoContainer } from '@/features/export/utils/client-renderer'
import { resolveMediaUrls } from '@/features/media-library/utils/media-resolver'
import { blobUrlManager } from '@/infrastructure/browser/blob-url-manager'
import {
  useCompositionsStore,
  type SubComposition,
} from '@/features/export/deps/timeline-compositions'
import { editProject } from './edit'
import { seedMediaLibrary } from './seed-media'

const log = createLogger('Headless')

interface HeadlessMediaSource {
  mediaId: string
  /** Same-origin (or CORS+CORP) URL the harness can fetch the full media bytes from. */
  url: string
  /**
   * The media's MediaMetadata (from the workspace `media/<id>/metadata.json`).
   * Seeded into the media-library store so codec lookups work — notably so
   * AC-3/E-AC-3 audio triggers the @mediabunny/ac3 decoder during export.
   */
  metadata?: MediaMetadata
}

/** Render from already-extracted timeline data (no Project schema required). */
interface HeadlessTimelineInput {
  tracks: TimelineTrack[]
  items: TimelineItem[]
  transitions?: Transition[]
  fps: number
  width: number
  height: number
  inPoint?: number | null
  outPoint?: number | null
  keyframes?: ItemKeyframes[]
  backgroundColor?: string
  busAudioEq?: AudioEqSettings
  masterBusDb?: number
  compositions?: SubComposition[]
  media?: HeadlessMediaSource[]
  settings: ClientExportSettings
  outputFileName?: string
}

/** Render a full Project object (runs migrations, then extracts the timeline). */
interface HeadlessProjectInput {
  project: Project
  settings: ClientExportSettings
  media?: HeadlessMediaSource[]
  /** When true (default), ignore the project's in/out points and render everything. */
  renderWholeProject?: boolean
  /**
   * Explicit render range in project frames. When provided, overrides both the
   * project's stored in/out points and renderWholeProject. Useful for rendering
   * a slice of a long project from the CLI.
   */
  inPoint?: number | null
  outPoint?: number | null
  outputFileName?: string
}

interface HeadlessRenderSummary {
  ok: true
  mimeType: string
  fileSize: number
  durationSeconds: number
  fileName: string
  /** Settings actually used after browser capability adaptation. */
  effectiveSettings: ClientExportSettings
  /** Non-fatal, machine-readable render degradations. */
  warnings: HeadlessRenderWarning[]
}

interface HeadlessRenderWarning {
  code: 'CODEC_FALLBACK' | 'WEBGPU_TRANSITION_FALLBACK'
  message: string
  details?: Record<string, unknown>
}

type ProgressSink = (progress: RenderProgress) => void

function reportProgress(progress: RenderProgress): void {
  const sink = (globalThis as unknown as { __freecutProgress?: ProgressSink }).__freecutProgress
  if (!sink) return
  try {
    sink(progress)
  } catch {
    // The driver-side binding may be torn down mid-render; ignore.
  }
}

/**
 * Register media URLs so resolveMediaUrls() + the engine's sub-comp media
 * lookup (blobUrlManager.get) resolve to them. We register the URL WITHOUT
 * downloading the bytes: mediabunny then reads via UrlSource (HTTP Range),
 * so large clips stream instead of being held fully in memory.
 */
function registerMediaUrls(media: HeadlessMediaSource[] | undefined): void {
  if (!media?.length) return
  for (const { mediaId, url } of media) {
    if (blobUrlManager.get(mediaId)) continue
    blobUrlManager.registerUrl(mediaId, url)
  }
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Defer revoke so the browser/Playwright has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 120_000)
}

function defaultFileName(settings: ClientExportSettings): string {
  return `freecut-export.${settings.container}`
}

function effectiveFileName(requested: string | undefined, settings: ClientExportSettings): string {
  if (!requested) return defaultFileName(settings)
  return `${requested.replace(/\.[^./\\]+$/, '')}.${settings.container}`
}

async function detectWebGpu(): Promise<boolean> {
  try {
    if (!('gpu' in navigator) || !navigator.gpu) return false
    const adapter = await navigator.gpu.requestAdapter()
    return Boolean(adapter)
  } catch {
    return false
  }
}

const hasEnabledEffects = (items: Array<{ effects?: ItemEffect[] }>): boolean =>
  items.some((item) => item.effects?.some((effect) => effect.enabled))

/** Whether the render needs WebGPU: GPU effects have no Canvas2D fallback. */
function compositionUsesGpuEffects(
  composition: CompositionInputProps,
  compositions: SubComposition[],
): boolean {
  const topLevel = (composition.tracks ?? []).flatMap((track) => track.items ?? [])
  if (hasEnabledEffects(topLevel)) return true
  return compositions.some((comp) => hasEnabledEffects(comp.items ?? []))
}

/**
 * Verify WebGPU is available when the project needs it. GPU effects can't fall
 * back to Canvas2D, so rendering them without WebGPU would silently drop them —
 * fail loudly instead. Transitions DO have a Canvas2D fallback, so a missing
 * GPU there is only a warning.
 */
async function assertGpuForComposition(
  composition: CompositionInputProps,
  compositions: SubComposition[],
): Promise<HeadlessRenderWarning[]> {
  const needsGpuEffects = compositionUsesGpuEffects(composition, compositions)
  const hasTransitions = (composition.transitions?.length ?? 0) > 0
  if (!needsGpuEffects && !hasTransitions) return []

  const gpuAvailable = await detectWebGpu()
  if (gpuAvailable) return []

  if (needsGpuEffects) {
    throw new Error(
      'This project uses GPU effects but WebGPU is unavailable in this environment, ' +
        'so effects cannot render. Launch Chrome with --enable-unsafe-webgpu on a machine ' +
        'with a GPU (or SwiftShader/Vulkan in headless/Docker).',
    )
  }
  const warning: HeadlessRenderWarning = {
    code: 'WEBGPU_TRANSITION_FALLBACK',
    message: 'WebGPU unavailable; transitions will use the Canvas2D fallback',
  }
  log.warn(warning.message)
  return [warning]
}

/**
 * Ensure the requested video codec is actually encodable in this browser;
 * otherwise fall back the same way the in-app export does.
 */
async function adaptVideoSettings(
  requestedSettings: ClientExportSettings,
): Promise<{ settings: ClientExportSettings; warnings: HeadlessRenderWarning[] }> {
  const settings = structuredClone(requestedSettings)
  if (settings.mode === 'audio') return { settings, warnings: [] }
  const testOverride = (
    globalThis as unknown as {
      __freecutSupportedCodecsOverride?: Awaited<ReturnType<typeof getSupportedCodecs>>
    }
  ).__freecutSupportedCodecsOverride
  const supported =
    testOverride ??
    (await getSupportedCodecs({
      width: settings.resolution.width,
      height: settings.resolution.height,
      bitrate: settings.videoBitrate,
    }))
  if (supported.includes(settings.codec)) {
    settings.audioCodec = getDefaultAudioCodec(settings.container)
    return { settings, warnings: [] }
  }

  const container = settings.container as ClientVideoContainer
  const fallback =
    selectFallbackVideoCodec(supported, container) ?? selectFallbackVideoCodec(supported)
  if (!fallback) {
    throw new Error(
      `No supported video codec available (requested ${settings.codec}; browser supports: ${supported.join(', ') || 'none'})`,
    )
  }
  const requested = settings.codec
  const effectiveContainer = getPreferredContainerForCodec(fallback)
  const warning: HeadlessRenderWarning = {
    code: 'CODEC_FALLBACK',
    message: `Requested video codec ${requested} is unsupported; using ${fallback}/${effectiveContainer}`,
    details: { requestedCodec: requested, effectiveCodec: fallback, effectiveContainer },
  }
  log.warn(warning.message, {
    requested,
    fallback,
    container: effectiveContainer,
  })
  settings.codec = fallback
  settings.container = effectiveContainer
  settings.audioCodec = getDefaultAudioCodec(effectiveContainer)
  return { settings, warnings: [warning] }
}

async function renderTimeline(input: HeadlessTimelineInput): Promise<HeadlessRenderSummary> {
  const {
    tracks,
    items,
    transitions = [],
    fps,
    width,
    height,
    inPoint = null,
    outPoint = null,
    keyframes = [],
    backgroundColor,
    busAudioEq,
    masterBusDb,
    compositions = [],
    media,
    settings: requestedSettings,
  } = input

  log.info('Headless render starting', {
    mode: requestedSettings.mode,
    codec: requestedSettings.codec,
    container: requestedSettings.container,
    resolution: `${requestedSettings.resolution.width}x${requestedSettings.resolution.height}`,
    fps,
    tracks: tracks.length,
    items: items.length,
    compositions: compositions.length,
    media: media?.length ?? 0,
  })

  // Seed sub-compositions so the engine can resolve compound clips.
  useCompositionsStore.getState().setCompositions(compositions)

  // Register media URLs (range-streamed by mediabunny) so resolveMediaUrls()
  // and the engine's sub-comp media lookup resolve without the storage layer.
  registerMediaUrls(media)
  // Seed media metadata so codec lookups resolve (enables AC-3/E-AC-3 audio).
  seedMediaLibrary(media)

  const { settings, warnings } = await adaptVideoSettings(requestedSettings)

  const composition: CompositionInputProps = convertTimelineToComposition(
    tracks,
    items,
    transitions,
    fps,
    width,
    height,
    inPoint,
    outPoint,
    keyframes,
    backgroundColor,
    busAudioEq,
    masterBusDb,
  )

  // Fail loudly if the project needs WebGPU (effects) but it isn't available.
  warnings.push(...(await assertGpuForComposition(composition, compositions)))

  // Resolve top-level media (mediaId -> seeded blob URL). Export never uses proxies.
  composition.tracks = await resolveMediaUrls(composition.tracks, { useProxy: false })

  const result =
    settings.mode === 'audio'
      ? await renderAudioOnly({ settings, composition, onProgress: reportProgress })
      : await renderComposition({ settings, composition, onProgress: reportProgress })

  const fileName = effectiveFileName(input.outputFileName, settings)
  triggerDownload(result.blob, fileName)

  log.info('Headless render complete', {
    mimeType: result.mimeType,
    fileSize: result.fileSize,
    durationSeconds: result.duration,
    fileName,
  })

  return {
    ok: true,
    mimeType: result.mimeType,
    fileSize: result.fileSize,
    durationSeconds: result.duration,
    fileName,
    effectiveSettings: settings,
    warnings,
  }
}

async function renderProject(input: HeadlessProjectInput): Promise<HeadlessRenderSummary> {
  const { project: rawProject, settings, media, renderWholeProject = true, outputFileName } = input
  const { project } = migrateProject(rawProject)
  const timeline = project.timeline
  if (!timeline) {
    throw new Error('Project has no timeline to render')
  }

  const meta = project.metadata
  const hasExplicitRange = input.inPoint != null || input.outPoint != null
  const inPoint = hasExplicitRange
    ? (input.inPoint ?? null)
    : renderWholeProject
      ? null
      : (timeline.inPoint ?? null)
  const outPoint = hasExplicitRange
    ? (input.outPoint ?? null)
    : renderWholeProject
      ? null
      : (timeline.outPoint ?? null)

  return renderTimeline({
    tracks: (timeline.tracks ?? []) as unknown as TimelineTrack[],
    items: (timeline.items ?? []) as unknown as TimelineItem[],
    transitions: (timeline.transitions ?? []) as Transition[],
    fps: meta?.fps ?? 30,
    width: meta?.width ?? 1920,
    height: meta?.height ?? 1080,
    inPoint,
    outPoint,
    keyframes: (timeline.keyframes ?? []) as unknown as ItemKeyframes[],
    backgroundColor: meta?.backgroundColor,
    busAudioEq: timeline.busAudioEq,
    masterBusDb: timeline.masterBusDb,
    compositions: (timeline.compositions ?? []) as unknown as SubComposition[],
    media,
    settings,
    outputFileName,
  })
}

interface FreecutHeadlessApi {
  ready: true
  renderTimeline: typeof renderTimeline
  renderProject: typeof renderProject
  editProject: typeof editProject
  normalizeProject: typeof normalizeProjectForHeadless
  probeMedia: typeof probeMedia
  createProject: typeof createProjectForHeadless
}

function createProjectForHeadless(input: {
  id?: string
  name: string
  description?: string
  width?: number
  height?: number
  fps?: number
  backgroundColor?: string
}): Project {
  const now = Date.now()
  const raw: Project = {
    id: input.id ?? crypto.randomUUID(),
    name: input.name,
    description: input.description ?? '',
    createdAt: now,
    updatedAt: now,
    duration: 0,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    metadata: {
      width: input.width ?? DEFAULT_PROJECT_WIDTH,
      height: input.height ?? DEFAULT_PROJECT_HEIGHT,
      fps: input.fps ?? DEFAULT_PROJECT_FPS,
      ...(input.backgroundColor ? { backgroundColor: input.backgroundColor } : {}),
    },
  }
  const validated = validateProject(raw)
  if (!validated.success || !validated.data) throw new Error('Created project failed validation')
  return validated.data as Project
}

async function normalizeProjectForHeadless(raw: unknown): Promise<Project> {
  const validated = validateProject(raw)
  if (!validated.success || !validated.data) {
    throw new Error(
      `Project validation failed: ${validated.errors?.issues[0]?.message ?? 'invalid project'}`,
    )
  }
  const migrated = migrateProject(validated.data as Project).project
  const current = validateProject(migrated)
  if (!current.success || !current.data) throw new Error('Migrated project failed validation')
  return current.data as Project
}

async function probeMedia(input: { url: string; fileName: string; mimeType?: string }) {
  const response = await fetch(input.url)
  if (!response.ok) throw new Error(`Media fetch failed: HTTP ${response.status}`)
  if (!response.body || typeof navigator.storage?.getDirectory !== 'function') {
    throw new Error('Streaming media probe requires OPFS and a readable response body')
  }
  const root = await navigator.storage.getDirectory()
  const safeName = input.fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(-160) || 'source.bin'
  const tempName = `.freecut-probe-${crypto.randomUUID()}-${safeName}`
  try {
    const handle = await root.getFileHandle(tempName, { create: true })
    const writable = await handle.createWritable()
    await response.body.pipeTo(writable)
    const file = await handle.getFile()
    const validation = await validateMediaFileContent(file)
    if (!validation.valid) throw new Error(validation.error ?? 'Media validation failed')
    const mimeType = input.mimeType || getMimeType(file)
    const { metadata } = await mediaProcessorService.processMedia(file, mimeType, {
      generateThumbnail: false,
      fastMetadata: true,
    })
    return { mimeType, metadata }
  } finally {
    await root.removeEntry(tempName).catch(() => {})
  }
}

declare global {
  interface Window {
    freecut: FreecutHeadlessApi
  }
}

window.freecut = {
  ready: true,
  renderTimeline,
  renderProject,
  editProject,
  normalizeProject: normalizeProjectForHeadless,
  probeMedia,
  createProject: createProjectForHeadless,
}
log.info('Headless harness ready')
