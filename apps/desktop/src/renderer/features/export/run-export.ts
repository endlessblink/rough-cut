import type { ProjectDocument } from '@rough-cut/project-model';
import type { ExportResult } from '@rough-cut/export-renderer';

declare global {
  interface Window {
    __roughcutTestOverrides?: {
      exportOutputPath?: string;
    };
  }
}

let activeExportAbortController: AbortController | null = null;

export interface ExportFrameRange {
  startFrame: number;
  endFrame: number;
}

export async function cancelDesktopExport(): Promise<void> {
  activeExportAbortController?.abort();
  activeExportAbortController = null;
  await window.roughcut.exportCancel();
}

export async function runDesktopExport(
  project: ProjectDocument,
  range?: ExportFrameRange,
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

  const outputPath =
    window.__roughcutTestOverrides?.exportOutputPath ??
    (await window.roughcut.exportPickOutputPath(project.name, settings.format));
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
    return await window.roughcut.exportStart(project, settings, outputPath);
  } catch (err) {
    const failedResult: ExportResult = {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
      totalFrames: project.composition.duration,
      durationMs: 0,
    };
    window.roughcut.exportEmitComplete(failedResult);
    return failedResult;
  } finally {
    if (activeExportAbortController === abortController) {
      activeExportAbortController = null;
    }
  }
}
