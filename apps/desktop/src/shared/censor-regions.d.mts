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

export function resolveCensorBlockSize(region: unknown): number;

export function resolveCensorMosaicGrid(
  sourceRect: CensorSourceRect | null,
  region: unknown,
): CensorMosaicGrid | null;

export function resolveCensorSoftenRadiusPx(region: unknown, sourceScale: number): number;

export function resolveCensorFillColor(region: unknown): string;
