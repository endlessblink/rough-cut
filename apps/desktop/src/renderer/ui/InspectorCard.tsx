/**
 * InspectorCard — shared card component for right panel sections.
 * Used in Record (Zoom, Cursor, Highlights, Titles) and Edit (Clip, Layout, etc.)
 */
import React, { useState } from 'react';
import {
  CARD_RADIUS,
  BG_CARD,
  BG_CARD_HEADER,
  BORDER_SUBTLE,
  CARD_PADDING_X,
  CARD_PADDING_Y_TOP,
  CARD_PADDING_Y_BOTTOM,
  SECTION_GAP,
  TEXT_SECONDARY,
  TEXT_MUTED,
} from './tokens.js';

interface InspectorCardProps {
  title: string;
  onReset?: () => void;
  flex?: number;
  minHeight?: number;
  children?: React.ReactNode;
}

export function InspectorCard({ title, onReset, flex, minHeight = 48, children }: InspectorCardProps) {
  const [resetHovered, setResetHovered] = useState(false);

  return (
    <section
      style={{
        borderRadius: CARD_RADIUS,
        background: BG_CARD,
        border: `1px solid ${BORDER_SUBTLE}`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight,
        flex: flex ?? 'none',
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 28,
          minHeight: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 10px',
          background: BG_CARD_HEADER,
          borderBottom: `1px solid ${BORDER_SUBTLE}`,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: TEXT_SECONDARY,
            userSelect: 'none',
          }}
        >
          {title}
        </span>
        {onReset && (
          <button
            onClick={onReset}
            onMouseEnter={() => setResetHovered(true)}
            onMouseLeave={() => setResetHovered(false)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: 11,
              color: resetHovered ? 'rgba(255,255,255,0.80)' : TEXT_MUTED,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'color 100ms ease',
            }}
          >
            Reset
          </button>
        )}
      </div>

      {/* Body */}
      <div
        style={{
          padding: `${CARD_PADDING_Y_TOP}px ${CARD_PADDING_X}px ${CARD_PADDING_Y_BOTTOM}px`,
          display: 'flex',
          flexDirection: 'column',
          gap: SECTION_GAP,
          flex: 1,
        }}
      >
        {children ?? (
          <span style={{ fontSize: 11, color: TEXT_MUTED, userSelect: 'none' }}>
            Coming soon
          </span>
        )}
      </div>
    </section>
  );
}
