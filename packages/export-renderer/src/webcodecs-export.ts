import type { ProjectDocument, ExportSettings } from '@rough-cut/project-model';
import { resolveFrame } from '@rough-cut/frame-resolver';
import { Output, Mp4OutputFormat, FilePathTarget, CanvasSource } from 'mediabunny';
import { renderFrameToCanvasAccurate } from './frame-renderer.js';
import type { ExportEventHandlers, ExportProgress, ExportResult } from './types.js';
import { resolveVideoEncodingConfig, supportsWebCodecsExport } from './video-encoding-config.js';
import { MediaBunnyFrameSource } from './media-bunny-frame-source.js';

export function canUseWebCodecsExport(settings: ExportSettings): boolean {
  if (!supportsWebCodecsExport(settings)) {
    return false;
  }

  return typeof OffscreenCanvas !== 'undefined' && typeof VideoEncoder !== 'undefined';
}

export async function runWebCodecsExport(
  project: ProjectDocument,
  settings: ExportSettings,
  outputPath: string,
  handlers?: ExportEventHandlers,
): Promise<ExportResult> {
  const totalFrames = project.composition.duration;
  const startTime = performance.now();
  const canvas = new OffscreenCanvas(settings.resolution.width, settings.resolution.height);
  const ctx = canvas.getContext('2d');

  if (ctx === null) {
    throw new Error('OffscreenCanvas 2D context is unavailable');
  }

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new FilePathTarget(outputPath),
  });

  const { config, hardwareAcceleration } = await resolveVideoEncodingConfig(settings);
  const videoSource = new CanvasSource(canvas, config);
  output.addVideoTrack(videoSource, { frameRate: settings.frameRate });
  const frameSources = new Map<string, MediaBunnyFrameSource>();

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
      const renderFrame = resolveFrame(project, frame);
      await renderFrameToCanvasAccurate(
        canvas,
        ctx,
        renderFrame,
        settings.frameRate,
        (layer, context) => resolveVideoFrame(layer.assetId, context.timestampSeconds),
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
      outputPath,
      totalFrames,
      durationMs: performance.now() - startTime,
      pipeline: 'webcodecs',
      hardwareAcceleration,
    };
    handlers?.onComplete?.(result);
    return result;
  } catch (err) {
    await output.cancel().catch(() => {});
    const error = err instanceof Error ? err : new Error(String(err));
    handlers?.onError?.(error);
    return {
      status: 'failed',
      error: error.message,
      totalFrames,
      durationMs: performance.now() - startTime,
      pipeline: 'webcodecs',
      hardwareAcceleration,
    };
  } finally {
    for (const source of frameSources.values()) {
      source.dispose();
    }
  }
}
