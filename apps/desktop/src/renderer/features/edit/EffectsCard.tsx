import React, { useMemo, useState } from 'react';
import type { Clip, ClipId, TrackId, EffectInstance } from '@rough-cut/project-model';
import { createEffectInstance } from '@rough-cut/project-model';
import {
  registerBuiltinEffects,
  getAllEffects,
  getEffect,
  getDefaultParams,
} from '@rough-cut/effect-registry';
import { InspectorCard } from '../../ui/index.js';
import { EffectParamRenderer } from './EffectParamRenderer.js';

// Register built-in effects once at module load (idempotent)
registerBuiltinEffects();

interface EffectsCardProps {
  clip: Clip;
  trackId: TrackId;
  onAddEffect: (trackId: TrackId, clipId: ClipId, effect: EffectInstance) => void;
  onUpdateEffect: (
    trackId: TrackId,
    clipId: ClipId,
    effectIndex: number,
    patch: Partial<EffectInstance>,
  ) => void;
  onRemoveEffect: (trackId: TrackId, clipId: ClipId, effectIndex: number) => void;
}

const addDropdownStyle: React.CSSProperties = {
  width: '100%',
  height: 28,
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(0,0,0,0.70)',
  color: 'rgba(255,255,255,0.85)',
  fontSize: 11,
  fontFamily: 'inherit',
  padding: '0 8px',
  cursor: 'pointer',
  outline: 'none',
  boxSizing: 'border-box',
  appearance: 'none',
  WebkitAppearance: 'none',
};

export function EffectsCard({
  clip,
  trackId,
  onAddEffect,
  onUpdateEffect,
  onRemoveEffect,
}: EffectsCardProps) {
  const availableEffects = useMemo(() => getAllEffects(), []);

  // Track which effect indices are expanded (default: all)
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(
    () => new Set(clip.effects.map((_, i) => i)),
  );

  function toggleExpanded(index: number) {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function handleAddEffect(e: React.ChangeEvent<HTMLSelectElement>) {
    const effectType = e.target.value;
    if (!effectType) return;
    // Reset select back to placeholder
    e.target.value = '';

    const effect = createEffectInstance(effectType, {
      params: getDefaultParams(effectType),
    });
    onAddEffect(trackId, clip.id, effect);

    // Auto-expand the new effect
    setExpandedIndices((prev) => new Set([...prev, clip.effects.length]));
  }

  return (
    <InspectorCard title="Effects">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Add effect dropdown */}
        <select
          defaultValue=""
          onChange={handleAddEffect}
          style={addDropdownStyle}
        >
          <option value="" disabled>
            Add effect...
          </option>
          {availableEffects.map((def) => (
            <option key={def.type} value={def.type}>
              {def.name}
            </option>
          ))}
        </select>

        {/* Effect list */}
        {clip.effects.length === 0 ? (
          <div
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.30)',
              userSelect: 'none',
              paddingTop: 2,
            }}
          >
            No effects applied
          </div>
        ) : (
          clip.effects.map((effect, index) => {
            const def = getEffect(effect.effectType);
            const effectName = def?.name ?? effect.effectType;
            const isExpanded = expandedIndices.has(index);

            return (
              <div key={effect.id}>
                {/* Header row */}
                <div
                  style={{
                    height: 28,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: 6,
                    padding: '0 8px',
                  }}
                >
                  {/* Chevron + name (clickable) */}
                  <div
                    onClick={() => toggleExpanded(index)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      flex: 1,
                      cursor: 'pointer',
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        color: 'rgba(255,255,255,0.4)',
                        marginRight: 4,
                        userSelect: 'none',
                        flexShrink: 0,
                      }}
                    >
                      {isExpanded ? '▾' : '▸'}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.85)',
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        userSelect: 'none',
                      }}
                    >
                      {effectName}
                    </span>
                  </div>

                  {/* Enable toggle */}
                  <EnableToggle
                    enabled={effect.enabled}
                    onToggle={() =>
                      onUpdateEffect(trackId, clip.id, index, { enabled: !effect.enabled })
                    }
                  />

                  {/* Remove button */}
                  <RemoveButton onClick={() => onRemoveEffect(trackId, clip.id, index)} />
                </div>

                {/* Body (when expanded) */}
                {isExpanded && (
                  <div
                    style={{
                      padding: '8px 0 4px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <EffectParamRenderer
                      params={def?.params ?? []}
                      values={effect.params as Record<string, unknown>}
                      onChange={(key, value) =>
                        onUpdateEffect(trackId, clip.id, index, {
                          params: { ...effect.params, [key]: value },
                        })
                      }
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </InspectorCard>
  );
}

// ─── Small sub-components ──────────────────────────────────────────────────────

function EnableToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={enabled ? 'Disable effect' : 'Enable effect'}
      style={{
        width: 14,
        height: 14,
        borderRadius: 3,
        border: `1px solid ${enabled ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)'}`,
        background: enabled ? 'rgba(255,255,255,0.18)' : 'transparent',
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
      }}
    />
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Remove effect"
      style={{
        background: 'none',
        border: 'none',
        padding: '2px 4px',
        fontSize: 11,
        color: hovered ? 'rgba(255,100,100,0.8)' : 'rgba(255,255,255,0.35)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        flexShrink: 0,
        transition: 'color 100ms ease',
      }}
    >
      ✕
    </button>
  );
}
