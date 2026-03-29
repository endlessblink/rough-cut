/**
 * RecordTemplatesPanel — compact 2-column grid of layout template thumbnails.
 * Thumbnails render from the same NormalizedRect data as the live preview,
 * so what you see in the thumbnail is exactly what you get in the preview.
 */
import type { LayoutTemplate } from './templates.js';
import { LAYOUT_TEMPLATES, toCssRect } from './templates.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecordTemplatesPanelProps {
  selectedTemplateId: string | null;
  onSelectTemplate: (template: LayoutTemplate) => void;
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const SCREEN_COLOR = 'rgba(90,160,250,0.4)';
const CAMERA_COLOR = 'rgba(255,107,90,0.55)';
const FRAME_BG = 'rgba(0,0,0,0.5)';
const FRAME_BORDER = 'rgba(255,255,255,0.06)';

// ─── Aspect-ratio-aware schematic ─────────────────────────────────────────────

const SCHEMATIC_HEIGHT = 44;

function TemplateSchematic({ template }: { template: LayoutTemplate }) {
  const { aspectRatio } = template;

  // Compute frame dimensions preserving aspect ratio within schematic area
  const maxW = 68;
  const maxH = SCHEMATIC_HEIGHT - 4;
  let frameW: number;
  let frameH: number;

  switch (aspectRatio) {
    case '9:16':
      frameH = maxH;
      frameW = Math.round(frameH * (9 / 16));
      break;
    case '1:1':
      frameH = maxH;
      frameW = frameH;
      break;
    case '4:3':
      frameW = maxW;
      frameH = Math.round(frameW * (3 / 4));
      break;
    case '16:9':
    default:
      frameW = maxW;
      frameH = Math.round(frameW * (9 / 16));
      break;
  }

  return (
    <div
      style={{
        width: '100%',
        height: SCHEMATIC_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Aspect-ratio frame */}
      <div
        style={{
          position: 'relative',
          width: frameW,
          height: frameH,
          background: FRAME_BG,
          border: `1px solid ${FRAME_BORDER}`,
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        {/* Screen region — rendered from normalized rect */}
        {template.screenRect && (
          <div
            style={{
              ...toCssRect(template.screenRect),
              background: SCREEN_COLOR,
              borderRadius: template.kind === 'SPLIT_HORIZONTAL' || template.kind === 'SPLIT_VERTICAL' ? 1 : 0,
            }}
          />
        )}

        {/* Camera region — rendered from normalized rect */}
        {template.cameraRect && (
          <div
            style={{
              ...toCssRect(template.cameraRect),
              background: CAMERA_COLOR,
              borderRadius: template.kind === 'PIP' ? '50%' : 1,
              zIndex: template.zOrder === 'camera-above' ? 2 : 1,
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Template card ────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: LayoutTemplate;
  selected: boolean;
  onSelect: (t: LayoutTemplate) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(template)}
      title={template.description}
      style={{
        all: 'unset',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        padding: 4,
        background: selected ? 'rgba(255,107,90,0.08)' : 'transparent',
        border: selected
          ? '1px solid rgba(255,107,90,0.6)'
          : '1px solid transparent',
        borderRadius: 6,
        cursor: 'pointer',
        boxSizing: 'border-box',
        transition: 'background 100ms ease, border-color 100ms ease',
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = 'transparent';
      }}
    >
      <TemplateSchematic template={template} />
      <span
        style={{
          fontSize: 9,
          fontWeight: 500,
          color: selected ? 'rgba(255,107,90,0.9)' : 'rgba(255,255,255,0.50)',
          textAlign: 'center',
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
        }}
      >
        {template.label}
      </span>
    </button>
  );
}

// ─── Category grouping ────────────────────────────────────────────────────────

const ASPECT_GROUPS: { label: string; ratios: string[] }[] = [
  { label: 'Landscape', ratios: ['16:9', '4:3'] },
  { label: 'Portrait', ratios: ['9:16'] },
  { label: 'Square', ratios: ['1:1'] },
];

function CategoryHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.30)',
        padding: '8px 2px 4px',
        userSelect: 'none',
      }}
    >
      {label}
    </div>
  );
}

// ─── RecordTemplatesPanel ─────────────────────────────────────────────────────

export function RecordTemplatesPanel({
  selectedTemplateId,
  onSelectTemplate,
}: RecordTemplatesPanelProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
      {ASPECT_GROUPS.map((group) => {
        const templates = LAYOUT_TEMPLATES.filter((t) =>
          group.ratios.includes(t.aspectRatio),
        );
        if (templates.length === 0) return null;
        return (
          <div key={group.label}>
            <CategoryHeader label={group.label} />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 4,
              }}
            >
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  selected={template.id === selectedTemplateId}
                  onSelect={onSelectTemplate}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
