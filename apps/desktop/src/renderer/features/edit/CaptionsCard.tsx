import type { CaptionSegment, AIAnnotationId } from '@rough-cut/project-model';
import { InspectorCard } from '../../ui/index.js';

interface CaptionsCardProps {
  captionSegments: readonly CaptionSegment[];
  fps: number;
  onUpdateCaptionText: (id: AIAnnotationId, text: string) => void;
}

function formatTimecode(frame: number, fps: number): string {
  const totalSeconds = Math.floor(frame / fps);
  const remainderFrames = frame % fps;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}+${String(remainderFrames).padStart(2, '0')}`;
}

export function CaptionsCard({ captionSegments, fps, onUpdateCaptionText }: CaptionsCardProps) {
  return (
    <InspectorCard title="Captions & Titles">
      {captionSegments.length === 0 ? (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', userSelect: 'none' }}>
          No captions in clip range
        </div>
      ) : (
        <div>
          <div
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.50)',
              marginBottom: 4,
            }}
          >
            {captionSegments.length} segment{captionSegments.length !== 1 ? 's' : ''} in clip range
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {captionSegments.map((seg) => (
              <div key={seg.id}>
                <div
                  style={{
                    fontSize: 10,
                    color: 'rgba(255,255,255,0.45)',
                    fontFamily: 'monospace',
                    marginBottom: 4,
                  }}
                >
                  {formatTimecode(seg.startFrame, fps)} → {formatTimecode(seg.endFrame, fps)}
                </div>
                <input
                  type="text"
                  value={seg.text}
                  onChange={(e) => onUpdateCaptionText(seg.id, e.target.value)}
                  style={{
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
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </InspectorCard>
  );
}
