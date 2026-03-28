import { useState } from 'react';
import { TEXT_PRIMARY, TEXT_MUTED, BORDER_SUBTLE, BG_CONTROL } from '../../ui/tokens.js';
import { EmptyRecentState } from './EmptyRecentState.js';
import { ProjectCard } from './ProjectCard.js';
import type { RecentProjectEntry } from './types.js';

interface RecentProjectsSectionProps {
  projects: RecentProjectEntry[];
  isLoading: boolean;
  onOpen: (filePath: string) => void;
  onRemove: (filePath: string) => void;
  onRefresh: () => void;
}

export function RecentProjectsSection({
  projects,
  isLoading,
  onOpen,
  onRemove,
  onRefresh,
}: RecentProjectsSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [refreshHovered, setRefreshHovered] = useState(false);

  const filteredProjects = searchQuery.trim()
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : projects;

  function handleOpen(filePath: string) {
    setSelectedPath(filePath);
    onOpen(filePath);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        {/* Title + subtitle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: TEXT_PRIMARY,
              letterSpacing: '-0.01em',
              lineHeight: 1.2,
            }}
          >
            Recent Projects
          </span>
          <span
            style={{
              fontSize: 13,
              color: TEXT_MUTED,
              lineHeight: 1,
            }}
          >
            {projects.length} {projects.length === 1 ? 'project' : 'projects'}
          </span>
        </div>

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          title="Refresh"
          onMouseEnter={() => setRefreshHovered(true)}
          onMouseLeave={() => setRefreshHovered(false)}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: `1px solid ${BORDER_SUBTLE}`,
            background: refreshHovered ? BG_CONTROL : 'transparent',
            color: refreshHovered ? TEXT_PRIMARY : TEXT_MUTED,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: 2,
            transition: 'background 140ms ease, color 140ms ease, border-color 140ms ease',
            borderColor: refreshHovered ? 'rgba(255,255,255,0.12)' : BORDER_SUBTLE,
          }}
        >
          <RefreshIcon />
        </button>
      </div>

      {/* Search bar */}
      <div style={{ position: 'relative' }}>
        <span
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: TEXT_MUTED,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <SearchIcon />
        </span>
        <input
          type="text"
          placeholder="Search projects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '9px 14px 9px 36px',
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${BORDER_SUBTLE}`,
            borderRadius: 10,
            color: TEXT_PRIMARY,
            fontSize: 13,
            outline: 'none',
            transition: 'border-color 140ms ease',
          }}
          onFocus={(e) => {
            (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.14)';
          }}
          onBlur={(e) => {
            (e.target as HTMLInputElement).style.borderColor = BORDER_SUBTLE;
          }}
        />
      </div>

      {/* Card grid or empty state */}
      {filteredProjects.length === 0 && !isLoading ? (
        <EmptyRecentState />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 16,
          }}
        >
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.filePath}
              project={project}
              isSelected={selectedPath === project.filePath}
              onOpen={handleOpen}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M1.167 7A5.833 5.833 0 0 1 12.25 4.667M1.75 9.333A5.833 5.833 0 0 0 12.833 7"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <path
        d="M10.5 2.917l1.75 1.75-1.75 1.75M3.5 11.083l-1.75-1.75 1.75-1.75"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle
        cx="6.125"
        cy="6.125"
        r="4.083"
        stroke="currentColor"
        strokeWidth="1.1"
      />
      <path
        d="M9.333 9.333l2.334 2.334"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
