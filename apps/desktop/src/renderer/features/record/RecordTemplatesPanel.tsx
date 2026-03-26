/**
 * RecordTemplatesPanel — single-column list of selectable layout template cards.
 * Each card shows a schematic preview whose shape reflects the actual aspect ratio,
 * template name, and aspect ratio badge.
 */
import type { LayoutTemplate } from './templates.js';
import { LAYOUT_TEMPLATES } from './templates.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecordTemplatesPanelProps {
  selectedTemplateId: string | null;
  onSelectTemplate: (template: LayoutTemplate) => void;
}

// ─── Schematic preview ────────────────────────────────────────────────────────

const SCREEN_COLOR = 'rgba(90,160,250,0.35)';
const CAMERA_COLOR = 'rgba(255,107,90,0.5)';
const PREVIEW_BG = 'rgba(0,0,0,0.4)';

/** Map aspect ratio string to a numeric ratio for the preview shape */
function aspectToNumber(ar: string): number {
  switch (ar) {
    case '16:9': return 16 / 9;
    case '9:16': return 9 / 16;
    case '1:1': return 1;
    case '4:3': return 4 / 3;
    default: return 16 / 9;
  }
}

interface SchematicProps {
  template: LayoutTemplate;
}

function TemplateSchematic({ template }: SchematicProps) {
  const { screenLayout, cameraPosition, aspectRatio } = template;
  const ratio = aspectToNumber(aspectRatio);

  // The preview area is always the full card width.
  // Height is determined by the aspect ratio, with a max height cap.
  const isVertical = ratio < 1;
  const previewHeight = isVertical ? 72 : 44;

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    height: previewHeight,
    background: PREVIEW_BG,
    borderRadius: 4,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  // For vertical aspect ratios, draw the content area as a tall centered rectangle
  // For horizontal, draw it spanning the full width
  const innerWidth = isVertical ? `${Math.round(ratio * 100)}%` : undefined;

  // ── full-screen: just a filled screen block ──────────────────────────────
  if (screenLayout === 'full-screen') {
    return (
      <div style={containerStyle}>
        <div
          style={{
            position: 'absolute',
            top: 3,
            bottom: 3,
            left: isVertical ? '50%' : 3,
            right: isVertical ? undefined : 3,
            width: isVertical ? innerWidth : undefined,
            transform: isVertical ? 'translateX(-50%)' : undefined,
            background: SCREEN_COLOR,
            borderRadius: 2,
          }}
        />
      </div>
    );
  }

  // ── pip: screen fills the frame + small camera corner overlay ────────────
  if (screenLayout === 'pip') {
    const camSize = isVertical ? { width: 14, height: 14 } : { width: 18, height: 14 };
    const cornerMap: Record<string, React.CSSProperties> = {
      'corner-br': { bottom: 6, right: isVertical ? '22%' : 6 },
      'corner-bl': { bottom: 6, left: isVertical ? '22%' : 6 },
      'corner-tr': { top: 6, right: isVertical ? '22%' : 6 },
      'corner-tl': { top: 6, left: isVertical ? '22%' : 6 },
    };
    const camStyle = cornerMap[cameraPosition] ?? { bottom: 6, right: 6 };

    return (
      <div style={containerStyle}>
        <div
          style={{
            position: 'absolute',
            top: 3,
            bottom: 3,
            left: isVertical ? '50%' : 3,
            right: isVertical ? undefined : 3,
            width: isVertical ? innerWidth : undefined,
            transform: isVertical ? 'translateX(-50%)' : undefined,
            background: SCREEN_COLOR,
            borderRadius: 2,
          }}
        />
        <div
          style={{
            position: 'absolute',
            ...camSize,
            background: CAMERA_COLOR,
            borderRadius: 2,
            ...camStyle,
          }}
        />
      </div>
    );
  }

  // ── split: screen top + camera bottom (vertical layouts) ─────────────────
  if (screenLayout === 'split') {
    return (
      <div style={containerStyle}>
        {/* Centered tall frame */}
        <div
          style={{
            position: 'absolute',
            top: 3,
            bottom: 3,
            left: '50%',
            width: innerWidth ?? '56%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <div style={{ flex: 1, background: SCREEN_COLOR, borderRadius: 2 }} />
          <div style={{ flex: 1, background: CAMERA_COLOR, borderRadius: 2 }} />
        </div>
      </div>
    );
  }

  // ── presentation: camera main + screen inset ─────────────────────────────
  if (screenLayout === 'presentation') {
    return (
      <div style={containerStyle}>
        <div
          style={{
            position: 'absolute',
            top: 3, left: 3, bottom: 3, right: '35%',
            background: CAMERA_COLOR,
            borderRadius: 2,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 3, right: 3, bottom: 3, width: '28%',
            background: SCREEN_COLOR,
            borderRadius: 2,
          }}
        />
      </div>
    );
  }

  return <div style={containerStyle} />;
}

// ─── Template card ────────────────────────────────────────────────────────────

interface TemplateCardProps {
  template: LayoutTemplate;
  selected: boolean;
  onSelect: (template: LayoutTemplate) => void;
}

function TemplateCard({ template, selected, onSelect }: TemplateCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(template)}
      title={template.description}
      style={{
        all: 'unset',
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        padding: 8,
        background: selected ? 'rgba(255,107,90,0.06)' : 'rgba(255,255,255,0.03)',
        border: selected
          ? '1px solid #ff6b5a'
          : '1px solid rgba(255,255,255,0.06)',
        borderRadius: 8,
        cursor: 'pointer',
        boxSizing: 'border-box',
        width: '100%',
        transition: 'background 120ms ease, border-color 120ms ease',
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          (e.currentTarget as HTMLButtonElement).style.background =
            'rgba(255,255,255,0.06)';
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          (e.currentTarget as HTMLButtonElement).style.background =
            'rgba(255,255,255,0.03)';
        }
      }}
    >
      <TemplateSchematic template={template} />

      {/* Name + badge row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: selected ? '#ff6b5a' : 'rgba(255,255,255,0.85)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 1.3,
          }}
        >
          {template.name}
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.40)',
            background: 'rgba(255,255,255,0.07)',
            borderRadius: 3,
            padding: '1px 4px',
            flexShrink: 0,
            letterSpacing: '0.02em',
          }}
        >
          {template.aspectRatio}
        </span>
      </div>
    </button>
  );
}

// ─── RecordTemplatesPanel ─────────────────────────────────────────────────────

export function RecordTemplatesPanel({
  selectedTemplateId,
  onSelectTemplate,
}: RecordTemplatesPanelProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        width: '100%',
      }}
    >
      {LAYOUT_TEMPLATES.map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          selected={template.id === selectedTemplateId}
          onSelect={onSelectTemplate}
        />
      ))}
    </div>
  );
}
