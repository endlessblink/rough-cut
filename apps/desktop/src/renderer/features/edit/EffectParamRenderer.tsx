import React from 'react';
import type { ParamDefinition } from '@rough-cut/effect-registry';
import { RcSlider, RcSelect, RcToggleButton, ControlLabel } from '../../ui/index.js';

interface EffectParamRendererProps {
  params: readonly ParamDefinition[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 28,
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(0,0,0,0.70)',
  padding: '0 8px',
  fontSize: 11,
  color: 'rgba(255,255,255,0.92)',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
};

export function EffectParamRenderer({ params, values, onChange }: EffectParamRendererProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {params.map((param) => {
        const rawValue = values[param.key];

        switch (param.type) {
          case 'number': {
            const numVal = typeof rawValue === 'number' ? rawValue : (param.defaultValue as number);
            return (
              <RcSlider
                key={param.key}
                label={param.label}
                value={numVal}
                min={param.min ?? 0}
                max={param.max ?? 100}
                step={param.step}
                onChange={(v) => onChange(param.key, v)}
              />
            );
          }

          case 'boolean': {
            const boolVal = typeof rawValue === 'boolean' ? rawValue : (param.defaultValue as boolean);
            return (
              <RcToggleButton
                key={param.key}
                label={param.label}
                value={boolVal}
                onChange={(v) => onChange(param.key, v)}
              />
            );
          }

          case 'enum': {
            const strVal = typeof rawValue === 'string' ? rawValue : String(param.defaultValue);
            return (
              <RcSelect
                key={param.key}
                label={param.label}
                value={strVal}
                onChange={(v) => onChange(param.key, v)}
              >
                {(param.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </RcSelect>
            );
          }

          case 'color': {
            const colorVal = typeof rawValue === 'string' ? rawValue : String(param.defaultValue);
            return (
              <div key={param.key}>
                <ControlLabel label={param.label} />
                <input
                  type="color"
                  value={colorVal}
                  onChange={(e) => onChange(param.key, e.target.value)}
                  style={{
                    width: '100%',
                    height: 28,
                    border: 'none',
                    background: 'rgba(0,0,0,0.70)',
                    padding: 0,
                    cursor: 'pointer',
                    borderRadius: 6,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            );
          }

          case 'string': {
            const strVal = typeof rawValue === 'string' ? rawValue : String(param.defaultValue);
            return (
              <div key={param.key}>
                <ControlLabel label={param.label} />
                <input
                  type="text"
                  value={strVal}
                  onChange={(e) => onChange(param.key, e.target.value)}
                  style={inputStyle}
                />
              </div>
            );
          }

          default:
            return null;
        }
      })}
    </div>
  );
}
