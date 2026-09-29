import type { ProjectDocument } from '@rough-cut/project-model';

export type GraphicFieldType = 'text' | 'color' | 'number';

export interface GraphicField {
  readonly key: string;
  readonly label: string;
  readonly type: GraphicFieldType;
  readonly value: string | number;
}

export interface GraphicSpec {
  readonly title: string;
  readonly html: string;
  readonly fields: readonly GraphicField[];
  readonly durationSec: number;
}

export interface TimelineGraphic {
  readonly id: string;
  readonly effectId: string;
  readonly title: string;
  readonly html: string;
  readonly fields: readonly GraphicField[];
  readonly request: string;
  readonly animate: boolean;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly enabled: boolean;
}

export const GRAPHIC_EFFECT_KIND: 'graphic';
export const GRAPHIC_OWNER_ID: 'timeline';
export const MAX_GRAPHIC_HTML_BYTES: number;
export const MAX_GRAPHIC_FIELDS: number;
export const MIN_GRAPHIC_FRAMES: number;

export function validateGraphicSpec(spec: unknown):
  | { readonly ok: true; readonly graphic: GraphicSpec }
  | { readonly ok: false; readonly errors: readonly string[] };

export function buildGraphicDocument(options: {
  readonly html: string;
  readonly fields?: readonly GraphicField[];
  readonly width?: number;
  readonly height?: number;
  readonly animate?: boolean;
  readonly holdSec?: number;
  readonly durationSec?: number;
}): string;

export function listGraphics(document: ProjectDocument): readonly TimelineGraphic[];
export function graphicsAtFrame(document: ProjectDocument, frame: number): readonly TimelineGraphic[];

export function addGraphic(document: ProjectDocument, options: {
  readonly id: string;
  readonly title?: string;
  readonly html: string;
  readonly fields?: readonly GraphicField[];
  readonly request?: string;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly timelineFrames?: number;
}): ProjectDocument;

export function moveGraphic(document: ProjectDocument, id: string, range: {
  readonly startFrame: number;
  readonly endFrame: number;
  readonly timelineFrames?: number;
}): ProjectDocument;

export function updateGraphicFields(document: ProjectDocument, id: string, values: Readonly<Record<string, string | number>>): ProjectDocument;

export function replaceGraphicContent(document: ProjectDocument, id: string, content: {
  readonly title?: string;
  readonly html: string;
  readonly fields?: readonly GraphicField[];
  readonly request?: string;
}): ProjectDocument;

export function removeGraphic(document: ProjectDocument, id: string): ProjectDocument;

export function dragGraphicRange(
  range: { readonly startFrame: number; readonly endFrame: number },
  options: { readonly mode: 'move' | 'start' | 'end'; readonly delta: number; readonly totalFrames: number; readonly minSpan?: number },
): { startFrame: number; endFrame: number };

export const DEFAULT_HOLD_SEC: number;
export function graphicHoldSec(durationSec: number): number;
export function requestMentionsTime(request: string): boolean;
export function setGraphicAnimate(document: ProjectDocument, id: string, animate: boolean): ProjectDocument;
