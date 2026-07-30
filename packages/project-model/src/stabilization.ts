import type { Asset } from './types.js';
import type { Timeline, TimelineEffect } from './shared-timeline.js';

export const STABILIZATION_METHOD_VERSION = 1 as const;
export const DEFAULT_STABILIZATION_STRENGTH = 50;

export interface StabilizationEffectParams {
  readonly strength: number;
  readonly methodVersion: typeof STABILIZATION_METHOD_VERSION;
}

export function isStabilizableProjectAsset(
  asset: Pick<Asset, 'type' | 'metadata'> | null | undefined,
): boolean {
  return asset?.type === 'video';
}

export function normalizeStabilizationStrength(value: unknown): number {
  if (!Number.isFinite(Number(value))) return DEFAULT_STABILIZATION_STRENGTH;
  return Math.max(0, Math.min(100, Math.round(Number(value))));
}

export function getSourceStabilization(
  timeline: Pick<Timeline, 'effects'> | null | undefined,
  sourceId: string,
): TimelineEffect | null {
  return timeline?.effects.find(
    (effect) => effect.kind === 'stabilization'
      && effect.ownerType === 'source'
      && effect.ownerId === sourceId,
  ) ?? null;
}

export function setSourceStabilization(
  timeline: Timeline,
  sourceId: string,
  input: { readonly enabled: boolean; readonly strength?: unknown },
): Timeline {
  if (!timeline.sources.some((source) => source.id === sourceId)) {
    throw new Error(`Stabilization source not found: ${sourceId}`);
  }

  const strength = normalizeStabilizationStrength(input.strength);
  const existing = getSourceStabilization(timeline, sourceId);
  const effect: TimelineEffect = {
    id: existing?.id ?? `effect:${sourceId}:stabilization`,
    kind: 'stabilization',
    ownerId: sourceId,
    ownerType: 'source',
    enabled: input.enabled,
    params: {
      strength,
      methodVersion: STABILIZATION_METHOD_VERSION,
    },
  };

  return {
    ...timeline,
    effects: existing
      ? timeline.effects.map((candidate) => candidate.id === existing.id ? effect : candidate)
      : [...timeline.effects, effect],
  };
}
