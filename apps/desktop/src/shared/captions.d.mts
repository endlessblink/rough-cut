export interface CaptionCue { id: string; startFrame: number; endFrame: number; text: string }
export interface CaptionSettings { enabled: boolean; position: 'bottom' | 'center' | 'top'; sizePct: number; textColor: string; boxOpacity: number }
export const CAPTION_POSITIONS: readonly string[];
export const CAPTION_EDGE_MARGIN: number;
export const CAPTION_LANGUAGES: readonly { code: string; label: string }[];
export const DEFAULT_CAPTION_SETTINGS: CaptionSettings;
export function buildCaptionCues(words: unknown, options?: { fps?: number }): CaptionCue[];
export interface CaptionTrackInfo { id: string; label: string; language: string | null }
export const ORIGINAL_CAPTION_TRACK: 'original';
export function getCaptions(document: unknown): { settings: CaptionSettings; cues: CaptionCue[]; tracks: CaptionTrackInfo[]; activeTrack: string };
export function listCaptionTracks(document: unknown): CaptionTrackInfo[];
export function getOriginalCaptionCues(document: unknown): CaptionCue[];
export function addCaptionTrack<T>(document: T, track: { id: string; label: string; language?: string | null; cues: CaptionCue[] }): T;
export function withTranscribedSpeech<T>(document: T, words: Array<{ word: string; startFrame: number; endFrame: number }>, options?: { fps?: number; language?: string | null }): T;
export function setActiveCaptionTrack<T>(document: T, id: string): T;
export function withCaptionSettings<T>(document: T, patch: Partial<CaptionSettings>): T;
export function withCaptionEdit<T>(document: T, cueId: string, text: string): T;
export function updateCaption<T>(document: T, cueId: string, patch: { startFrame?: number; endFrame?: number; text?: string }): T;
export function addCaption<T>(document: T, atFrame: number, options?: { lengthFrames?: number; text?: string }): { document: T; id: string } | null;
export function removeCaption<T>(document: T, cueId: string): T;
export function splitCaption<T>(document: T, cueId: string, atFrame: number): { document: T; ids: [string, string] } | null;
export function captionTextDirection(text: string): 'rtl' | 'ltr';
export function captionAtSourceFrame(cues: CaptionCue[], frame: number): CaptionCue | null;
export function buildCaptionsAss(cues: CaptionCue[], options: { width: number; height: number; fps?: number; settings?: CaptionSettings }): string;
