import type { CensorRegion } from '@rough-cut/project-model';

export interface CensorSourceRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface CensorMosaicGrid {
  readonly cols: number;
  readonly rows: number;
}

export const DEFAULT_CENSOR_FILL_COLOR: string;

export { activeCensorRegionsAt } from '@rough-cut/project-model';

export function censorRectToSourceRect(
  rect: unknown,
  sourceWidth: number,
  sourceHeight: number,
): CensorSourceRect | null;

export function resolveCensorSourceScale(input?: {
  readonly screenDrawScale?: number;
  readonly transform?: { readonly scale?: number } | null;
}): number;

export const DEFAULT_CENSOR_SOFTNESS: number;

export function resolveCensorSoftness(region: unknown): number;

export function moveCensorRect(
  rect: CensorSourceRect | null | undefined,
  deltaX: number,
  deltaY: number,
): CensorSourceRect | null;

export function resizeCensorRect(
  rect: CensorSourceRect | null | undefined,
  handle: string | null,
  pointerX: number,
  pointerY: number,
): CensorSourceRect | null;

export function resolveCensorBlurSpacing(region: unknown): number;

export function resolveCensorBlockSize(region: unknown): number;

export function resolveCensorMosaicGrid(
  sourceRect: CensorSourceRect | null,
  region: unknown,
): CensorMosaicGrid | null;

export function resolveCensorSoftenRadiusPx(region: unknown, sourceScale: number): number;

export function resolveCensorFillColor(region: unknown): string;

export interface CensorNormalizedRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface CensorKeyframeSegment {
  readonly startFrame: number;
  readonly endFrame: number;
  readonly fromRect: CensorNormalizedRect;
  readonly toRect: CensorNormalizedRect;
}

/**
 * Only the parts of a censor that determine where it sits. Deliberately structural:
 * the preview overlay carries its own lighter region shape, and both must resolve
 * position through this one function rather than each interpolating for itself.
 */
export interface CensorPositionable {
  readonly rect?: CensorNormalizedRect;
  readonly keyframes?: readonly {
    readonly frame: number;
    readonly rect: CensorNormalizedRect;
  }[];
}

export function resolveCensorRectAtFrame(
  region: CensorPositionable | null | undefined,
  frame: number,
): CensorNormalizedRect | null;

export function censorKeyframeSegments(
  region: CensorRegion | null | undefined,
): readonly CensorKeyframeSegment[];

export function censorRegionIsAnimated(region: CensorRegion | null | undefined): boolean;
