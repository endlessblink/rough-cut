export function buildMediaUrl(
  filePath: string | null | undefined,
  projectFilePath?: string | null,
) {
  if (!filePath) return null;

  const isAbsolutePath = filePath.startsWith('/');
  const normalizedProjectPath = projectFilePath?.replace(/\\/g, '/');
  const projectDir =
    normalizedProjectPath?.slice(0, normalizedProjectPath.lastIndexOf('/')) ?? null;
  const resolvedPath =
    !isAbsolutePath && projectDir ? new URL(filePath, `file://${projectDir}/`).pathname : filePath;

  return `media://${resolvedPath}`;
}
