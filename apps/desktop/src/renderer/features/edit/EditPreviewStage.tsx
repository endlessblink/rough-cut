import React from 'react';

interface EditPreviewStageProps {
  previewRef?: (node: HTMLDivElement | null) => void;
  children?: React.ReactNode;
}

// ─── EditPreviewCard ──────────────────────────────────────────────────────────

function EditPreviewCard() {
  return (
    <div
      style={{
        aspectRatio: '16 / 9',
        width: '100%',
        borderRadius: 18,
        background: '#050505',
        boxShadow: '0 18px 60px rgba(0,0,0,0.80)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          color: 'rgba(255,255,255,0.40)',
          fontSize: 13,
          userSelect: 'none',
          letterSpacing: '0.04em',
        }}
      >
        Preview
      </span>
    </div>
  );
}

// ─── EditPreviewStage ─────────────────────────────────────────────────────────

/**
 * EditPreviewStage: centers the preview card within the left column.
 * When previewRef is provided, mounts the compositor canvas instead of placeholder.
 */
export function EditPreviewStage({ previewRef, children }: EditPreviewStageProps) {
  return (
    <section
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 0,
      }}
    >
      <div style={{ width: '100%', maxWidth: 1040 }}>
        {children ?? (
          previewRef ? (
            <div
              ref={previewRef}
              style={{
                aspectRatio: '16 / 9',
                width: '100%',
                borderRadius: 18,
                background: '#050505',
                boxShadow: '0 18px 60px rgba(0,0,0,0.80)',
                overflow: 'hidden',
              }}
            />
          ) : (
            <EditPreviewCard />
          )
        )}
      </div>
    </section>
  );
}
