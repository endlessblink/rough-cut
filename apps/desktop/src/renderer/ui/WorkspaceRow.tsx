import React from 'react';
import { useUiStore, uiStore } from '../hooks/use-ui-store.js';

interface WorkspaceRowProps {
  /** Main content area (preview + timeline) */
  main: React.ReactNode;
  /** Inspector panel (shown/hidden via sidebar toggle) */
  inspector?: React.ReactNode;
  /** Fixed sidebar width in px — must match the inspector's flex-basis */
  sidebarWidth: number;
}

/**
 * WorkspaceRow: a single flex row that owns all horizontal layout math.
 *
 * - Main area: flex: 1, min-width: 0, overflow: hidden — always shrinks to fit.
 * - Sidebar: fixed width, never shrinks.
 * - Toggle button: 12px fixed.
 *
 * This component exists so Record and Edit can share identical horizontal
 * layout logic and the sidebar can never be clipped.
 */
export function WorkspaceRow({ main, inspector, sidebarWidth }: WorkspaceRowProps) {
  const isCollapsed = useUiStore((s) => s.isRightSidebarCollapsed);
  const hasInspector = Boolean(inspector);
  const toggleWidth = 12;
  const paddingX = 24;
  const gap = 16;

  return (
    <div
      data-testid="workspace-row"
      style={{
        /* Fill remaining vertical space */
        flex: '1 1 0%',
        minHeight: 0,

        /* Horizontal layout */
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: !hasInspector || isCollapsed ? 0 : gap,

        /* Padding included in width via border-box (global * rule) */
        paddingTop: 12,
        paddingBottom: 8,
        paddingLeft: paddingX,
        paddingRight: paddingX,

        background: 'linear-gradient(to bottom, #111111, #050505)',
      }}
    >
      {/* Main content — must shrink to fit */}
      <div
        style={{
          flex: '1 1 0%',
          minWidth: 0,
          minHeight: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          zIndex: 0,
        }}
      >
        {main}
      </div>

      {/* Sidebar: toggle + inspector panel */}
      {hasInspector && (
        <div
          data-testid="record-inspector"
          style={{
            position: 'relative',
            zIndex: 10,
            display: 'flex',
            flexDirection: 'row',
            flexShrink: 0,
            width: isCollapsed ? toggleWidth : toggleWidth + sidebarWidth,
          }}
        >
          {/* Toggle handle */}
          <button
            onClick={() => uiStore.getState().toggleRightSidebar()}
            style={{
              width: toggleWidth,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', userSelect: 'none' }}>
              {isCollapsed ? '◀' : '▶'}
            </span>
          </button>

          {!isCollapsed && inspector}
        </div>
      )}
    </div>
  );
}
