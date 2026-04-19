import type { AIAnnotationId, CaptionSegment } from '@rough-cut/project-model';
import { CaptionsCard } from '../edit/CaptionsCard.js';

interface RecordCaptionsPanelProps {
  captionSegments: readonly CaptionSegment[];
  fps: number;
  canGenerate: boolean;
  isGenerating: boolean;
  error: string | null;
  onGenerate: () => void;
  onUpdateCaptionText: (id: AIAnnotationId, text: string) => void;
}

export function RecordCaptionsPanel({
  captionSegments,
  fps,
  canGenerate,
  isGenerating,
  error,
  onGenerate,
  onUpdateCaptionText,
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

      <CaptionsCard
        captionSegments={captionSegments}
        fps={fps}
        onUpdateCaptionText={onUpdateCaptionText}
      />
    </div>
  );
}
