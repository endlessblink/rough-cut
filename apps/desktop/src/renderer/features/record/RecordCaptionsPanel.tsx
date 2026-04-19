import type { AIAnnotationId, CaptionSegment } from '@rough-cut/project-model';
import { CaptionsCard } from '../edit/CaptionsCard.js';
import { ControlLabel, RcSlider, RcSelect } from '../../ui/index.js';

interface RecordCaptionsPanelProps {
  captionSegments: readonly CaptionSegment[];
  fps: number;
  canGenerate: boolean;
  isGenerating: boolean;
  error: string | null;
  onGenerate: () => void;
  onUpdateCaptionText: (id: AIAnnotationId, text: string) => void;
  style: {
    fontSize: number;
    position: 'bottom' | 'center';
    backgroundOpacity: number;
  };
  onUpdateStyle: (patch: Partial<RecordCaptionsPanelProps['style']>) => void;
}

export function RecordCaptionsPanel({
  captionSegments,
  fps,
  canGenerate,
  isGenerating,
  error,
  onGenerate,
  onUpdateCaptionText,
  style,
  onUpdateStyle,
}: RecordCaptionsPanelProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button
        type="button"
        data-testid="record-captions-generate"
        disabled={!canGenerate || isGenerating}
        onClick={onGenerate}
        style={{
          width: '100%',
          padding: '8px 10px',
          fontSize: 11,
          fontWeight: 600,
          color: canGenerate && !isGenerating ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.42)',
          background:
            canGenerate && !isGenerating ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 6,
          cursor: canGenerate && !isGenerating ? 'pointer' : 'not-allowed',
        }}
      >
        {isGenerating ? 'Generating captions…' : 'Generate captions'}
      </button>

      {error && (
        <div
          style={{ fontSize: 11, color: 'rgba(255,120,120,0.92)' }}
          data-testid="record-captions-error"
        >
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        <div>
          <ControlLabel label="Caption size" value={`${style.fontSize}px`} />
          <RcSlider
            label="Caption size"
            min={16}
            max={56}
            step={2}
            value={style.fontSize}
            onChange={(value) => onUpdateStyle({ fontSize: value })}
          />
        </div>

        <div>
          <ControlLabel label="Caption position" />
          <RcSelect
            ariaLabel="Caption position"
            value={style.position}
            onChange={(value) => onUpdateStyle({ position: value as 'bottom' | 'center' })}
          >
            <option value="bottom">Bottom</option>
            <option value="center">Center</option>
          </RcSelect>
        </div>

        <div>
          <ControlLabel
            label="Background"
            value={`${Math.round(style.backgroundOpacity * 100)}%`}
          />
          <RcSlider
            label="Caption background"
            min={0}
            max={100}
            step={5}
            value={style.backgroundOpacity * 100}
            onChange={(value) => onUpdateStyle({ backgroundOpacity: value / 100 })}
          />
        </div>
      </div>

      <CaptionsCard
        captionSegments={captionSegments}
        fps={fps}
        onUpdateCaptionText={onUpdateCaptionText}
      />
    </div>
  );
}
