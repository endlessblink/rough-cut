import type { CensorMode, CensorRegion, ProjectDocument } from '@rough-cut/project-model';

export const DEFAULT_CENSOR_BLOCK_SIZE: number;

/** Starting box for a censor created from the timeline, before it is positioned. */
export const DEFAULT_CENSOR_RECT: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

export interface CensorRectInput {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Clamp and normalize a drawn rect. Returns `null` when the drag produced nothing
 * usable, which callers must treat as "no censor" rather than substituting one.
 */
export function normalizeCensorRect(rect: unknown): CensorRectInput | null;

export function listCensorRegions(document: ProjectDocument): readonly CensorRegion[];

export function addCensorRegionAt(
  document: ProjectDocument,
  options?: {
    readonly rect?: unknown;
    readonly startFrame?: number;
    readonly endFrame?: number;
    readonly id?: string;
    readonly mode?: CensorMode;
    readonly blockSize?: number;
    readonly soften?: boolean;
  },
): ProjectDocument;

export function updateCensorRegionRange(
  document: ProjectDocument,
  regionId: string,
  startFrame: number,
  endFrame: number,
): ProjectDocument;

export function updateCensorRegionRect(
  document: ProjectDocument,
  regionId: string,
  rect: unknown,
): ProjectDocument;

export function setCensorRegionSoftness(
  document: ProjectDocument,
  regionId: string,
  softness: number,
): ProjectDocument;

export function setCensorRegionMode(
  document: ProjectDocument,
  regionId: string,
  mode: CensorMode,
): ProjectDocument;

export function removeCensorRegion(document: ProjectDocument, regionId: string): ProjectDocument;
