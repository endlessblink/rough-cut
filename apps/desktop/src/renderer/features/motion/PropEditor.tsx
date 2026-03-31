import type { z } from 'zod';

interface PropEditorProps {
  schema: z.ZodObject<any>;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  onReset: () => void;
}

// Detect if a string value is a CSS color
function isColorValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /^#[0-9a-fA-F]{3,8}$/.test(value) || value.startsWith('rgba(') || value.startsWith('rgb(');
}

// Extract Zod schema metadata
function getZodMeta(zodType: any): { type: string; min?: number; max?: number; options?: string[]; defaultValue?: unknown; innerType?: any } {
  const def = zodType._def;

  if (def.typeName === 'ZodDefault') {
    const inner = getZodMeta(def.innerType);
    return { ...inner, defaultValue: def.defaultValue() };
  }
  if (def.typeName === 'ZodString') return { type: 'string' };
  if (def.typeName === 'ZodNumber') {
    let min: number | undefined;
    let max: number | undefined;
    if (def.checks) {
      for (const check of def.checks) {
        if (check.kind === 'min') min = check.value;
        if (check.kind === 'max') max = check.value;
      }
    }
    return { type: 'number', min, max };
  }
  if (def.typeName === 'ZodBoolean') return { type: 'boolean' };
  if (def.typeName === 'ZodEnum') return { type: 'enum', options: def.values };
  if (def.typeName === 'ZodArray') return { type: 'array', innerType: def.type };
  if (def.typeName === 'ZodObject') return { type: 'object' };

  return { type: 'unknown' };
}

// Label formatting: camelCase → Title Case
function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.03)',
  color: 'rgba(255,255,255,0.85)',
  fontSize: 12,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: 'rgba(255,255,255,0.5)',
  marginBottom: 4,
};

function PropField({ label, meta, value, onChange }: {
  label: string;
  meta: ReturnType<typeof getZodMeta>;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  // Color picker for string fields that contain color values
  if (meta.type === 'string' && isColorValue(value)) {
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={labelStyle}>{label}</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="color"
            value={typeof value === 'string' && value.startsWith('#') ? value : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            style={{ width: 32, height: 28, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'transparent', padding: 0 }}
          />
          <input
            type="text"
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
      </div>
    );
  }

  // String input
  if (meta.type === 'string') {
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={labelStyle}>{label}</div>
        <input type="text" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
      </div>
    );
  }

  // Number slider
  if (meta.type === 'number') {
    const min = meta.min ?? 0;
    const max = meta.max ?? 100;
    const step = max - min > 10 ? 1 : 0.1;
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', ...labelStyle }}>
          <span>{label}</span>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>{Number(value ?? 0).toFixed(step < 1 ? 1 : 0)}</span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={Number(value ?? 0)}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#2563eb' }}
        />
      </div>
    );
  }

  // Boolean toggle
  if (meta.type === 'boolean') {
    return (
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={labelStyle}>{label}</span>
        <button
          onClick={() => onChange(!value)}
          style={{
            width: 36,
            height: 20,
            borderRadius: 10,
            border: 'none',
            cursor: 'pointer',
            background: value ? '#2563eb' : 'rgba(255,255,255,0.1)',
            position: 'relative',
            transition: 'background 150ms ease',
          }}
        >
          <div style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            background: '#fff',
            position: 'absolute',
            top: 3,
            left: value ? 19 : 3,
            transition: 'left 150ms ease',
          }} />
        </button>
      </div>
    );
  }

  // Enum dropdown
  if (meta.type === 'enum' && meta.options) {
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={labelStyle}>{label}</div>
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          {meta.options.map((opt: string) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }

  // Skip complex types (arrays, objects) for now
  return null;
}

export function PropEditor({ schema, values, onChange, onReset }: PropEditorProps) {
  const shape = schema.shape;
  const keys = Object.keys(shape);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 0 12px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        marginBottom: 12,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Properties
        </span>
        <button
          onClick={onReset}
          style={{
            padding: '3px 8px',
            borderRadius: 4,
            border: 'none',
            fontSize: 10,
            fontWeight: 600,
            cursor: 'pointer',
            background: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          Reset
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {keys.map((key) => {
          const meta = getZodMeta(shape[key]);
          // Skip array/object types (like words in caption overlay)
          if (meta.type === 'array' || meta.type === 'object' || meta.type === 'unknown') return null;
          return (
            <PropField
              key={key}
              label={formatLabel(key)}
              meta={meta}
              value={values[key]}
              onChange={(val) => onChange(key, val)}
            />
          );
        })}
      </div>
    </div>
  );
}
