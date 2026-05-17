export const ALLOWED_IMPORT_EXTENSIONS: ReadonlyArray<string>;

export const IMPORT_REJECTION_MESSAGE: string;

export function isImportableMimeType(mime: unknown): boolean;

export function mimeForExtension(extOrPath: unknown): string | null;
