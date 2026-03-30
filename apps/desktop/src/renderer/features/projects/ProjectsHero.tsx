import { useState } from 'react';
import {
  ACCENT_COLOR,
  TEXT_PRIMARY,
  TEXT_TERTIARY,
  TEXT_SECONDARY,
  BG_CONTROL,
  BG_CONTROL_HOVER,
  BORDER_LIGHT,
} from '../../ui/tokens.js';

interface ProjectsHeroProps {
  onNewProject: () => void;
  onOpenProject: () => void;
}

export function ProjectsHero({ onNewProject, onOpenProject }: ProjectsHeroProps) {
  const [newHovered, setNewHovered] = useState(false);
  const [newPressed, setNewPressed] = useState(false);
  const [openHovered, setOpenHovered] = useState(false);
  const [openPressed, setOpenPressed] = useState(false);

  // New Project button background
  let newBg = ACCENT_COLOR;
  if (newPressed) newBg = '#e65a4a';
  else if (newHovered) newBg = '#ff8575';

  // Open Project button background
  let openBg = BG_CONTROL;
  if (openPressed) openBg = 'rgba(255,255,255,0.14)';
  else if (openHovered) openBg = BG_CONTROL_HOVER;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
      }}
    >
      <h1
        style={{
          fontSize: 24,
          fontWeight: 600,
          color: TEXT_PRIMARY,
          margin: 0,
          lineHeight: 1.2,
        }}
      >
        Start a new project
      </h1>

      <p
        style={{
          fontSize: 14,
          color: TEXT_TERTIARY,
          margin: '10px 0 0',
          lineHeight: 1.5,
        }}
      >
        Record your screen, edit with a timeline, export anywhere
      </p>

      {/* Button row */}
      <div
        style={{
          display: 'flex',
          gap: 14,
          marginTop: 28,
        }}
      >
        {/* New Project — primary */}
        <button
          data-testid="btn-new-project"
          onClick={onNewProject}
          onMouseEnter={() => setNewHovered(true)}
          onMouseLeave={() => { setNewHovered(false); setNewPressed(false); }}
          onMouseDown={() => setNewPressed(true)}
          onMouseUp={() => setNewPressed(false)}
          style={{
            height: 44,
            padding: '0 28px',
            borderRadius: 12,
            border: 'none',
            background: newBg,
            color: '#000',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'background 120ms ease-out',
            userSelect: 'none',
            outline: 'none',
          }}
        >
          New Project
        </button>

        {/* Open Project — ghost */}
        <button
          onClick={onOpenProject}
          onMouseEnter={() => setOpenHovered(true)}
          onMouseLeave={() => { setOpenHovered(false); setOpenPressed(false); }}
          onMouseDown={() => setOpenPressed(true)}
          onMouseUp={() => setOpenPressed(false)}
          style={{
            height: 44,
            padding: '0 28px',
            borderRadius: 12,
            border: `1px solid ${BORDER_LIGHT}`,
            background: openBg,
            color: TEXT_SECONDARY,
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'background 120ms ease-out',
            userSelect: 'none',
            outline: 'none',
          }}
        >
          Open Project
        </button>
      </div>
    </div>
  );
}
