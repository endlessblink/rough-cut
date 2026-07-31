/**
 * Canvas Render Orchestrator
 *
 * Top-level entry points that drive the full render pipeline:
 * - {@link renderComposition} – renders a full video composition (video + audio)
 * - {@link renderAudioOnly}  – encodes only the audio tracks
 * - {@link renderSingleFrame} – renders one frame to a Blob (thumbnails)
 *
 * These functions set up the mediabunny encoder, call into
 * {@link createCompositionRenderer} for per-frame rendering, and handle
 * progress reporting and cancellation.
 */

import type { CompositionInputProps, SubtitleExportMode } from '@/types/export'
import type { TimelineTrack, TimelineItem, VideoItem } from '@/types/timeline'
import type { ClientExportSettings, RenderProgress, ClientRenderResult } from './client-renderer'
import { createOutputFormat, getDefaultAudioCodec, getMimeType } from './client-renderer'
import { createMediabunnyInputSource } from '@/infrastructure/browser/mediabunny-input-source'
import { createLogger } from '@/shared/logging/logger'
import { ensureAudioEncoderSupport } from '@/shared/media/audio-encoder-support'
import { hasMediaCrop } from '@/shared/utils/media-crop'
import { DEFAULT_PROJECT_HEIGHT, DEFAULT_PROJECT_WIDTH } from '@/shared/projects/defaults'
import {
  buildTranscriptSubtitleWebVtt,
  omitTranscriptSubtitleItemsForSoftSubtitleExport,
} from './embedded-subtitle-export'
import { createExportOutputTarget } from './export-output-target'

// Subsystems
import { createCompositionRenderer } from './client-render-engine'

function getLog() {
  return createLogger('CanvasRenderOrchestrator')
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Type for mediabunny module (dynamically imported)
type MediabunnyModule = typeof import('mediabunny')
type CanvasAudioModule = typeof import('./canvas-audio')

let canvasAudioModulePromise: Promise<CanvasAudioModule> | null = null

async function loadCanvasAudio(): Promise<CanvasAudioModule> {
  if (!canvasAudioModulePromise) {
    canvasAudioModulePromise = import('./canvas-audio')
  }
  return canvasAudioModulePromise
}

const AUDIO_ENCODE_CHUNK_FRAMES = 48_000

function formatClock(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(wholeSeconds / 3600)
  const minutes = Math.floor((wholeSeconds % 3600) / 60)
  const remainingSeconds = wholeSeconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    : `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

async function addAudioDataInChunks(
  audioSource: InstanceType<MediabunnyModule['AudioSampleSource']>,
  AudioSample: MediabunnyModule['AudioSample'],
  audioData: { samples: Float32Array[]; sampleRate: number; channels: number },
  signal?: AbortSignal,
  startTimestamp = 0,
  onFramesAdded?: (frames: number) => void,
): Promise<void> {
  const totalFrames = audioData.samples[0]?.length ?? 0

  for (let offset = 0; offset < totalFrames; offset += AUDIO_ENCODE_CHUNK_FRAMES) {
    if (signal?.aborted) throw new DOMException('Audio encoding cancelled', 'AbortError')

    const frameCount = Math.min(AUDIO_ENCODE_CHUNK_FRAMES, totalFrames - offset)
    const planar = new Float32Array(frameCount * audioData.channels)
    for (let channel = 0; channel < audioData.channels; channel++) {
      const samples = audioData.samples[channel]
      if (samples) planar.set(samples.subarray(offset, offset + frameCount), channel * frameCount)
    }

    const sample = new AudioSample({
      data: planar,
      format: 'f32-planar',
      numberOfChannels: audioData.channels,
      sampleRate: audioData.sampleRate,
      timestamp: startTimestamp + offset / audioData.sampleRate,
    })
    try {
      await audioSource.add(sample)
      onFramesAdded?.(frameCount)
    } finally {
      sample.close()
    }
  }
}

async function addCompositionAudio(params: {
  audioSource: InstanceType<MediabunnyModule['AudioSampleSource']>
  AudioSample: MediabunnyModule['AudioSample']
  canvasAudio: CanvasAudioModule
  composition: CompositionInputProps
  useWindowedAudio: boolean
  signal?: AbortSignal
  onProgress?: (encodedFrames: number) => void
}): Promise<number> {
  const { audioSource, AudioSample, canvasAudio, composition, signal, onProgress } = params
  let encodedFrames = 0
  const recordFrames = (frames: number) => {
    encodedFrames += frames
    onProgress?.(encodedFrames)
  }
  if (params.useWindowedAudio) {
    for await (const window of canvasAudio.processAudioWindows(composition, signal)) {
      await addAudioDataInChunks(
        audioSource,
        AudioSample,
        window,
        signal,
        encodedFrames / window.sampleRate,
        recordFrames,
      )
    }
    return encodedFrames
  }

  const audioData = await canvasAudio.processAudio(composition, signal)
  if (!audioData) return 0
  await addAudioDataInChunks(audioSource, AudioSample, audioData, signal, 0, recordFrames)
  return encodedFrames
}

interface PreparedAudioPacketCopy {
  input: InstanceType<MediabunnyModule['Input']>
  track: NonNullable<Awaited<ReturnType<InstanceType<MediabunnyModule['Input']>['getPrimaryAudioTrack']>>>
  source: InstanceType<MediabunnyModule['EncodedAudioPacketSource']>
  durationSeconds: number
}

async function prepareAudioPacketCopy(params: {
  mediabunny: MediabunnyModule
  canvasAudio: CanvasAudioModule
  composition: CompositionInputProps
  supportedCodecs: readonly string[]
}): Promise<PreparedAudioPacketCopy | null> {
  const plan = params.canvasAudio.getAudioPacketPassthroughPlan(params.composition)
  if (!plan) return null

  const { mediabunny } = params
  const input = new mediabunny.Input({
    formats: mediabunny.ALL_FORMATS,
    source: createMediabunnyInputSource(mediabunny, plan.src),
  })
  let ownershipTransferred = false
  try {
    const track = await input.getPrimaryAudioTrack()
    if (!track) return null
    const codec = await track.getCodec()
    const firstTimestamp = await track.getFirstTimestamp()
    if (!codec || !params.supportedCodecs.includes(codec) || Math.abs(firstTimestamp) > 0.001) {
      return null
    }
    const prepared = {
      input,
      track,
      source: new mediabunny.EncodedAudioPacketSource(codec),
      durationSeconds: plan.durationSeconds,
    }
    ownershipTransferred = true
    return prepared
  } catch (error) {
    getLog().warn('Audio packet-copy preflight failed; audio will be re-encoded', { error })
    return null
  } finally {
    if (!ownershipTransferred) input.dispose()
  }
}

async function feedAudioPacketCopy(params: {
  mediabunny: MediabunnyModule
  prepared: PreparedAudioPacketCopy
  signal?: AbortSignal
  onProgress?: (seconds: number) => void
}): Promise<void> {
  const { mediabunny, prepared, signal, onProgress } = params
  try {
    const sink = new mediabunny.EncodedPacketSink(prepared.track)
    const decoderConfig = await prepared.track.getDecoderConfig()
    const metadata = { decoderConfig: decoderConfig ?? undefined }
    for await (const packet of sink.packets()) {
      if (signal?.aborted) throw new DOMException('Audio copy cancelled', 'AbortError')
      if (packet.timestamp >= prepared.durationSeconds) break
      const copiedPacket = packet.clone({ timestamp: packet.timestamp })
      await prepared.source.add(copiedPacket, metadata)
      onProgress?.(Math.min(prepared.durationSeconds, packet.timestamp + packet.duration))
    }
  } finally {
    try {
      prepared.source.close()
    } finally {
      prepared.input.dispose()
    }
  }
}

function getAudioOnlyCodec(
  container: ClientExportSettings['container'],
): 'mp3' | 'aac' | 'pcm-s16' {
  if (container === 'mp3') return 'mp3'
  if (container === 'aac') return 'aac'
  return 'pcm-s16'
}

async function registerMp3EncoderIfNeeded(container: ClientExportSettings['container']) {
  if (container !== 'mp3') return
  try {
    const { registerMp3Encoder } = await import('@mediabunny/mp3-encoder')
    registerMp3Encoder()
    getLog().info('MP3 encoder registered')
  } catch (error) {
    getLog().warn('Failed to load MP3 encoder extension', error)
  }
}

async function assertAudioOnlyEncoderSupported(
  codec: 'mp3' | 'aac' | 'pcm-s16',
  bitrate: number,
): Promise<void> {
  if (codec === 'pcm-s16') return
  const supported = await ensureAudioEncoderSupport(codec, {
    bitrate,
    numberOfChannels: 2,
    sampleRate: 48_000,
  })
  if (!supported) {
    throw new Error(
      `${codec.toUpperCase()} encoding is not supported in this browser. ` +
        'Try exporting as WAV (lossless) instead.',
    )
  }
  getLog().info(`Using ${codec.toUpperCase()} codec`)
}

export interface RenderEngineOptions {
  settings: ClientExportSettings
  composition: CompositionInputProps
  onProgress: (progress: RenderProgress) => void
  signal?: AbortSignal
}

interface AudioRenderOptions {
  settings: ClientExportSettings
  composition: CompositionInputProps
  onProgress: (progress: RenderProgress) => void
  signal?: AbortSignal
}

interface SingleFrameOptions {
  composition: CompositionInputProps
  frame: number
  width?: number
  height?: number
  quality?: number
  format?: 'image/jpeg' | 'image/png' | 'image/webp'
}

interface PacketRemuxPlan {
  src: string
  trimStartSeconds: number
  trimEndSeconds: number
  includeAudio: boolean
}

const EPSILON = 1e-6

function isIdentityTransform(item: VideoItem): boolean {
  const transform = item.transform
  if (hasMediaCrop(item.crop)) return false
  if (!transform) return true

  if (transform.width !== undefined || transform.height !== undefined) return false
  if (transform.x !== undefined && Math.abs(transform.x) > EPSILON) return false
  if (transform.y !== undefined && Math.abs(transform.y) > EPSILON) return false
  if (transform.rotation !== undefined && Math.abs(transform.rotation) > EPSILON) return false
  if (transform.cornerRadius !== undefined && Math.abs(transform.cornerRadius) > EPSILON)
    return false
  if (transform.opacity !== undefined && Math.abs(transform.opacity - 1) > EPSILON) return false
  return true
}

function getPacketRemuxPlan(
  settings: ClientExportSettings,
  composition: CompositionInputProps,
): PacketRemuxPlan | null {
  if (settings.mode !== 'video') return null
  if (composition.durationInFrames === undefined || composition.durationInFrames <= 0) return null
  if ((composition.transitions?.length ?? 0) > 0) return null
  if ((composition.keyframes?.length ?? 0) > 0) return null

  const tracks: TimelineTrack[] = (composition.tracks ?? []).filter(
    (track) => track.visible !== false,
  )
  const items: Array<{ item: TimelineItem; track: TimelineTrack }> = []

  for (const track of tracks) {
    for (const item of track.items ?? []) {
      if (item.durationInFrames > 0) {
        items.push({ item, track })
      }
    }
  }

  if (items.length !== 1) return null

  const { item, track } = items[0]!
  if (item.type !== 'video') return null

  const videoItem = item as VideoItem
  if (!videoItem.src) return null
  if (videoItem.isReversed === true) return null
  if (videoItem.from !== 0) return null
  if (videoItem.durationInFrames !== composition.durationInFrames) return null
  if ((videoItem.effects?.length ?? 0) > 0) return null
  if (!isIdentityTransform(videoItem)) return null

  const speed = videoItem.speed ?? 1
  if (Math.abs(speed - 1) > EPSILON) return null

  const hasVisualFades =
    Math.abs(videoItem.fadeIn ?? 0) > EPSILON || Math.abs(videoItem.fadeOut ?? 0) > EPSILON
  if (hasVisualFades) return null

  const includeAudio = track.muted !== true
  if (includeAudio) {
    const hasAudioAdjustments =
      Math.abs(videoItem.volume ?? 0) > EPSILON ||
      Math.abs(videoItem.audioFadeIn ?? 0) > EPSILON ||
      Math.abs(videoItem.audioFadeOut ?? 0) > EPSILON
    if (hasAudioAdjustments) return null
  }

  const sourceFps = videoItem.sourceFps ?? composition.fps
  if (!Number.isFinite(sourceFps) || sourceFps <= 0) return null
  if (Math.abs((settings.fps ?? composition.fps) - composition.fps) > EPSILON) return null

  // Require clip to start at source frame 0 — a trimmed-from-middle clip can't be
  // remuxed directly and must fall back to frame-by-frame rendering.
  const sourceStartFrames = videoItem.sourceStart ?? videoItem.trimStart ?? videoItem.offset ?? 0
  if (Math.abs(sourceStartFrames) > EPSILON) return null
  const trimStartSeconds = Math.max(0, sourceStartFrames / sourceFps)
  const clipDurationSeconds = videoItem.durationInFrames / composition.fps
  if (!Number.isFinite(clipDurationSeconds) || clipDurationSeconds <= 0) return null

  const trimEndSeconds = trimStartSeconds + clipDurationSeconds
  if (!Number.isFinite(trimEndSeconds) || trimEndSeconds <= trimStartSeconds) return null

  return {
    src: videoItem.src,
    trimStartSeconds,
    trimEndSeconds,
    includeAudio,
  }
}

async function tryPacketRemuxComposition(
  options: RenderEngineOptions,
): Promise<ClientRenderResult | null> {
  const { settings, composition, onProgress, signal } = options
  const durationInFrames = composition.durationInFrames ?? 0
  const fps = composition.fps
  const durationSeconds = durationInFrames / Math.max(fps, 1)

  const plan = getPacketRemuxPlan(settings, composition)
  if (!plan) return null
  if (signal?.aborted) {
    throw new DOMException('Render cancelled', 'AbortError')
  }

  const mediabunny: MediabunnyModule = await import('mediabunny')
  const { Input, Output, Conversion, ALL_FORMATS } = mediabunny

  const validationFormat = (await createOutputFormat(settings.container, { fastStart: false })) as {
    getSupportedVideoCodecs?: () => string[]
    getSupportedAudioCodecs?: () => string[]
  }

  const input = new Input({
    formats: ALL_FORMATS,
    source: createMediabunnyInputSource(mediabunny, plan.src),
  })

  let conversion: {
    cancel: () => Promise<void>
    isValid: boolean
    onProgress?: (progress: number, processedTime: number) => unknown
    execute: () => Promise<void>
  } | null = null
  const cancelConversion = () => {
    if (!conversion) return
    void conversion.cancel().catch(() => undefined)
  }

  signal?.addEventListener('abort', cancelConversion, { once: true })

  try {
    const videoTrack = await input.getPrimaryVideoTrack()
    if (!videoTrack?.codec) {
      return null
    }

    const supportedVideoCodecs = validationFormat.getSupportedVideoCodecs?.() ?? []
    if (!supportedVideoCodecs.includes(videoTrack.codec) || videoTrack.codec !== settings.codec) {
      return null
    }

    if (
      videoTrack.displayWidth !== settings.resolution.width ||
      videoTrack.displayHeight !== settings.resolution.height
    ) {
      return null
    }

    if (plan.includeAudio) {
      const audioTrack = await input.getPrimaryAudioTrack()
      if (audioTrack?.codec) {
        const supportedAudioCodecs = validationFormat.getSupportedAudioCodecs?.() ?? []
        if (!supportedAudioCodecs.includes(audioTrack.codec)) {
          return null
        }
      }
    }

    onProgress({
      phase: 'preparing',
      progress: 5,
      totalFrames: durationInFrames,
      message: 'Preparing packet remux...',
    })

    // Create output resources only after all validation checks pass. File-backed
    // output keeps long remuxes out of the renderer process heap.
    const mimeType = getMimeType(settings.container, settings.codec)
    const outputTarget = await createExportOutputTarget(mediabunny, settings.container, mimeType)
    const format = await createOutputFormat(settings.container, {
      fastStart: outputTarget.kind === 'buffer',
    })
    const output = new Output({
      format: format as unknown as ConstructorParameters<typeof Output>[0]['format'],
      target: outputTarget.target,
    })
    let outputCompleted = false

    try {
      conversion = await Conversion.init({
        input,
        output,
        trim: {
          start: plan.trimStartSeconds,
          end: plan.trimEndSeconds,
        },
        video: {
          codec: settings.codec,
          forceTranscode: false,
        },
        audio: plan.includeAudio ? { forceTranscode: false } : { discard: true },
        showWarnings: false,
      })

      if (!conversion.isValid) {
        return null
      }

      conversion.onProgress = (progress: number) => {
        const clamped = Math.max(0, Math.min(1, progress))
        onProgress({
          phase: 'encoding',
          progress: Math.round(clamped * 90),
          currentFrame: Math.round(clamped * durationInFrames),
          totalFrames: durationInFrames,
          message: 'Remuxing packets...',
        })
      }

      await conversion.execute()

      const completed = await outputTarget.complete()
      outputCompleted = true
      const { blob } = completed

      onProgress({
        phase: 'finalizing',
        progress: 100,
        currentFrame: durationInFrames,
        totalFrames: durationInFrames,
        message: 'Complete!',
      })

      getLog().info('Packet remux export completed', {
        durationSeconds,
        fileSize: blob.size,
        container: settings.container,
        codec: settings.codec,
        includeAudio: plan.includeAudio,
      })

      return {
        blob,
        mimeType,
        duration: durationSeconds,
        fileSize: blob.size,
        temporaryOutput: completed.temporaryOutput,
      }
    } finally {
      ;(output as unknown as { dispose?: () => void }).dispose?.()
      if (!outputCompleted) await outputTarget.discard()
    }
  } catch (error) {
    const isCanceled =
      signal?.aborted || (error instanceof Error && error.name === 'ConversionCanceledError')
    if (isCanceled) {
      throw new DOMException('Render cancelled', 'AbortError')
    }

    getLog().warn('Packet remux path failed; falling back to frame render', { error })
    return null
  } finally {
    signal?.removeEventListener('abort', cancelConversion)
    input.dispose()
  }
}

// ---------------------------------------------------------------------------
// renderComposition
// ---------------------------------------------------------------------------

/**
 * Main render function – orchestrates the entire client-side render.
 */
export async function renderComposition(options: RenderEngineOptions): Promise<ClientRenderResult> {
  const { settings, composition, onProgress, signal } = options
  const { fps, durationInFrames = 0 } = composition
  const canvasAudio = await loadCanvasAudio()

  getLog().info('Starting enhanced client render', {
    fps,
    durationInFrames,
    durationSeconds: durationInFrames / fps,
    width: settings.resolution.width,
    height: settings.resolution.height,
    codec: settings.codec,
    tracksCount: composition.tracks?.length ?? 0,
    hasTransitions: (composition.transitions?.length ?? 0) > 0,
    hasKeyframes: (composition.keyframes?.length ?? 0) > 0,
  })

  // Validate inputs
  if (durationInFrames <= 0) {
    throw new Error('Composition has no duration')
  }

  const totalFrames = durationInFrames
  const durationSeconds = totalFrames / fps

  onProgress({
    phase: 'preparing',
    progress: 0,
    totalFrames,
    message: 'Loading encoder...',
  })

  // Check for abort
  if (signal?.aborted) {
    throw new DOMException('Render cancelled', 'AbortError')
  }

  // Fast path: when the timeline is a single unmodified clip, remux packets directly.
  const remuxResult = await tryPacketRemuxComposition(options)
  if (remuxResult) {
    return remuxResult
  }

  // Dynamically import mediabunny (AC-3 decoder is loaded lazily by canvas-audio when needed)
  const mediabunny: MediabunnyModule = await import('mediabunny')
  const {
    Output,
    VideoSampleSource,
    VideoSample,
    AudioSampleSource,
    AudioSample,
    TextSubtitleSource,
  } = mediabunny

  onProgress({
    phase: 'preparing',
    progress: 5,
    totalFrames,
    message: 'Processing audio...',
  })

  const compositionHasAudio = await canvasAudio.hasAudioContent(composition)
  const useWindowedAudio =
    compositionHasAudio &&
    durationInFrames / fps >= 5 * 60 &&
    canvasAudio.supportsWindowedAudioProcessing(composition)

  onProgress({
    phase: 'preparing',
    progress: 15,
    totalFrames,
    message: 'Creating encoder...',
  })

  const mimeType = getMimeType(settings.container, settings.codec)
  const outputTarget = await createExportOutputTarget(mediabunny, settings.container, mimeType)
  const format = await createOutputFormat(settings.container, {
    fastStart: outputTarget.kind === 'buffer',
  })
  const packetAudio = compositionHasAudio
    ? await prepareAudioPacketCopy({
        mediabunny,
        canvasAudio,
        composition,
        supportedCodecs: format.getSupportedAudioCodecs(),
      })
    : null

  // Create output
  const output = new Output({
    format,
    target: outputTarget.target,
  })

  // Subtitle handling per mode:
  // - `burn`   : keep the transcript items so they render into the frames.
  // - `off`    : drop them (no captions).
  // - `sidecar`: drop them here — the clean video is muxed; the .srt file is
  //              generated and downloaded on the main thread.
  // - `embedded`: mux a soft WebVTT track, but ONLY for Matroska (WebM/MKV).
  //   mediabunny never starts its ISOBMFF subtitle `auxWriter`, so WebVTT-into-
  //   MP4/MOV asserts ("Assertion failed") via an uncatchable floating rejection;
  //   there we fall back to burning captions in so they aren't silently lost.
  const subtitleMode: SubtitleExportMode = settings.subtitleMode ?? 'burn'
  const supportsWebVttSubtitles = format.getSupportedSubtitleCodecs().includes('webvtt')
  const isIsobmffContainer = settings.container === 'mp4' || settings.container === 'mov'
  const transcriptSubtitleVtt =
    subtitleMode === 'embedded' ? buildTranscriptSubtitleWebVtt(composition) : null
  const embedTranscriptSubtitles =
    transcriptSubtitleVtt !== null && supportsWebVttSubtitles && !isIsobmffContainer
  const burnInSubtitles =
    subtitleMode === 'burn' || (subtitleMode === 'embedded' && !embedTranscriptSubtitles)
  const renderCompositionInput = burnInSubtitles
    ? composition
    : omitTranscriptSubtitleItemsForSoftSubtitleExport(composition)

  if (subtitleMode === 'embedded' && transcriptSubtitleVtt !== null && !embedTranscriptSubtitles) {
    getLog().warn(
      `${settings.container.toUpperCase()} can't embed a soft subtitle track; ` +
        'burning captions into the video instead.',
    )
  }

  let transcriptSubtitleSource: InstanceType<typeof TextSubtitleSource> | null = null
  if (embedTranscriptSubtitles) {
    transcriptSubtitleSource = new TextSubtitleSource('webvtt')
    output.addSubtitleTrack(transcriptSubtitleSource, {
      languageCode: 'eng',
      name: 'Transcript',
      disposition: {
        default: true,
      },
    })
    getLog().info('Transcript subtitles will be embedded as WebVTT track', {
      container: settings.container,
    })
  }

  // Get composition (project) resolution – this is what we render at
  const compositionWidth = renderCompositionInput.width ?? settings.resolution.width
  const compositionHeight = renderCompositionInput.height ?? settings.resolution.height

  // Export resolution – this is what we output (may be different from composition)
  const exportWidth = settings.resolution.width
  const exportHeight = settings.resolution.height

  // Check if we need to scale (export resolution differs from composition)
  const needsScaling = exportWidth !== compositionWidth || exportHeight !== compositionHeight

  getLog().info('Resolution settings', {
    composition: { width: compositionWidth, height: compositionHeight },
    export: { width: exportWidth, height: exportHeight },
    needsScaling,
  })

  // Create canvas for rendering frames at COMPOSITION resolution
  // This ensures all positioning/transforms are calculated correctly
  const renderCanvas = new OffscreenCanvas(compositionWidth, compositionHeight)
  // Keep default context settings to preserve hardware acceleration.
  // `willReadFrequently` can force software rendering and slow draw-heavy workloads.
  const ctx = renderCanvas.getContext('2d')

  if (!ctx) {
    if (packetAudio) {
      packetAudio.source.close()
      packetAudio.input.dispose()
    }
    throw new Error('Failed to create OffscreenCanvas 2D context')
  }

  // Create output canvas at EXPORT resolution (for encoding)
  // If no scaling needed, we'll use renderCanvas directly
  const outputCanvas = needsScaling ? new OffscreenCanvas(exportWidth, exportHeight) : renderCanvas
  const outputCtx = needsScaling ? outputCanvas.getContext('2d')! : ctx

  onProgress({
    phase: 'preparing',
    progress: 20,
    totalFrames,
    message: 'Setting up video encoder...',
  })

  // Create video source for explicit frame capture (at export resolution)
  // VideoSampleSource lets us control frame capture timing precisely with VideoSample
  // Use 'quality' latencyMode to enable B-frames and better rate control for offline encoding
  const videoSource = new VideoSampleSource({
    codec: settings.codec,
    bitrate: settings.videoBitrate ?? 10_000_000,
    bitrateMode: settings.bitrateMode ?? 'variable',
    keyFrameInterval: 2, // Keyframe every 2 seconds for better seeking
    latencyMode: 'quality', // Enables B-frames and consistent frame quality for offline encoding
  })

  // Add video track
  output.addVideoTrack(videoSource, {
    frameRate: fps,
  })

  let audioSource: InstanceType<typeof AudioSampleSource> | null = null

  if (packetAudio) {
    output.addAudioTrack(packetAudio.source)
    getLog().info('Audio will be copied without decoding or re-encoding')
  } else if (compositionHasAudio) {
    try {
      // Select the container-compatible audio codec for the muxer.
      const audioCodec = getDefaultAudioCodec(settings.container)
      if (audioCodec !== 'aac' && audioCodec !== 'opus') {
        throw new Error(
          `Unsupported audio codec ${audioCodec} for ${settings.container.toUpperCase()} export`,
        )
      }
      const supported = await ensureAudioEncoderSupport(audioCodec, {
        bitrate: settings.audioBitrate ?? 192_000,
        numberOfChannels: 2,
        sampleRate: 48_000,
      })
      if (!supported) {
        throw new Error(
          `${audioCodec.toUpperCase()} audio encoding is not supported in this browser. ` +
            'Choose WebM or MKV with Opus audio.',
        )
      }

      // Create audio source for encoding
      audioSource = new AudioSampleSource({
        codec: audioCodec,
        bitrate: settings.audioBitrate ?? 192000,
      })

      // Add audio track to output (audio data fed after start())
      output.addAudioTrack(audioSource)
      getLog().info('Audio track added to output', {
        duration: durationInFrames / fps,
        channels: 2,
        sampleRate: 48_000,
        codec: audioCodec,
        windowed: useWindowedAudio,
      })
    } catch (error) {
      getLog().error('Failed to setup audio track', { error })
      await outputTarget.discard()
      throw error
    }
  }

  try {
    await output.start()

    if (transcriptSubtitleSource && transcriptSubtitleVtt) {
      await transcriptSubtitleSource.add(transcriptSubtitleVtt)
      transcriptSubtitleSource.close()
    }
  } catch (error) {
    if (packetAudio) {
      try {
        packetAudio.source.close()
      } finally {
        packetAudio.input.dispose()
      }
    }
    await outputTarget.discard()
    throw error
  }

  let videoRenderingStarted = false
  let audioError: unknown
  const reportAudioProgress = (completedSeconds: number, mode: 'copying' | 'processing') => {
    if (videoRenderingStarted) return
    const boundedSeconds = Math.min(durationSeconds, completedSeconds)
    const progress = 20 + Math.round((boundedSeconds / durationSeconds) * 15)
    onProgress({
      phase: 'preparing',
      progress,
      totalFrames,
      message: `${mode === 'copying' ? 'Copying' : 'Processing'} audio ${formatClock(boundedSeconds)} / ${formatClock(durationSeconds)}`,
    })
  }

  // Audio and video now advance together. Mediabunny's source backpressure
  // bounds encoded data while windowed processing bounds decoded PCM memory.
  const audioTask: Promise<void> | null = packetAudio
    ? feedAudioPacketCopy({
        mediabunny,
        prepared: packetAudio,
        signal,
        onProgress: (seconds) => reportAudioProgress(seconds, 'copying'),
      })
    : audioSource
      ? (async () => {
          try {
            const encodedFrames = await addCompositionAudio({
              audioSource,
              AudioSample,
              canvasAudio,
              composition,
              useWindowedAudio,
              signal,
              onProgress: (frames) => reportAudioProgress(frames / 48_000, 'processing'),
            })
            getLog().info('Audio chunks fed to encoder', {
              duration: encodedFrames / 48_000,
              samples: encodedFrames,
              windowed: useWindowedAudio,
            })
          } finally {
            audioSource.close()
            audioSource = null
          }
        })()
      : null
  void audioTask?.catch((error: unknown) => {
    audioError = error
  })

  onProgress({
    phase: 'rendering',
    progress: 0,
    currentFrame: 0,
    totalFrames,
    message: 'Rendering frames...',
  })

  let frameRenderer: Awaited<ReturnType<typeof createCompositionRenderer>> | null = null

  try {
    frameRenderer = await createCompositionRenderer(renderCompositionInput, renderCanvas, ctx)
    // Preload media
    await frameRenderer.preload()
    videoRenderingStarted = true
    if (audioError) throw audioError

    // Render each frame using a pipelined double-buffer approach.
    // VideoSample copies pixel data on construction, so the canvas is free
    // immediately after. We overlap the previous frame's encode with the
    // next frame's render for ~25-40% throughput improvement.
    let pendingEncode: Promise<void> | null = null

    for (let frame = 0; frame < totalFrames; frame++) {
      if (audioError) throw audioError
      // Check for abort — drain any in-flight encode first so the encoder
      // is idle before we cancel the output. Discard encoder errors since
      // we are aborting anyway and must always surface AbortError.
      if (signal?.aborted) {
        if (pendingEncode) {
          try {
            await pendingEncode
          } catch {
            /* discarded — aborting */
          }
        }
        await output.cancel()
        throw new DOMException('Render cancelled', 'AbortError')
      }

      // Render frame to canvas first — this overlaps with the previous frame's
      // encode that is still in flight. The previous VideoSample already copied
      // its pixels, so writing to the canvas here cannot corrupt it.
      await frameRenderer.renderFrame(frame)

      // Scale to output resolution if needed
      if (needsScaling) {
        outputCtx.clearRect(0, 0, exportWidth, exportHeight)
        outputCtx.drawImage(renderCanvas, 0, 0, exportWidth, exportHeight)
      }

      // Now wait for the previous encode to finish before capturing a new
      // VideoSample. This ensures at most one encode is in flight and that
      // frames are fed to the encoder in order.
      if (pendingEncode) await pendingEncode

      // Calculate timestamp in seconds
      const timestamp = frame / fps
      const frameDuration = 1 / fps

      // Snapshot canvas pixels into a VideoSample. The constructor copies
      // pixel data immediately — the canvas is free for the next render.
      const sample = new VideoSample(outputCanvas, { timestamp, duration: frameDuration })

      // Kick off encoding in the background. NOT awaited here — it runs
      // concurrently with the next iteration's renderFrame().
      const isKeyFrame = frame === 0
      pendingEncode = (async () => {
        try {
          if (isKeyFrame) {
            await videoSource.add(sample, { keyFrame: true })
          } else {
            await videoSource.add(sample)
          }
        } finally {
          // VideoSampleSource does NOT close samples (unlike CanvasSource).
          // We must close to release the underlying VideoFrame's GPU memory,
          // otherwise the browser throttles after ~8-16 outstanding frames.
          sample.close()
        }
      })()

      // Report progress
      const progress = Math.round((frame / totalFrames) * 100)
      onProgress({
        phase: 'rendering',
        progress,
        currentFrame: frame,
        totalFrames,
        message: `Rendering frame ${frame + 1}/${totalFrames}`,
      })
    }

    // Drain the final in-flight encode before finalizing
    if (pendingEncode) await pendingEncode

    if (audioTask) {
      onProgress({
        phase: 'encoding',
        progress: 94,
        currentFrame: totalFrames,
        totalFrames,
        message: 'Finishing audio...',
      })
      await audioTask
    }

    onProgress({
      phase: 'finalizing',
      progress: 95,
      currentFrame: totalFrames,
      totalFrames,
      message: 'Finalizing video...',
    })

    // Finalize output
    await output.finalize()

    const completed = await outputTarget.complete()
    const { blob } = completed

    onProgress({
      phase: 'finalizing',
      progress: 100,
      currentFrame: totalFrames,
      totalFrames,
      message: 'Complete!',
    })

    // Cleanup
    frameRenderer.dispose()
    canvasAudio.clearAudioDecodeCache()

    return {
      blob,
      mimeType,
      duration: durationSeconds,
      fileSize: blob.size,
      temporaryOutput: completed.temporaryOutput,
    }
  } catch (error) {
    // Cleanup on error
    frameRenderer?.dispose()
    canvasAudio.clearAudioDecodeCache()

    // Attempt to cancel the output on error
    try {
      if (output.state === 'started') {
        await output.cancel()
      }
    } catch {
      // Ignore cancel errors
    }
    if (audioTask) await Promise.allSettled([audioTask])
    await outputTarget.discard()
    throw error
  }
}

// ---------------------------------------------------------------------------
// renderSingleFrame
// ---------------------------------------------------------------------------

/**
 * Render a single frame from a composition to a Blob.
 * Reuses the same createCompositionRenderer as full export for consistency.
 * Includes all layers: video, images, text, shapes, effects, transitions.
 */
export async function renderSingleFrame(options: SingleFrameOptions): Promise<Blob> {
  const {
    composition,
    frame,
    width = 320,
    height = 180,
    quality = 0.85,
    format = 'image/jpeg',
  } = options

  const compositionWidth = composition.width || DEFAULT_PROJECT_WIDTH
  const compositionHeight = composition.height || DEFAULT_PROJECT_HEIGHT

  getLog().debug('Rendering single frame', {
    frame,
    width,
    height,
    compositionWidth,
    compositionHeight,
  })

  // Create canvas at full composition size
  const renderCanvas = new OffscreenCanvas(compositionWidth, compositionHeight)
  const renderCtx = renderCanvas.getContext('2d')
  if (!renderCtx) {
    throw new Error('Failed to get 2d context')
  }

  // Use the SAME renderer as export – single source of truth
  const renderer = await createCompositionRenderer(composition, renderCanvas, renderCtx)
  try {
    await renderer.preload()
    await renderer.renderFrame(frame)

    // Progressive downscale to thumbnail size to avoid aliasing/moire
    // with high-frequency effects (e.g. halftone fine lines).
    // Halve dimensions repeatedly until within 2x of target, then final scale.
    let srcCanvas: OffscreenCanvas = renderCanvas
    let srcW = compositionWidth
    let srcH = compositionHeight

    while (srcW > width * 2 || srcH > height * 2) {
      const nextW = Math.max(Math.ceil(srcW / 2), width)
      const nextH = Math.max(Math.ceil(srcH / 2), height)
      const step = new OffscreenCanvas(nextW, nextH)
      const stepCtx = step.getContext('2d')!
      stepCtx.imageSmoothingQuality = 'high'
      stepCtx.drawImage(srcCanvas, 0, 0, nextW, nextH)
      srcCanvas = step
      srcW = nextW
      srcH = nextH
    }

    const thumbnailCanvas = new OffscreenCanvas(width, height)
    const thumbnailCtx = thumbnailCanvas.getContext('2d')
    if (!thumbnailCtx) {
      throw new Error('Failed to get thumbnail 2d context')
    }

    thumbnailCtx.imageSmoothingQuality = 'high'
    thumbnailCtx.drawImage(srcCanvas, 0, 0, width, height)

    const blob = await thumbnailCanvas.convertToBlob({ type: format, quality })
    return blob
  } finally {
    try {
      renderer.dispose()
    } catch (error) {
      getLog().warn('Failed to dispose single-frame renderer', { error })
    }
  }
}

// ---------------------------------------------------------------------------
// renderAudioOnly
// ---------------------------------------------------------------------------

/**
 * Render audio-only export (no video frames).
 * Extracts and mixes all audio from the composition and encodes to the specified format.
 */
export async function renderAudioOnly(options: AudioRenderOptions): Promise<ClientRenderResult> {
  const { settings, composition, onProgress, signal } = options
  const { fps, durationInFrames = 0 } = composition
  const canvasAudio = await loadCanvasAudio()

  getLog().info('Starting audio-only render', {
    fps,
    durationInFrames,
    durationSeconds: durationInFrames / fps,
    container: settings.container,
    audioCodec: settings.audioCodec,
    audioBitrate: settings.audioBitrate,
  })

  // Validate inputs
  if (durationInFrames <= 0) {
    throw new Error('Composition has no duration')
  }

  const durationSeconds = durationInFrames / fps

  onProgress({
    phase: 'preparing',
    progress: 0,
    totalFrames: durationInFrames,
    message: 'Loading encoder...',
  })

  // Check for abort
  if (signal?.aborted) {
    throw new DOMException('Render cancelled', 'AbortError')
  }

  // Dynamically import mediabunny (AC-3 decoder is loaded lazily by canvas-audio when needed)
  const mediabunny = await import('mediabunny')
  const { Output, AudioSampleSource, AudioSample } = mediabunny

  await registerMp3EncoderIfNeeded(settings.container)

  onProgress({
    phase: 'preparing',
    progress: 10,
    totalFrames: durationInFrames,
    message: 'Processing audio...',
  })

  // Process audio
  if (!(await canvasAudio.hasAudioContent(composition))) {
    throw new Error('No audio content found in composition')
  }

  const useWindowedAudio =
    durationSeconds >= 5 * 60 && canvasAudio.supportsWindowedAudioProcessing(composition)

  onProgress({
    phase: 'preparing',
    progress: 50,
    totalFrames: durationInFrames,
    message: 'Creating encoder...',
  })

  const audioCodec = getAudioOnlyCodec(settings.container)
  const audioBitrate = settings.audioBitrate ?? 192_000
  await assertAudioOnlyEncoderSupported(audioCodec, audioBitrate)

  const mimeType = getMimeType(settings.container)
  const outputTarget = await createExportOutputTarget(mediabunny, settings.container, mimeType)
  const format = await createOutputFormat(settings.container, {
    fastStart: outputTarget.kind === 'buffer',
  })
  const output = new Output({ format, target: outputTarget.target })

  // Create audio source for encoding
  const audioSource = new AudioSampleSource({
    codec: audioCodec,
    bitrate: audioBitrate,
  })

  // Add audio track to output
  output.addAudioTrack(audioSource)

  getLog().info('Audio track configured', {
    duration: durationSeconds,
    channels: 2,
    sampleRate: 48_000,
    codec: audioCodec,
    windowed: useWindowedAudio,
  })

  onProgress({
    phase: 'encoding',
    progress: 60,
    totalFrames: durationInFrames,
    message: 'Encoding audio...',
  })

  let completed: Awaited<ReturnType<typeof outputTarget.complete>>
  try {
    await output.start()
    await addCompositionAudio({
      audioSource,
      AudioSample,
      canvasAudio,
      composition,
      useWindowedAudio,
      signal,
      onProgress: (frames) => {
        onProgress({
          phase: 'encoding',
          progress: 60 + Math.round((frames / 48_000 / durationSeconds) * 30),
          totalFrames: durationInFrames,
          message: `Encoding audio ${formatClock(frames / 48_000)} / ${formatClock(durationSeconds)}`,
        })
      },
    })

    onProgress({
      phase: 'finalizing',
      progress: 90,
      totalFrames: durationInFrames,
      message: 'Finalizing audio...',
    })

    audioSource.close()
    await output.finalize()
    completed = await outputTarget.complete()
  } catch (error) {
    try {
      if (output.state === 'started') await output.cancel()
    } catch {
      // Ignore cancellation errors; preserve the original failure.
    }
    await outputTarget.discard()
    throw error
  }

  const { blob } = completed

  onProgress({
    phase: 'finalizing',
    progress: 100,
    totalFrames: durationInFrames,
    message: 'Complete!',
  })

  return {
    blob,
    mimeType,
    duration: durationSeconds,
    fileSize: blob.size,
    temporaryOutput: completed.temporaryOutput,
  }
}
