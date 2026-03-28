import type { EffectDefinition, ResolvedParams } from './types.js';

const registry = new Map<string, EffectDefinition>();

export function registerEffect(effect: EffectDefinition): void {
  if (registry.has(effect.type)) {
    return; // Already registered — idempotent for HMR and React strict mode re-mounts
  }
  registry.set(effect.type, effect);
}

export function getEffect(type: string): EffectDefinition | undefined {
  return registry.get(type);
}

export function getAllEffects(): EffectDefinition[] {
  return Array.from(registry.values());
}

export function getEffectsByCategory(
  category: EffectDefinition['category'],
): EffectDefinition[] {
  return Array.from(registry.values()).filter((e) => e.category === category);
}

export function clearRegistry(): void {
  registry.clear();
}

export function getDefaultParams(type: string): ResolvedParams {
  const effect = registry.get(type);
  if (!effect) {
    return {};
  }
  const result: ResolvedParams = {};
  for (const param of effect.params) {
    result[param.key] = param.defaultValue;
  }
  return result;
}
