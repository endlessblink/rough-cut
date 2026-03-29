/**
 * RecordTemplatesPanel — compact 2-column grid of layout template thumbnails.
 * Inspired by Focusee's schematic icon approach: small visual thumbnails
 * whose shape reflects the actual aspect ratio, with a tiny label below.
 */
import type { LayoutTemplate } from './templates.js';
import { LAYOUT_TEMPLATES } from './templates.js';

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

/** Fixed height for the schematic area; the frame inside adapts to aspect ratio */
const SCHEMATIC_HEIGHT = 44;

function TemplateSchematic({ template }: { template: LayoutTemplate }) {
  const { screenLayout, cameraPosition, aspectRatio } = template;

  // Compute frame dimensions that fit inside the schematic area
  // while preserving the template's aspect ratio
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

  // Camera overlay size relative to frame
  const camW = Math.round(frameW * 0.28);
  const camH = Math.round(frameH * 0.28);
  const camInset = 2;

  const cornerStyles: Record<string, React.CSSProperties> = {
    'corner-br': { bottom: camInset, right: camInset },
    'corner-bl': { bottom: camInset, left: camInset },
    'corner-tr': { top: camInset, right: camInset },
    'corner-tl': { top: camInset, left: camInset },
    'center': { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  };

  const camStyle = cornerStyles[cameraPosition] ?? cornerStyles['corner-br'];

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
        {screenLayout === 'split' ? (
          <>
            <div style={{ position: 'absolute', top: 1, left: 1, right: 1, height: '46%', background: SCREEN_COLOR, borderRadius: 1 }} />
            <div style={{ position: 'absolute', bottom: 1, left: 1, right: 1, height: '46%', background: CAMERA_COLOR, borderRadius: 1 }} />
          </>
        ) : screenLayout === 'presentation' ? (
          <>
            <div style={{ position: 'absolute', top: 1, left: 1, bottom: 1, width: '58%', background: CAMERA_COLOR, borderRadius: 1 }} />
            <div style={{ position: 'absolute', top: 1, right: 1, bottom: 1, width: '34%', background: SCREEN_COLOR, borderRadius: 1 }} />
          </>
        ) : (
          <>
            <div style={{ position: 'absolute', inset: 1, background: SCREEN_COLOR, borderRadius: 1 }} />
            {cameraPosition !== 'none' && cameraPosition !== 'hidden' && screenLayout === 'pip' && (
              <div
                style={{
                  position: 'absolute',
                  width: camW,
                  height: camH,
                  background: CAMERA_COLOR,
                  borderRadius: 2,
                  ...camStyle,
                }}
              />
            )}
          </>
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
        {template.name}
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
