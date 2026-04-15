import type { ProjectDocument, ExportSettings } from '@rough-cut/project-model';
import { resolveFrame } from '@rough-cut/frame-resolver';
import { registerBuiltinEffects, getEffect } from '@rough-cut/effect-registry';
import { createRenderCanvas, renderFrameToBuffer } from './frame-renderer.js';
import { createFFmpegWriter } from './ffmpeg-writer.js';
import type { ExportResult, ExportProgress, ExportEventHandlers } from './types.js';
import { canUseWebCodecsExport, runWebCodecsExport } from './webcodecs-export.js';

/**
 * Ensure builtin effects are registered exactly once.
 * The registry throws if you try to register the same type twice.
 */
function ensureEffectsRegistered(): void {
  if (getEffect('gaussian-blur') === undefined) {
    registerBuiltinEffects();
  }
}

/**
 * Run a full export: project → frames → FFmpeg → MP4.
 */
export async function runExport(
  project: ProjectDocument,
  settings: ExportSettings,
  outputPath: string,
  handlers?: ExportEventHandlers,
): Promise<ExportResult> {
  // Ensure effects are registered (idempotent)
  ensureEffectsRegistered();

  const totalFrames = project.composition.duration;
  if (totalFrames === 0) {
    return { status: 'failed', error: 'Empty composition', totalFrames: 0, durationMs: 0 };
  }

  if (canUseWebCodecsExport(settings)) {
    return runWebCodecsExport(project, settings, outputPath, handlers);
  }

  const canvas = createRenderCanvas(settings.resolution.width, settings.resolution.height);
  const ctx = canvas.getContext('2d');
  const writer = createFFmpegWriter(outputPath, settings);
  const startTime = performance.now();

  try {
    for (let frame = 0; frame < totalFrames; frame++) {
      // 1. Resolve what to render
      const renderFrame = resolveFrame(project, frame);

      // 2. Render to canvas buffer
      const buffer = renderFrameToBuffer(canvas, ctx, renderFrame);

      // 3. Write to FFmpeg
      await writer.writeFrame(buffer);

      // 4. Report progress
      const progress: ExportProgress = {
        currentFrame: frame + 1,
        totalFrames,
        percentage: ((frame + 1) / totalFrames) * 100,
        elapsedMs: performance.now() - startTime,
      };
      handlers?.onProgress?.(progress);
    }

    await writer.finalize();
    const durationMs = performance.now() - startTime;

    const result: ExportResult = {
      status: 'complete',
      outputPath,
      totalFrames,
      durationMs,
      pipeline: 'ffmpeg',
    };
    handlers?.onComplete?.(result);
    return result;
  } catch (err) {
    writer.abort();
    const error = err instanceof Error ? err : new Error(String(err));
    handlers?.onError?.(error);
    return {
      status: 'failed',
      error: error.message,
      totalFrames,
      durationMs: performance.now() - startTime,
      pipeline: 'ffmpeg',
    };
  }
}
