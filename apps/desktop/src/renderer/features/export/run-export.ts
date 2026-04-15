import type { ProjectDocument } from '@rough-cut/project-model';
import {
  canUseWebCodecsExport,
  runWebCodecsExportToBuffer,
  type ExportProgress,
  type ExportResult,
} from '../../../../../../packages/export-renderer/src/webcodecs.js';

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function runDesktopExport(project: ProjectDocument): Promise<ExportResult | null> {
  const settings = project.exportSettings;
  const outputPath = await window.roughcut.exportPickOutputPath(project.name, settings.format);
  if (!outputPath) {
    return null;
  }

  if (!canUseWebCodecsExport(settings)) {
    return window.roughcut.exportStart(project, settings, outputPath);
  }

  try {
    const { buffer, result } = await runWebCodecsExportToBuffer(project, settings, {
      onProgress: (progress: ExportProgress) => window.roughcut.exportEmitProgress(progress),
    });

    if (result.status !== 'complete') {
      window.roughcut.exportEmitComplete(result);
      return result;
    }

    await window.roughcut.writeBinaryFile(outputPath, toArrayBuffer(buffer));
    const completeResult: ExportResult = { ...result, outputPath };
    window.roughcut.exportEmitComplete(completeResult);
    return completeResult;
  } catch (err) {
    const failedResult: ExportResult = {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
      totalFrames: project.composition.duration,
      durationMs: 0,
      pipeline: 'webcodecs',
    };
    window.roughcut.exportEmitComplete(failedResult);
    return failedResult;
  }
}
