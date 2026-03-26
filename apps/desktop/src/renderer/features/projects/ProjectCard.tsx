import { useState } from 'react';
import {
  CARD_RADIUS,
  BG_CARD,
  BORDER_SUBTLE,
  BORDER_LIGHT,
  TEXT_PRIMARY,
  TEXT_TERTIARY,
} from '../../ui/tokens.js';
import type { RecentProject } from './types.js';

interface ProjectCardProps {
  project: RecentProject;
  onClick?: (project: RecentProject) => void;
}

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const formattedDate = new Date(project.modifiedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      onClick={() => onClick?.(project)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        borderRadius: CARD_RADIUS,
        background: BG_CARD,
        border: `1px solid ${isHovered ? BORDER_LIGHT : BORDER_SUBTLE}`,
        boxShadow: isHovered ? '0 8px 24px rgba(0,0,0,0.5)' : 'none',
        cursor: 'pointer',
        overflow: 'hidden',
        transition: 'border-color 120ms ease, box-shadow 120ms ease',
      }}
    >
      {/* Thumbnail area */}
      <div
        style={{
          height: 140,
          background: project.thumbnailDataUrl
            ? `url(${project.thumbnailDataUrl}) center/cover no-repeat`
            : '#080808',
          borderRadius: `${CARD_RADIUS}px ${CARD_RADIUS}px 0 0`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {!project.thumbnailDataUrl && (
          <span style={{ fontSize: 24, opacity: 0.2, userSelect: 'none' }}>&#127916;</span>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: TEXT_PRIMARY,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {project.name}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: TEXT_TERTIARY }}>{formattedDate}</span>
          {project.resolution && (
            <span style={{ fontSize: 12, color: TEXT_TERTIARY, opacity: 0.7 }}>
              · {project.resolution}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
