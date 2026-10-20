// Styled export for agents (the rough-cut MCP's export_styled tool), run by the
// app's own main process without a window, so the result is exactly what the app's
// Export button makes: zooms, camera bubble, Claude graphics, background, cursor.
//
// Options an agent can set without touching the project file:
//  - captions: false leaves burned-in captions out
//  - camera: false leaves the camera bubble out (default: as laid out in the project)
//  - startSec / endSec: keep only that part of the timeline (cut frame-accurately
//    from the finished export, so everything in it looks exactly as in the full one)
// The project is read, never written.

export function prepareAgentExportDocument(document, { captions = true, camera = true } = {}) {
  const next = structuredClone(document);
  if (captions === false) next.captions = { ...(next.captions ?? {}), enabled: false };
  if (camera === false) {
    next.assets = (next.assets ?? []).map((asset) => (asset.type === 'recording'
      ? { ...asset, presentation: { ...(asset.presentation ?? {}), camera: { ...(asset.presentation?.camera ?? {}), visible: false } } }
      : asset));
  }
  return next;
}

/** Validated job: absolute .roughcut in, .mp4 out, an optional positive range. */
export function normalizeAgentExportJob(job) {
  const projectPath = String(job?.projectPath ?? '');
  const outPath = String(job?.outPath ?? '');
  if (!projectPath.endsWith('.roughcut')) throw new Error('projectPath must be a .roughcut file');
  if (!outPath.toLowerCase().endsWith('.mp4')) throw new Error('outPath must end in .mp4');
  if (outPath === projectPath) throw new Error('outPath must not be the project');
  const startSec = job?.startSec === undefined || job?.startSec === null ? null : Number(job.startSec);
  const endSec = job?.endSec === undefined || job?.endSec === null ? null : Number(job.endSec);
  if (startSec !== null && (!Number.isFinite(startSec) || startSec < 0)) throw new Error('startSec must be 0 or more');
  if (endSec !== null && (!Number.isFinite(endSec) || endSec <= (startSec ?? 0))) throw new Error('endSec must be after startSec');
  return {
    projectPath,
    outPath,
    captions: job?.captions !== false,
    camera: job?.camera !== false,
    startSec,
    endSec,
  };
}

/** ffmpeg arguments that keep [startSec, endSec) of a finished export, re-encoded so the cut is frame-accurate. */
export function buildRangeCutArgs(inputPath, outputPath, { startSec = null, endSec = null } = {}) {
  const args = ['-y', '-v', 'error'];
  if (startSec !== null) args.push('-ss', String(startSec));
  args.push('-i', inputPath);
  if (endSec !== null) args.push('-t', String(endSec - (startSec ?? 0)));
  args.push('-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-threads', '4', outputPath);
  return args;
}

export async function runAgentExportJob(rawJob, { openProjectFile, exportProjectToMp4, runCappedFfmpeg, rm, onProgress = () => undefined }) {
  const job = normalizeAgentExportJob(rawJob);
  const opened = await openProjectFile(job.projectPath);
  const project = prepareAgentExportDocument(opened.document, job);
  const ranged = job.startSec !== null || job.endSec !== null;
  const fullPath = ranged ? job.outPath.replace(/\.mp4$/i, '.full-export.mp4') : job.outPath;
  const result = await exportProjectToMp4({ project, outputPath: fullPath, mode: 'styled', onProgress });
  if (result?.cancelled) throw new Error('Export was cancelled');
  if (ranged) {
    const cut = await runCappedFfmpeg(buildRangeCutArgs(fullPath, job.outPath, job));
    await rm(fullPath, { force: true });
    if (cut.code !== 0) throw new Error(`Cutting the range failed: ${String(cut.stderr ?? '').slice(-400)}`);
  }
  return { ...job, outPath: job.outPath };
}
