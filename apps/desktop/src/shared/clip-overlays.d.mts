import type { Asset, ZoomMarker } from '@rough-cut/project-model';

type AnyDocument = unknown;

export interface ClipSection {
  clipId: string;
  timelineIn: number;
  timelineOut: number;
  sourceIn: number;
  sourceOut: number;
}

export interface ClipCaptionCue {
  id: string;
  startFrame: number;
  endFrame: number;
  text: string;
}

export const CLIP_ZOOMS_KEY: 'clipZooms';
export const CLIP_CAPTIONS_KEY: 'clipCaptions';
export function isAddedPictureAsset(asset: unknown): boolean;
export function clipScreenSections(document: AnyDocument, assetId: string): ClipSection[];
export function addedClipAtFrame(document: AnyDocument, timelineFrame: number): { assetId: string; asset: Asset; section: ClipSection; sourceFrame: number } | null;
export function clipZooms(document: AnyDocument, assetId: string): ZoomMarker[];
export function withClipZooms<T>(document: T, assetId: string, markers: readonly ZoomMarker[]): T;
export function listClipZooms(document: AnyDocument): Array<{ assetId: string; marker: ZoomMarker }>;
export function clipZoomOwner(document: AnyDocument, markerId: string): string | null;
export function clipCaptions(document: AnyDocument, assetId: string): ClipCaptionCue[];
export function withClipCaptions<T>(document: T, assetId: string, cues: readonly ClipCaptionCue[]): T;
export function clipCaptionView(document: AnyDocument, assetId: string): { captions: Record<string, unknown> & { cues: ClipCaptionCue[] } };
export function clipCaptionId(assetId: string, id: string): string;
export function commitClipCaptionView<T>(document: T, assetId: string, view: unknown): T;
export function clipZoomCropAt(markers: readonly ZoomMarker[], sourceFrame: number, sourceWidth: number, sourceHeight: number): { x: number; y: number; w: number; h: number };
export function clipRangeOnTimeline(sections: readonly ClipSection[], startFrame: number, endFrame: number): Array<{ startFrame: number; endFrame: number }>;
export function clipOverlaysOnTimeline(document: AnyDocument): { zooms: ZoomMarker[]; captions: ClipCaptionCue[] };
