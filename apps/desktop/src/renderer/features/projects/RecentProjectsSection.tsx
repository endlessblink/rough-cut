import { TEXT_MUTED } from '../../ui/tokens.js';
import { EmptyRecentState } from './EmptyRecentState.js';
import type { RecentProject } from './types.js';

interface RecentProjectsSectionProps {
  projects?: RecentProject[];
}

export function RecentProjectsSection({ projects = [] }: RecentProjectsSectionProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Section header */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: TEXT_MUTED,
          userSelect: 'none',
        }}
      >
        Recent Projects
      </div>

      {/* Phase 1: always show empty state — no backend yet */}
      {projects.length === 0 ? (
        <EmptyRecentState />
      ) : (
        // Phase 2: card grid (not yet implemented)
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 16,
          }}
        >
          {/* ProjectCard components will go here in Phase 2 */}
        </div>
      )}
    </div>
  );
}
