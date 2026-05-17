// P-AI-C/TASK-167 — accepted-import whitelist for the Library "Import file"
// flow. Shared between the main process (used to build the dialog filter and
// to map picked filenames back to a canonical mime) and the renderer (used to
// guard against types that slip through if the user switches the OS dialog
// to "All files").

export const ALLOWED_IMPORT_EXTENSIONS = Object.freeze([
  'mp4',
  'mov',
  'mp3',
  'wav',
  'png',
  'jpg',
  'jpeg',
]);

const EXT_TO_MIME = Object.freeze({
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
});

// Canonical mimes plus the common aliases real OSes hand us back.
const ALLOWED_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'image/png',
  'image/jpeg',
]);

export function isImportableMimeType(mime) {
  if (typeof mime !== 'string') return false;
  return ALLOWED_MIMES.has(mime.toLowerCase());
}

export function mimeForExtension(extOrPath) {
  if (typeof extOrPath !== 'string' || extOrPath.length === 0) return null;
  const lastDot = extOrPath.lastIndexOf('.');
  const ext = (lastDot >= 0 ? extOrPath.slice(lastDot + 1) : extOrPath).toLowerCase();
  return EXT_TO_MIME[ext] ?? null;
}

export const IMPORT_REJECTION_MESSAGE =
  'Only mp4 / mov / mp3 / wav / png / jpg are supported. Convert your file first.';
