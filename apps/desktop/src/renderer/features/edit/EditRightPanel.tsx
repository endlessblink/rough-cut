import type {
  Clip,
  ClipId,
  TrackId,
  ClipTransform,
  EffectInstance,
  CaptionSegment,
  AIAnnotationId,
} from '@rough-cut/project-model';
import { InspectorCard, EDIT_PANEL_WIDTH, CARD_GAP } from '../../ui/index.js';
import { ClipInspectorCard } from './ClipInspectorCard.js';
import { EffectsCard } from './EffectsCard.js';
import { AudioCard } from './AudioCard.js';
import { CaptionsCard } from './CaptionsCard.js';

// ─── EditRightPanel ────────────────────────────────────────────────────────────

interface EditRightPanelProps {
  selectedClip: Clip | null;
  fps: number;
  onUpdateClip: (clipId: ClipId, patch: { name?: string; enabled?: boolean }) => void;
  onUpdateTransform: (clipId: ClipId, patch: Partial<ClipTransform>) => void;
  // Effects
  trackId: TrackId | null;
  onAddEffect: (trackId: TrackId, clipId: ClipId, effect: EffectInstance) => void;
  onUpdateEffect: (
    trackId: TrackId,
    clipId: ClipId,
    effectIndex: number,
    patch: Partial<EffectInstance>,
  ) => void;
  onRemoveEffect: (trackId: TrackId, clipId: ClipId, effectIndex: number) => void;
  // Audio
  trackVolume: number;
  onSetTrackVolume: (trackId: TrackId, volume: number) => void;
  // Captions
  captionSegments: readonly CaptionSegment[];
  onUpdateCaptionText: (id: AIAnnotationId, text: string) => void;
}

export function EditRightPanel({
  selectedClip,
  fps,
  onUpdateClip,
  onUpdateTransform,
  trackId,
  onAddEffect,
  onUpdateEffect,
  onRemoveEffect,
  trackVolume,
  onSetTrackVolume,
  captionSegments,
  onUpdateCaptionText,
}: EditRightPanelProps) {
  return (
    <aside
      style={{
        flex: `0 0 ${EDIT_PANEL_WIDTH}px`,
        maxWidth: EDIT_PANEL_WIDTH,
        borderRadius: 14,
        background:
          'radial-gradient(circle at 0% 0%, rgba(255,255,255,0.05) 0%, rgba(8,8,8,1) 50%, #050505 100%)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.85)',
        border: '1px solid rgba(255,255,255,0.08)',
        padding: '12px 12px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: CARD_GAP,
        overflowX: 'hidden',
        overflowY: 'auto',
      }}
    >
      <ClipInspectorCard
        clip={selectedClip}
        fps={fps}
        onUpdateClip={onUpdateClip}
        onUpdateTransform={onUpdateTransform}
      />

      {selectedClip && trackId && (
        <EffectsCard
          clip={selectedClip}
          trackId={trackId}
          onAddEffect={onAddEffect}
          onUpdateEffect={onUpdateEffect}
          onRemoveEffect={onRemoveEffect}
        />
      )}

      <InspectorCard title="Motion" minHeight={48}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', userSelect: 'none' }}>
          Motion presets coming soon.
        </div>
      </InspectorCard>

      <AudioCard trackId={trackId} trackVolume={trackVolume} onSetTrackVolume={onSetTrackVolume} />

      <CaptionsCard
        captionSegments={captionSegments}
        fps={fps}
        onUpdateCaptionText={onUpdateCaptionText}
      />
    </aside>
  );
}
