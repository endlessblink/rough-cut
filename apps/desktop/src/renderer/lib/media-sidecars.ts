export function inferCursorEventsPath(
  recordingFilePath: string | null | undefined,
  cursorEventsPath: string | null | undefined,
): string | null {
  if (cursorEventsPath) return cursorEventsPath;
  if (!recordingFilePath) return null;
  return recordingFilePath.replace(/\.(webm|mp4)$/i, '.cursor.ndjson');
}
