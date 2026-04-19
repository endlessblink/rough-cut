import type { ProjectDocument } from '@rough-cut/project-model';
import {
  canUseWebCodecsExport,
  runWebCodecsExportToBuffer,
  type ExportProgress,
  type ExportResult,
} from '../../../../../../packages/export-renderer/src/webcodecs.js';

declare global {
  interface Window {
    __roughcutTestOverrides?: {
      exportOutputPath?: string;
    };
  }
}

let activeExportAbortController: AbortController | null = null;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export interface ExportFrameRange {
  startFrame: number;
  endFrame: number;
}

export async function pickDesktopExportOutputPath(
  project: ProjectDocument,
): Promise<string | null> {
  const settings = project.exportSettings;
  return (
    window.__roughcutTestOverrides?.exportOutputPath ??
    (await window.roughcut.exportPickOutputPath(project.name, settings.format))
  );
}

export async function cancelDesktopExport(): Promise<void> {
  activeExportAbortController?.abort();
  activeExportAbortController = null;
  await window.roughcut.exportCancel();
}

export async function runDesktopExport(
  project: ProjectDocument,
  range?: ExportFrameRange,
  outputPathOverride?: string,
): Promise<ExportResult | null> {
  const settings = project.exportSettings;
  const effectiveRange = range ?? { startFrame: 0, endFrame: project.composition.duration };
  const selectedFrameCount = Math.max(0, effectiveRange.endFrame - effectiveRange.startFrame);
  if (project.composition.duration <= 0 || selectedFrameCount <= 0) {
    const failedResult: ExportResult = {
      status: 'failed',
      error:
        project.composition.duration <= 0
          ? 'Nothing to export yet. Add a clip to the timeline first.'
          : 'Select a non-empty export range.',
      totalFrames: 0,
      durationMs: 0,
    };
    window.roughcut.exportEmitComplete(failedResult);
    return failedResult;
  }

  const outputPath = outputPathOverride ?? (await pickDesktopExportOutputPath(project));
  if (!outputPath) {
    return null;
  }

  activeExportAbortController?.abort();
  const abortController = new AbortController();
  activeExportAbortController = abortController;

  try {
    if (abortController.signal.aborted) {
      return {
        status: 'cancelled',
        totalFrames: project.composition.duration,
        durationMs: 0,
      };
    }

    if (!canUseWebCodecsExport(settings)) {
      return await window.roughcut.exportStart(project, settings, outputPath);
    }

    const { buffer, result } = await runWebCodecsExportToBuffer(project, settings, {
      onProgress: (progress: ExportProgress) => window.roughcut.exportEmitProgress(progress),
    });

    if (result.status !== 'complete') {
      window.roughcut.exportEmitComplete(result);
      return result;
    }

    const tempVideoPath = outputPath.replace(/\.mp4$/i, '.video-only.mp4');
    await window.roughcut.writeBinaryFile(tempVideoPath, toArrayBuffer(buffer));
    const finalized = await window.roughcut.exportFinalizeMedia(project, tempVideoPath, outputPath);
    const completeResult: ExportResult = {
      ...result,
      outputPath,
      audioIncluded: finalized.audioIncluded,
    };
    window.roughcut.exportEmitComplete(completeResult);
    return completeResult;
  } catch (err) {
    const failedResult: ExportResult = {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
      totalFrames: project.composition.duration,
      durationMs: 0,
    };
    window.roughcut.exportEmitComplete(failedResult);
    return failedResult;
  }
}
