export function appError(source, err, fallback = 'Something failed.') {
  return { source, message: err instanceof Error ? err.message : typeof err === 'string' && err.trim() ? err : fallback };
}

export function errorStateCopy(error) {
  const message = error.message.trim() || 'No detailed error was provided.';
  const normalized = message.toLowerCase();
  if (normalized.includes('no space') || normalized.includes('enospc') || normalized.includes('disk')) {
    return { label: 'Disk needs attention', title: 'Not enough space to finish', detail: `${message} Free space in the recording or export folder, then retry.` };
  }
  if (normalized.includes('permission') || normalized.includes('eacces') || normalized.includes('denied')) {
    return { label: 'Permission blocked', title: 'Rough Cut cannot access that location', detail: `${message} Pick a writable folder or update permissions, then retry.` };
  }
  if (normalized.includes('ffmpeg') || normalized.includes('exited') || normalized.includes('spawn')) {
    return { label: 'Media pipeline failed', title: 'FFmpeg stopped unexpectedly', detail: `${message} Open diagnostics for the command log before retrying.` };
  }
  if (error.source === 'export') {
    return { label: 'Export needs attention', title: 'Export did not finish', detail: `${message} Check the output path and diagnostics, then retry the export.` };
  }
  if (error.source === 'recording') {
    return { label: 'Recording needs attention', title: 'Recording could not continue', detail: `${message} Check capture sources and diagnostics, then retry.` };
  }
  return { label: 'Needs attention', title: 'Action failed', detail: message };
}
