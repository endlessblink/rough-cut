import { TEXT_MUTED } from '../../ui/tokens.js';

export function EmptyRecentState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 0',
        gap: 10,
      }}
    >
      {/* Folder icon */}
      <span
        style={{
          fontSize: 32,
          color: TEXT_MUTED,
          opacity: 0.5,
          lineHeight: 1,
          userSelect: 'none',
        }}
      >
        &#128193;
      </span>

      <span
        style={{
          fontSize: 14,
          color: TEXT_MUTED,
          marginTop: 4,
        }}
      >
        No recent projects
      </span>

      <span
        style={{
          fontSize: 12,
          color: TEXT_MUTED,
          opacity: 0.7,
        }}
      >
        Create a new project or open an existing one
      </span>
    </div>
  );
}
