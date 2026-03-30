import { useState } from 'react';
import type { ProjectDocument, Asset } from '@rough-cut/project-model';
import {
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_MUTED,
  BORDER_SUBTLE,
  BORDER_LIGHT,
  BG_CARD,
  CARD_RADIUS,
  ACCENT_COLOR,
} from '../../ui/tokens.js';

interface ProjectDetailViewProps {
  project: ProjectDocument;
  filePath: string;
  onBack: () => void;
  /** Called when user picks a recording and chooses where to open it */
  onOpenRecording: (assetId: string, destination: 'record' | 'edit') => void;
  /** Called when user deletes a recording */
  onDeleteRecording: (assetId: string) => void;
}

function framesToDuration(frames: number, fps: number): string {
  const totalSeconds = Math.round(frames / (fps || 30));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getRecordingName(filePath: string): string {
  const name = filePath.split('/').pop() || 'Recording';
  return name.replace(/\.[^.]+$/, '');
}

const TEAL = '#4fd1c5';

// ─── Choice Popup ────────────────────────────────────────────────────────────

function OpenChoicePopup({
  recordingName,
  onChoice,
  onClose,
}: {
  recordingName: string;
  onChoice: (dest: 'record' | 'edit') => void;
  onClose: () => void;
}) {
  const [hoveredBtn, setHoveredBtn] = useState<'record' | 'edit' | null>(null);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1c1b1e',
          border: `1px solid ${BORDER_LIGHT}`,
          borderRadius: 16,
          padding: '28px 32px',
          minWidth: 340,
          maxWidth: 420,
          boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* Title */}
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRIMARY, marginBottom: 6 }}>
            Open recording
          </div>
          <div style={{ fontSize: 13, color: TEXT_MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {recordingName}
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => onChoice('record')}
            onMouseEnter={() => setHoveredBtn('record')}
            onMouseLeave={() => setHoveredBtn(null)}
            style={{
              flex: 1,
              height: 44,
              borderRadius: 10,
              border: `1px solid ${hoveredBtn === 'record' ? TEAL + '60' : BORDER_LIGHT}`,
              background: hoveredBtn === 'record' ? TEAL + '12' : 'rgba(255,255,255,0.04)',
              color: TEXT_PRIMARY,
              fontSize: 14,
              fontWeight: 500,
              fontFamily: 'inherit',
              cursor: 'pointer',
              transition: 'all 120ms ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
            }}
          >
            <span>Open in Recorder</span>
            <span style={{ fontSize: 11, color: TEXT_MUTED }}>Continue recording</span>
          </button>

          <button
            onClick={() => onChoice('edit')}
            onMouseEnter={() => setHoveredBtn('edit')}
            onMouseLeave={() => setHoveredBtn(null)}
            style={{
              flex: 1,
              height: 44,
              borderRadius: 10,
              border: 'none',
              background: hoveredBtn === 'edit' ? '#ff8575' : ACCENT_COLOR,
              color: '#000',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
              transition: 'background 120ms ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
            }}
          >
            <span>Open in Editor</span>
            <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)' }}>Edit timeline</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main View ───────────────────────────────────────────────────────────────

export function ProjectDetailView({
  project,
  filePath,
  onBack,
  onOpenRecording,
  onDeleteRecording,
}: ProjectDetailViewProps) {
  const recordings = project.assets.filter((a) => a.type === 'recording');
  const fps = project.settings.frameRate || 30;
  const [hoveredBack, setHoveredBack] = useState(false);
  const [popupAsset, setPopupAsset] = useState<Asset | null>(null);

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '40px 64px 48px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
      }}
    >
      <div style={{ maxWidth: 960, margin: '0 auto', width: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 40 }}>
          <div>
            <button
              onClick={onBack}
              onMouseEnter={() => setHoveredBack(true)}
              onMouseLeave={() => setHoveredBack(false)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: 0,
                marginBottom: 16,
                fontSize: 14,
                fontFamily: 'inherit',
                color: hoveredBack ? TEXT_PRIMARY : TEXT_SECONDARY,
                transition: 'color 120ms ease',
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>&larr;</span>
              Projects
            </button>

            <h2 style={{ fontSize: 22, fontWeight: 600, color: TEXT_PRIMARY, margin: 0 }}>
              {project.name}
            </h2>

            <div style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 6, display: 'flex', gap: 16 }}>
              <span>{recordings.length} recording{recordings.length !== 1 ? 's' : ''}</span>
              <span>{project.settings.resolution.width}x{project.settings.resolution.height}</span>
              <span>{fps} fps</span>
            </div>
          </div>
        </div>

        {/* Recordings grid */}
        {recordings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: TEXT_MUTED, fontSize: 14 }}>
            No recordings in this project
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {recordings.map((asset) => (
              <RecordingCard
                key={asset.id}
                asset={asset}
                fps={fps}
                onSelect={() => setPopupAsset(asset)}
                onDelete={() => onDeleteRecording(asset.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Choice popup */}
      {popupAsset && (
        <OpenChoicePopup
          recordingName={getRecordingName(popupAsset.filePath)}
          onChoice={(dest) => {
            console.info('[DetailView] Opening recording:', popupAsset.id, 'in', dest);
            onOpenRecording(popupAsset.id, dest);
            setPopupAsset(null);
          }}
          onClose={() => setPopupAsset(null)}
        />
      )}
    </div>
  );
}

// ─── Recording Card ──────────────────────────────────────────────────────────

function RecordingCard({
  asset,
  fps,
  onSelect,
  onDelete,
}: {
  asset: Asset;
  fps: number;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [deleteHovered, setDeleteHovered] = useState(false);
  const name = getRecordingName(asset.filePath);
  const duration = framesToDuration(asset.duration, fps);
  const fileSize = asset.metadata?.fileSize ? formatFileSize(asset.metadata.fileSize as number) : '';

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        borderRadius: 14,
        background: '#1c1b1e',
        border: `1px solid ${isHovered ? TEAL + '50' : BORDER_SUBTLE}`,
        boxShadow: isHovered ? `0 0 16px ${TEAL}15` : 'none',
        cursor: 'pointer',
        overflow: 'hidden',
        transition: 'border-color 150ms ease, box-shadow 150ms ease',
      }}
    >
      {/* Thumbnail */}
      <div
        style={{
          height: 160,
          position: 'relative',
          background: 'linear-gradient(160deg, #161518 0%, #1e1c21 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {asset.thumbnailPath && (
          <img
            src={`media://${asset.thumbnailPath}`}
            alt=""
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              zIndex: 2,
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        )}

        <div style={{ opacity: 0.08, fontSize: 36, zIndex: 1, userSelect: 'none' }}>
          🎬
        </div>

        {/* Duration badge */}
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: 'rgba(0,0,0,0.62)',
            borderRadius: 6,
            padding: '3px 8px',
            zIndex: 3,
          }}
        >
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: TEAL, boxShadow: `0 0 6px ${TEAL}` }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: TEXT_PRIMARY }}>{duration}</span>
        </div>

        {/* Delete button */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          onMouseEnter={() => setDeleteHovered(true)}
          onMouseLeave={() => setDeleteHovered(false)}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 28,
            height: 28,
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 4,
            opacity: isHovered ? 1 : 0,
            pointerEvents: isHovered ? 'auto' : 'none',
            background: deleteHovered ? 'rgba(220,38,38,0.82)' : 'rgba(0,0,0,0.5)',
            transition: 'opacity 150ms ease, background 120ms ease',
            fontFamily: 'inherit',
            padding: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
            <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
          </svg>
        </button>
      </div>

      {/* Info */}
      <div style={{ padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: TEXT_PRIMARY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </div>
        <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 4, display: 'flex', gap: 10 }}>
          <span>{duration}</span>
          {fileSize && <span>{fileSize}</span>}
        </div>
      </div>
    </div>
  );
}
