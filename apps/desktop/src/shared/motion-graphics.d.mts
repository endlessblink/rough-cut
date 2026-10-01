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

export type GraphicEntrance = 'none' | 'fade' | 'rise' | 'pop' | 'slide';

export interface GraphicLayout {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
  readonly opacity: number;
  readonly entrance: GraphicEntrance;
  readonly entranceSec: number;
}

export const GRAPHIC_ENTRANCES: readonly GraphicEntrance[];
export const DEFAULT_GRAPHIC_LAYOUT: GraphicLayout;
export function normalizeGraphicLayout(raw: unknown): GraphicLayout;
export function graphicLayerStateAt(
  layout: GraphicLayout,
  t: number,
  durationSec: number,
  width: number,
  height: number,
  rtl?: boolean,
): { opacity: number; tx: number; ty: number; scale: number };
export type GraphicHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';
export function resizeGraphicLayout(options: {
  layout: GraphicLayout;
  box: { x: number; y: number; w: number; h: number };
  handle: GraphicHandle;
  dx: number;
  dy: number;
  width: number;
  height: number;
}): GraphicLayout;
export function setGraphicLayout(document: ProjectDocument, id: string, patch: Partial<GraphicLayout>): ProjectDocument;

export interface TimelineGraphic {
  readonly id: string;
  readonly effectId: string;
  readonly title: string;
  readonly html: string;
  readonly fields: readonly GraphicField[];
  readonly request: string;
  readonly direction: string | null;
  readonly animate: boolean;
  readonly layout: GraphicLayout;
  readonly timing: 'hold' | 'stretch';
  readonly designedSec: number | null;
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
  readonly layout?: GraphicLayout;
  readonly timing?: 'hold' | 'stretch';
  readonly designedSec?: number | null;
}): string;

export function listGraphics(document: ProjectDocument): readonly TimelineGraphic[];
export function graphicLaneRows(graphics: readonly Pick<TimelineGraphic, 'id' | 'startFrame' | 'endFrame'>[]): { rows: number; assignment: Record<string, number> };
export function reorderGraphic(document: ProjectDocument, id: string, where: 'front' | 'back' | 'forward' | 'backward'): ProjectDocument;
export function graphicsAtFrame(document: ProjectDocument, frame: number): readonly TimelineGraphic[];

export function addGraphic(document: ProjectDocument, options: {
  readonly id: string;
  readonly title?: string;
  readonly html: string;
  readonly fields?: readonly GraphicField[];
  readonly request?: string;
  readonly direction?: string | null;
  readonly designedSec?: number | null;
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
  readonly designedSec?: number | null;
}): ProjectDocument;

export function setGraphicTiming(document: ProjectDocument, id: string, timing: 'hold' | 'stretch'): ProjectDocument;

export function removeGraphic(document: ProjectDocument, id: string): ProjectDocument;

export function dragGraphicRange(
  range: { readonly startFrame: number; readonly endFrame: number },
  options: { readonly mode: 'move' | 'start' | 'end'; readonly delta: number; readonly totalFrames: number; readonly minSpan?: number },
): { startFrame: number; endFrame: number };

export const DEFAULT_HOLD_SEC: number;
export function graphicHoldSec(durationSec: number): number;
export function requestMentionsTime(request: string): boolean;
export function setGraphicAnimate(document: ProjectDocument, id: string, animate: boolean): ProjectDocument;
