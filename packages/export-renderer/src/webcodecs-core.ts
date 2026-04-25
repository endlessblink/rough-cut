import type { ProjectDocument, ExportSettings } from '@rough-cut/project-model';
import { resolveFrame } from '@rough-cut/frame-resolver';
import { Output, Mp4OutputFormat, BufferTarget, CanvasSource } from 'mediabunny';
import { addAudioTracksToOutput } from './audio-export.js';
import { loadCursorFrameData, type CursorFrameData } from './cursor-render.js';
import { renderFrameToCanvasAccurate } from './render-frame-core.js';
import type { ExportEventHandlers, ExportProgress, ExportResult } from './types.js';
import { resolveVideoEncodingConfig, supportsWebCodecsExport } from './video-encoding-config.js';
import { MediaBunnyFrameSource } from './media-bunny-frame-source.js';

export interface WebCodecsExportBufferResult {
  buffer: Uint8Array;
  result: ExportResult;
}

export function canUseWebCodecsExport(settings: ExportSettings): boolean {
  if (!supportsWebCodecsExport(settings)) {
    return false;
  }

  return typeof OffscreenCanvas !== 'undefined' && typeof VideoEncoder !== 'undefined';
}

function getCursorPosition(
  cursorDataByAssetId: ReadonlyMap<string, CursorFrameData>,
  assetId: string,
  sourceFrame: number,
): { x: number; y: number } | null {
  const data = cursorDataByAssetId.get(assetId);
  if (!data) return null;
  const frame = Math.max(0, Math.min(sourceFrame, data.frameCount - 1));
  const idx = frame * 3;
  if (idx + 1 >= data.frames.length) return null;
  const x = data.frames[idx] ?? -1;
  const y = data.frames[idx + 1] ?? -1;
  if (x < 0 || y < 0) return null;
  return { x, y };
}

export async function runWebCodecsExportToBuffer(
  project: ProjectDocument,
  settings: ExportSettings,
  handlers?: ExportEventHandlers,
): Promise<WebCodecsExportBufferResult> {
  const totalFrames = project.composition.duration;
  const startTime = performance.now();
  const canvas = new OffscreenCanvas(settings.resolution.width, settings.resolution.height);
  const ctx = canvas.getContext('2d');

  if (ctx === null) {
    throw new Error('OffscreenCanvas 2D context is unavailable');
  }

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target,
  });
  const disposeAudio = await addAudioTracksToOutput(project, output, settings.frameRate);

  const { config, hardwareAcceleration } = await resolveVideoEncodingConfig(settings);
  const videoSource = new CanvasSource(canvas, config);
  output.addVideoTrack(videoSource, { frameRate: settings.frameRate });
  const frameSources = new Map<string, MediaBunnyFrameSource>();
  const cursorDataByAssetId = new Map<string, CursorFrameData>();

  for (const asset of project.assets) {
    const rawCursorEventsPath = asset.metadata?.['cursorEventsPath'];
    const cursorEventsPath =
      typeof rawCursorEventsPath === 'string' ? rawCursorEventsPath : undefined;
    const sourceWidth = asset.metadata?.['width'];
    const sourceHeight = asset.metadata?.['height'];
    if (
      typeof sourceWidth !== 'number' ||
      typeof sourceHeight !== 'number' ||
      asset.duration <= 0 ||
      !asset.filePath
    ) {
      continue;
    }

    const eventsFps =
      typeof asset.metadata?.['cursorEventsFps'] === 'number'
        ? (asset.metadata['cursorEventsFps'] as number)
        : 60; // Legacy takes (no field) sampled at TARGET_CAPTURE_FPS = 60.
    const projectFps = project.settings.frameRate;
    const cursorData = await loadCursorFrameData(
      cursorEventsPath,
      asset.duration,
      sourceWidth,
      sourceHeight,
      asset.filePath,
      eventsFps,
      projectFps,
    );
    if (cursorData) {
      cursorDataByAssetId.set(asset.id, cursorData);
    }
  }

  const resolveVideoFrame = async (
    assetId: string,
    timestampSeconds: number,
  ): Promise<VideoFrame | null> => {
    const asset = project.assets.find((entry) => entry.id === assetId);
    if (!asset?.filePath) return null;
    if (asset.type !== 'recording' && asset.type !== 'video') return null;

    let source = frameSources.get(asset.id);
    if (!source) {
      source = new MediaBunnyFrameSource(asset.filePath);
      frameSources.set(asset.id, source);
    }

    return source.getFrame(timestampSeconds);
  };

  try {
    await output.start();

    for (let frame = 0; frame < totalFrames; frame++) {
      const renderFrame = resolveFrame(project, frame, {
        getCursorPosition: (assetId, sourceFrame) =>
          getCursorPosition(cursorDataByAssetId, assetId, sourceFrame),
      });
      await renderFrameToCanvasAccurate(
        canvas,
        ctx,
        renderFrame,
        settings.frameRate,
        (layer, context) => resolveVideoFrame(layer.assetId, context.timestampSeconds),
        cursorDataByAssetId,
      );
      await videoSource.add(frame / settings.frameRate, 1 / settings.frameRate);

      const progress: ExportProgress = {
        currentFrame: frame + 1,
        totalFrames,
        percentage: ((frame + 1) / totalFrames) * 100,
        elapsedMs: performance.now() - startTime,
      };
      handlers?.onProgress?.(progress);
    }

    await output.finalize();
    const result: ExportResult = {
      status: 'complete',
      totalFrames,
      durationMs: performance.now() - startTime,
      pipeline: 'webcodecs',
      hardwareAcceleration,
    };
    handlers?.onComplete?.(result);
    if (target.buffer === null) {
      throw new Error('WebCodecs export completed without output buffer');
    }
    return { buffer: new Uint8Array(target.buffer), result };
  } catch (err) {
    await output.cancel().catch(() => {});
    const error = err instanceof Error ? err : new Error(String(err));
    handlers?.onError?.(error);
    return {
      buffer: new Uint8Array(),
      result: {
        status: 'failed',
        error: error.message,
        totalFrames,
        durationMs: performance.now() - startTime,
        pipeline: 'webcodecs',
        hardwareAcceleration,
      },
    };
  } finally {
    disposeAudio?.();
    for (const source of frameSources.values()) {
      source.dispose();
    }
  }
}
