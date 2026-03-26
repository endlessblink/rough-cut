import React from 'react';
import type { Clip, ClipId } from '@rough-cut/project-model';
import { InspectorCard, EDIT_PANEL_WIDTH, CARD_GAP } from '../../ui/index.js';
import { ClipInspectorCard } from './ClipInspectorCard.js';

// ─── EditRightPanel ────────────────────────────────────────────────────────────

interface EditRightPanelProps {
  selectedClip: Clip | null;
  fps: number;
  onUpdateClip: (clipId: ClipId, patch: { name?: string; enabled?: boolean }) => void;
}

export function EditRightPanel({ selectedClip, fps, onUpdateClip }: EditRightPanelProps) {
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
      <ClipInspectorCard clip={selectedClip} fps={fps} onUpdateClip={onUpdateClip} />
      <InspectorCard title="Layout" minHeight={72} />
      <InspectorCard title="Motion" minHeight={72} />
      <InspectorCard title="Captions &amp; Titles" minHeight={72} />
      <InspectorCard title="Audio" minHeight={72} />
    </aside>
  );
}
