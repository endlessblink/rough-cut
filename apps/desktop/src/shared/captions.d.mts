export interface CaptionCue { id: string; startFrame: number; endFrame: number; text: string }
export interface CaptionSettings { enabled: boolean; position: 'bottom' | 'center' | 'top'; sizePct: number; textColor: string; boxOpacity: number }
export const CAPTION_POSITIONS: readonly string[];
export const DEFAULT_CAPTION_SETTINGS: CaptionSettings;
export function buildCaptionCues(words: unknown, options?: { fps?: number }): CaptionCue[];
export function getCaptions(document: unknown): { settings: CaptionSettings; cues: CaptionCue[] };
export function withCaptionSettings<T>(document: T, patch: Partial<CaptionSettings>): T;
export function withCaptionEdit<T>(document: T, cueId: string, text: string): T;
export function captionAtSourceFrame(cues: CaptionCue[], frame: number): CaptionCue | null;
export function buildCaptionsAss(cues: CaptionCue[], options: { width: number; height: number; fps?: number; settings?: CaptionSettings }): string;
