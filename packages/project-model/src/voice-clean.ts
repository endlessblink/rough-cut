import type { ProjectDocument } from './types.js';

/** The project's Clean voice Amount (0..1); 0 when unset or invalid. */
export function getVoiceCleanAmount(
  settings: { readonly voiceClean?: { readonly amount?: unknown } } | null | undefined,
): number {
  const amount = Number(settings?.voiceClean?.amount);
  return Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0;
}

/** Returns a new document with the Amount set (rounded to 1%). */
export function withVoiceCleanAmount<T extends Pick<ProjectDocument, 'settings'>>(document: T, amount: number): T {
  const value = Math.round(getVoiceCleanAmount({ voiceClean: { amount } }) * 100) / 100;
  return { ...document, settings: { ...document.settings, voiceClean: { amount: value } } };
}
