import { useEffect, useState } from 'react';
import type { CaptureSource } from '../../env.js';

import type { RecordMode } from './ModeSelectorRow.js';

function getExpectedSourceType(recordMode: RecordMode): 'screen' | 'window' {
  return recordMode === 'window' ? 'window' : 'screen';
}

function getModeLabel(recordMode: RecordMode): string {
  if (recordMode === 'window') return 'window';
  if (recordMode === 'region') return 'screen for region capture';
  return 'screen';
}

interface SourcePickerPopupProps {
  sources: CaptureSource[];
  selectedSourceId: string | null;
  recordMode?: RecordMode;
  onSelect: (id: string) => void;
  onClose: () => void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

// ─── CloseIcon ───────────────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <line
        x1="3"
        y1="3"
        x2="11"
        y2="11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="11"
        y1="3"
        x2="3"
        y2="11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── MonitorIcon ─────────────────────────────────────────────────────────────

function MonitorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect
        x="1.5"
        y="2.5"
        width="11"
        height="9"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

// ─── SourceCard ──────────────────────────────────────────────────────────────

interface SourceCardProps {
  source: CaptureSource;
  isSelected: boolean;
  onClick: () => void;
}

function SourceCard({ source, isSelected, onClick }: SourceCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const borderStyle = isSelected
    ? '2px solid #ff7043'
    : isHovered
      ? '1px solid rgba(255,255,255,0.20)'
      : '1px solid rgba(255,255,255,0.08)';

  const shadowStyle = isSelected
    ? '0 0 0 1px rgba(0,0,0,0.90), 0 0 0 2px rgba(255,255,255,0.08)'
    : isHovered
      ? '0 10px 28px rgba(0,0,0,0.70)'
      : '0 8px 24px rgba(0,0,0,0.55)';

  const bgStyle = isSelected ? '#111010' : '#0c0c0c';
  const transformStyle = isHovered && !isSelected ? 'translateY(-1px)' : 'none';

  const typeBadge = source.type === 'screen' ? 'Display' : 'Window';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: 180,
        height: 120,
        borderRadius: 10,
        background: bgStyle,
        boxShadow: shadowStyle,
        border: borderStyle,
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
        overflow: 'hidden',
        flexShrink: 0,
        transform: transformStyle,
        transition: 'transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease',
      }}
    >
      {/* Thumbnail */}
      <div
        style={{
          height: 92,
          overflow: 'hidden',
          background: '#000',
          flexShrink: 0,
        }}
      >
        {source.thumbnailDataUrl ? (
          <img
            src={source.thumbnailDataUrl}
            alt={source.name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255,255,255,0.20)',
            }}
          >
            <MonitorIcon />
          </div>
        )}
      </div>

      {/* Label row */}
      <div
        style={{
          height: 28,
          padding: '0 8px',
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.88)',
            maxWidth: 120,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {source.name}
        </span>
        <span
          style={{
            fontSize: 10,
            padding: '2px 6px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.10)',
            color: 'rgba(255,255,255,0.80)',
            flexShrink: 0,
          }}
        >
          {typeBadge}
        </span>
      </div>
    </div>
  );
}

// ─── SourcePickerPopup ───────────────────────────────────────────────────────

export function SourcePickerPopup({
  sources,
  selectedSourceId,
  recordMode = 'fullscreen',
  onSelect,
  onClose,
  onRefresh,
  isLoading = false,
}: SourcePickerPopupProps) {
  const [tempSelectedId, setTempSelectedId] = useState<string | null>(selectedSourceId);
  const [closeHovered, setCloseHovered] = useState(false);
  const [closePressed, setClosePressed] = useState(false);
  const [cancelHovered, setCancelHovered] = useState(false);
  const [useHovered, setUseHovered] = useState(false);
  const [refreshHovered, setRefreshHovered] = useState(false);

  const expectedSourceType = getExpectedSourceType(recordMode);
  const filteredSources = sources.filter((source) => source.type === expectedSourceType);
  const visibleSources = filteredSources;
  const selectedSource = visibleSources.find((s) => s.id === tempSelectedId) ?? null;
  const canUseSelectedSource = Boolean(selectedSource);
  const modeLabel = getModeLabel(recordMode);

  const closeButtonBg = closePressed
    ? 'rgba(255,255,255,0.14)'
    : closeHovered
      ? 'rgba(255,255,255,0.08)'
      : 'transparent';

  const useBtnBg = !canUseSelectedSource
    ? 'rgba(255,255,255,0.10)'
    : useHovered
      ? '#ff8a65'
      : '#ff7043';

  const useBtnColor = !canUseSelectedSource ? 'rgba(255,255,255,0.40)' : '#000';

  useEffect(() => {
    if (selectedSourceId && filteredSources.some((source) => source.id === selectedSourceId)) {
      setTempSelectedId(selectedSourceId);
      return;
    }

    setTempSelectedId(null);
  }, [recordMode, selectedSourceId, sources]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(circle at 50% 0%, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.92) 60%, rgba(0,0,0,0.96) 100%)',
      }}
    >
      {/* Panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 960,
          minHeight: 420,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 18,
          background: '#050505',
          boxShadow: '0 24px 80px rgba(0,0,0,0.85)',
          border: '1px solid rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            height: 56,
            padding: '0 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
          }}
        >
          {/* Left: title + subtitle */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: 'rgba(255,255,255,0.92)',
              }}
            >
              Choose source
            </span>
            <span
              style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.60)',
                marginLeft: 12,
              }}
            >
              {`Pick a ${modeLabel} to record.`}
            </span>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            onMouseEnter={() => setCloseHovered(true)}
            onMouseLeave={() => {
              setCloseHovered(false);
              setClosePressed(false);
            }}
            onMouseDown={() => setClosePressed(true)}
            onMouseUp={() => setClosePressed(false)}
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: closeButtonBg,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255,255,255,0.72)',
              padding: 0,
              transition: 'background 100ms ease',
            }}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '16px 20px 12px',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Body top row: refresh button if available */}
          {onRefresh && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginBottom: 10,
              }}
            >
              <button
                onClick={onRefresh}
                onMouseEnter={() => setRefreshHovered(true)}
                onMouseLeave={() => setRefreshHovered(false)}
                style={{
                  height: 26,
                  padding: '0 10px',
                  borderRadius: 999,
                  background: refreshHovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.60)',
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background 100ms ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path
                    d="M9.5 5.5A4 4 0 1 1 5.5 1.5"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                  <polyline
                    points="5.5,1.5 8,1.5 8,4"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Refresh
              </button>
            </div>
          )}

          {/* Loading state */}
          {isLoading ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255,255,255,0.40)',
                fontSize: 13,
              }}
            >
              Loading sources...
            </div>
          ) : visibleSources.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255,255,255,0.40)',
                fontSize: 13,
              }}
            >
              No matching sources available. Try refreshing or switch record mode.
            </div>
          ) : (
            /* Source card list */
            <div
              style={{
                display: 'flex',
                flexWrap: 'nowrap',
                gap: 10,
                overflowX: 'auto',
                paddingBottom: 4,
                scrollbarWidth: 'none',
              }}
            >
              {visibleSources.map((source) => (
                <SourceCard
                  key={source.id}
                  source={source}
                  isSelected={tempSelectedId === source.id}
                  onClick={() => setTempSelectedId(source.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            height: 56,
            padding: '0 20px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          {/* Left: info text */}
          <span
            style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.64)',
            }}
          >
            {selectedSource ? `Recording: ${selectedSource.name}` : 'No source selected'}
          </span>

          {/* Right: buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={onClose}
              onMouseEnter={() => setCancelHovered(true)}
              onMouseLeave={() => setCancelHovered(false)}
              style={{
                height: 28,
                padding: '0 12px',
                borderRadius: 999,
                background: 'transparent',
                border: 'none',
                color: cancelHovered ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.64)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
                fontFamily: 'inherit',
                transition: 'color 100ms ease',
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const selectedId = tempSelectedId;
                if (selectedId) {
                  onSelect(selectedId);
                }
              }}
              onMouseEnter={() => setUseHovered(true)}
               onMouseLeave={() => setUseHovered(false)}
               disabled={!canUseSelectedSource}
               style={{
                height: 32,
                padding: '0 16px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                 border: 'none',
                 cursor: canUseSelectedSource ? 'pointer' : 'not-allowed',
                background: useBtnBg,
                color: useBtnColor,
                fontFamily: 'inherit',
                transition: 'background 120ms ease',
              }}
            >
              Use source
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
