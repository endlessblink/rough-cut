const CARD_BORDER = '1px solid rgba(255,255,255,0.08)';
const CARD_BG = 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))';
const TEXT_MUTED = 'rgba(255,255,255,0.58)';
const TEXT_SOFT = 'rgba(255,255,255,0.72)';

export function AboutCreditsCard() {
  return (
    <section
      style={{
        border: CARD_BORDER,
        borderRadius: 20,
        padding: 24,
        background: CARD_BG,
        boxShadow: '0 18px 48px rgba(0,0,0,0.28)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#ff8a65',
            }}
          >
            About and Credits
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'rgba(255,255,255,0.96)' }}>
            Rough Cut
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: TEXT_SOFT, maxWidth: 760 }}>
            Desktop recording and editing for fast tutorial-style videos, built with Electron,
            React, TypeScript, and PixiJS.
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 12,
          }}
        >
          <div
            style={{
              borderRadius: 14,
              border: CARD_BORDER,
              background: 'rgba(255,255,255,0.03)',
              padding: 16,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>
              WhisperX
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: TEXT_SOFT, marginTop: 8 }}>
              rough-cut includes WhisperX-related transcription work and attribution materials.
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: TEXT_SOFT, marginTop: 8 }}>
              This product includes software developed by Max Bain and WhisperX contributors.
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: TEXT_MUTED, marginTop: 8 }}>
              License: BSD-4-Clause. Full text is shipped in `THIRD_PARTY_LICENSES.md`.
            </div>
          </div>

          <div
            style={{
              borderRadius: 14,
              border: CARD_BORDER,
              background: 'rgba(255,255,255,0.03)',
              padding: 16,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>
              FFmpeg
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: TEXT_SOFT, marginTop: 8 }}>
              rough-cut relies on FFmpeg for parts of recording and export processing.
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: TEXT_MUTED, marginTop: 8 }}>
              Current behavior calls the user-available `ffmpeg` binary as a subprocess. If a
              bundled FFmpeg binary is ever distributed, the release must carry the relevant LGPL
              notices and source offer details.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
