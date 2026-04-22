/**
 * Resolve a potentially-relative asset filePath to an absolute path using the
 * project file's directory as the base. Returns the original path unchanged if
 * it is already absolute or if no projectFilePath is available.
 */
export function resolveProjectMediaPath(
  filePath: string | null | undefined,
  projectFilePath?: string | null,
): string | null {
  if (!filePath) return null;
  if (filePath.startsWith('/')) return filePath;

  const normalizedProjectPath = projectFilePath?.replace(/\\/g, '/');
  const projectDir =
    normalizedProjectPath?.slice(0, normalizedProjectPath.lastIndexOf('/')) ?? null;

  if (!projectDir) return filePath;

  return new URL(filePath, `file://${projectDir}/`).pathname;
}

export function inferCursorEventsPath(
  recordingFilePath: string | null | undefined,
  cursorEventsPath: string | null | undefined,
  projectFilePath?: string | null,
): string | null {
  const resolvedCursorPath = resolveProjectMediaPath(cursorEventsPath, projectFilePath);
  if (resolvedCursorPath) return resolvedCursorPath;

  const resolvedRecordingPath = resolveProjectMediaPath(recordingFilePath, projectFilePath);
  if (!resolvedRecordingPath) return null;
  return resolvedRecordingPath.replace(/\.(webm|mp4)$/i, '.cursor.ndjson');
}
