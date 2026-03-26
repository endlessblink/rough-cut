import { useState, useRef, useEffect } from 'react';

export type AppView = 'projects' | 'record' | 'edit' | 'export' | 'aiMotion';

export interface AppHeaderProps {
  activeTab: AppView;
  onTabChange: (tab: AppView) => void;
  projectName?: string;
  onProjectNameChange?: (name: string) => void;
  // Right side — all optional so Edit/Projects can omit them
  captureSummary?: string;
  deviceStatus?: string;
  onSettingsClick?: () => void;
}

// ─── AppBadge ────────────────────────────────────────────────────────────────

function AppBadge() {
  return (
    <div
      style={{
        width: 24,
        height: 24,
        borderRadius: 4,
        background: '#e53935',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: '#fff',
          lineHeight: 1,
          userSelect: 'none',
        }}
      >
        R
      </span>
    </div>
  );
}

// ─── AppName ─────────────────────────────────────────────────────────────────

function AppName() {
  return (
    <span
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.86)',
        letterSpacing: '0.01em',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      Rough Cut
    </span>
  );
}

// ─── SeparatorDot ─────────────────────────────────────────────────────────────

function SeparatorDot() {
  return (
    <div
      style={{
        width: 4,
        height: 4,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.32)',
        flexShrink: 0,
        margin: '0 2px',
      }}
    />
  );
}

// ─── ProjectNameInline ────────────────────────────────────────────────────────

interface ProjectNameInlineProps {
  value: string;
  onChange?: (name: string) => void;
}

function ProjectNameInline({ value, onChange }: ProjectNameInlineProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [isHovered, setIsHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes when not editing
  useEffect(() => {
    if (!isEditing) {
      setDraft(value);
    }
  }, [value, isEditing]);

  // Auto-focus and select all when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  function handleClick() {
    setDraft(value);
    setIsEditing(true);
  }

  function handleSave() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onChange?.(trimmed);
    }
    setIsEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setDraft(value);
      setIsEditing(false);
    }
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        style={{
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid rgba(255,255,255,0.24)',
          outline: 'none',
          boxShadow: 'none',
          color: 'rgba(255,255,255,0.96)',
          fontSize: 13,
          fontWeight: 400,
          padding: '0 2px',
          maxWidth: 260,
          fontFamily: 'inherit',
          letterSpacing: 'inherit',
        }}
      />
    );
  }

  return (
    <span
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        fontSize: 13,
        fontWeight: 400,
        color: isHovered ? 'rgba(255,255,255,0.84)' : 'rgba(255,255,255,0.68)',
        cursor: 'text',
        maxWidth: 260,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        transition: 'color 120ms ease',
      }}
    >
      {value}
    </span>
  );
}

// ─── AppViewTabs ──────────────────────────────────────────────────────────────

const APP_VIEW_TABS: { id: AppView; label: string }[] = [
  { id: 'projects', label: 'Projects' },
  { id: 'record', label: 'Record' },
  { id: 'edit', label: 'Edit' },
  { id: 'aiMotion', label: 'AI Motion' },
  { id: 'export', label: 'Export' },
];

interface AppViewTabsProps {
  activeTab: AppView;
  onTabChange: (tab: AppView) => void;
}

function AppViewTabs({ activeTab, onTabChange }: AppViewTabsProps) {
  const [hoveredTab, setHoveredTab] = useState<AppView | null>(null);
  const [pressedTab, setPressedTab] = useState<AppView | null>(null);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      {APP_VIEW_TABS.map(({ id, label }) => {
        const isActive = activeTab === id;
        const isHovered = hoveredTab === id;
        const isPressed = pressedTab === id;

        let background: string;
        let color: string;

        if (isPressed) {
          background = 'rgba(255,255,255,0.12)';
          color = isActive ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.80)';
        } else if (isActive) {
          background = 'rgba(255,255,255,0.10)';
          color = 'rgba(255,255,255,0.96)';
        } else if (isHovered) {
          background = 'rgba(255,255,255,0.06)';
          color = 'rgba(255,255,255,0.80)';
        } else {
          background = 'transparent';
          color = 'rgba(255,255,255,0.56)';
        }

        const padding = id === 'aiMotion' ? '0 14px' : '0 12px';

        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            onMouseEnter={() => setHoveredTab(id)}
            onMouseLeave={() => { setHoveredTab(null); setPressedTab(null); }}
            onMouseDown={() => setPressedTab(id)}
            onMouseUp={() => setPressedTab(null)}
            style={{
              height: 28,
              padding,
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: '0.02em',
              border: 'none',
              cursor: 'pointer',
              background,
              color,
              transition: 'background-color 120ms ease-out, color 120ms ease-out',
              fontFamily: 'inherit',
              userSelect: 'none',
              outline: 'none',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ─── CaptureSummary ───────────────────────────────────────────────────────────

function CaptureSummary({ value }: { value: string }) {
  return (
    <span
      style={{
        fontSize: 12,
        color: 'rgba(255,255,255,0.64)',
        maxWidth: 160,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {value}
    </span>
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────

function Divider() {
  return (
    <div
      style={{
        width: 1,
        height: 16,
        background: 'rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}
    />
  );
}

// ─── DeviceStatus ─────────────────────────────────────────────────────────────

function DeviceStatus({ value }: { value: string }) {
  const isError = value.startsWith('No ');

  return (
    <button
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        fontSize: 12,
        color: isError ? '#ff7474' : 'rgba(255,255,255,0.64)',
        maxWidth: 180,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontFamily: 'inherit',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {value}
    </button>
  );
}

// ─── IconButtonSettings ───────────────────────────────────────────────────────

function IconButtonSettings({ onClick }: { onClick?: () => void }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  let background = 'transparent';
  if (isPressed) background = 'rgba(255,255,255,0.10)';
  else if (isHovered) background = 'rgba(255,255,255,0.06)';

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setIsPressed(false); }}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      style={{
        width: 28,
        height: 28,
        borderRadius: 999,
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        background,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'background 120ms ease',
      }}
    >
      <span
        style={{
          fontSize: 14,
          color: 'rgba(255,255,255,0.68)',
          lineHeight: 1,
          userSelect: 'none',
        }}
      >
        ⚙
      </span>
    </button>
  );
}

// ─── AppHeader ────────────────────────────────────────────────────────────────

export function AppHeader({
  projectName = 'Untitled Project',
  onProjectNameChange,
  activeTab,
  onTabChange,
  captureSummary,
  deviceStatus,
  onSettingsClick,
}: AppHeaderProps) {
  return (
    <div
      style={{
        height: 56,
        minHeight: 56,
        width: '100%',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        background: '#111111',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        zIndex: 10,
        flexShrink: 0,
        boxSizing: 'border-box',
      }}
    >
      {/* Left cluster */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AppBadge />
        <AppName />
        <SeparatorDot />
        <ProjectNameInline value={projectName} onChange={onProjectNameChange} />
      </div>

      {/* Center cluster */}
      <div
        style={{
          flex: '1 0 auto',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <AppViewTabs activeTab={activeTab} onTabChange={onTabChange} />
      </div>

      {/* Right cluster */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {captureSummary !== undefined && <CaptureSummary value={captureSummary} />}
        {(captureSummary !== undefined || deviceStatus !== undefined) && <Divider />}
        {deviceStatus !== undefined && <DeviceStatus value={deviceStatus} />}
        {onSettingsClick !== undefined && <IconButtonSettings onClick={onSettingsClick} />}
      </div>
    </div>
  );
}
