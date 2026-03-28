import { useState } from 'react';
import {
  CARD_RADIUS,
  BORDER_SUBTLE,
  TEXT_PRIMARY,
  TEXT_MUTED,
} from '../../ui/tokens.js';
import type { RecentProjectEntry } from './types.js';

// Component-local teal accent — specific to project cards
const TEAL_ACCENT = '#4fd1c5';

function formatProjectDate(iso: string): string {
  const d = new Date(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${month} ${day}, ${year} - ${hours}:${minutes}`;
}

function formatDuration(assetCount?: number): string {
  if (assetCount === undefined || assetCount === 0) return '0 clips';
  return `${assetCount} ${assetCount === 1 ? 'clip' : 'clips'}`;
}

interface ProjectCardProps {
  project: RecentProjectEntry;
  isSelected?: boolean;
  onOpen: (filePath: string) => void;
  onRemove: (filePath: string) => void;
}

export function ProjectCard({ project, isSelected = false, onOpen, onRemove }: ProjectCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  function handleRemoveClick(e: React.MouseEvent) {
    e.stopPropagation();
    onRemove(project.filePath);
  }

  const cardBorder = isSelected
    ? `1px solid rgba(79, 209, 197, 0.5)`
    : isHovered
    ? `1px solid rgba(255,255,255,0.12)`
    : `1px solid ${BORDER_SUBTLE}`;

  const cardShadow = isSelected
    ? '0 0 20px rgba(79, 209, 197, 0.15), 0 8px 32px rgba(0,0,0,0.6)'
    : isHovered
    ? '0 8px 32px rgba(0,0,0,0.5)'
    : '0 2px 12px rgba(0,0,0,0.3)';

  return (
    <div
      onClick={() => onOpen(project.filePath)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        borderRadius: CARD_RADIUS,
        overflow: 'hidden',
        background: '#1c1b1e',
        border: cardBorder,
        boxShadow: cardShadow,
        cursor: 'pointer',
        transition: 'border-color 160ms ease, box-shadow 160ms ease',
        userSelect: 'none',
      }}
    >
      {/* Thumbnail area */}
      <div
        style={{
          height: 180,
          position: 'relative',
          background: 'linear-gradient(160deg, #161518 0%, #1e1c21 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {/* Subtle radial teal tint at center */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at 50% 55%, rgba(79, 209, 197, 0.04) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Film icon placeholder */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            opacity: isHovered ? 0.18 : 0.1,
            transition: 'opacity 160ms ease',
          }}
        >
          {/* CSS film strip icon */}
          <FilmStripIcon />
        </div>

        {/* Duration badge — bottom right */}
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            right: 12,
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: 'rgba(0,0,0,0.62)',
            borderRadius: 6,
            padding: '3px 8px',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: TEAL_ACCENT,
              flexShrink: 0,
              boxShadow: `0 0 5px ${TEAL_ACCENT}80`,
            }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: TEXT_PRIMARY,
              letterSpacing: '0.01em',
            }}
          >
            {formatDuration(project.assetCount)}
          </span>
        </div>

        {/* Delete button — top right, hover only */}
        <button
          onClick={handleRemoveClick}
          title="Remove from recent"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 3,
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.75)',
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            opacity: isHovered ? 1 : 0,
            transition: 'opacity 140ms ease, background 120ms ease',
            pointerEvents: isHovered ? 'auto' : 'none',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.82)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(220,38,38,0.4)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.5)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)';
          }}
        >
          <TrashIcon />
        </button>
      </div>

      {/* Info area */}
      <div
        style={{
          padding: '14px 16px 15px',
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          borderTop: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        <span
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: TEXT_PRIMARY,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 1.3,
          }}
        >
          {project.name}
        </span>

        <span
          style={{
            fontSize: 12,
            color: TEXT_MUTED,
            letterSpacing: '0.01em',
          }}
        >
          {formatProjectDate(project.modifiedAt)}
        </span>
      </div>
    </div>
  );
}

function FilmStripIcon() {
  return (
    <svg
      width="48"
      height="44"
      viewBox="0 0 48 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Main film strip body */}
      <rect x="0" y="5" width="48" height="34" rx="3" fill="white" />
      {/* Left perforation strip */}
      <rect x="0" y="5" width="8" height="34" rx="2" fill="rgba(0,0,0,0.35)" />
      {/* Right perforation strip */}
      <rect x="40" y="5" width="8" height="34" rx="2" fill="rgba(0,0,0,0.35)" />
      {/* Left perforations */}
      <rect x="1.5" y="9" width="5" height="5" rx="1.5" fill="white" />
      <rect x="1.5" y="17" width="5" height="5" rx="1.5" fill="white" />
      <rect x="1.5" y="25" width="5" height="5" rx="1.5" fill="white" />
      <rect x="1.5" y="33" width="5" height="5" rx="1.5" fill="white" />
      {/* Right perforations */}
      <rect x="41.5" y="9" width="5" height="5" rx="1.5" fill="white" />
      <rect x="41.5" y="17" width="5" height="5" rx="1.5" fill="white" />
      <rect x="41.5" y="25" width="5" height="5" rx="1.5" fill="white" />
      <rect x="41.5" y="33" width="5" height="5" rx="1.5" fill="white" />
      {/* Center frame divider lines */}
      <rect x="9" y="5" width="1" height="34" fill="rgba(0,0,0,0.12)" />
      <rect x="39" y="5" width="1" height="34" fill="rgba(0,0,0,0.12)" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M1.75 3.5h10.5M5.25 3.5V2.333a.583.583 0 0 1 .583-.583h2.334a.583.583 0 0 1 .583.583V3.5M5.833 6.417v3.5M8.167 6.417v3.5M2.333 3.5l.584 7.583a.583.583 0 0 0 .583.584h7a.583.583 0 0 0 .583-.584L11.667 3.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
