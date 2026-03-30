import { useState, useCallback } from 'react';
import { useProjectStore, useTransportStore, transportStore } from '../../hooks/use-stores.js';
import { usePlaybackLoop } from '../../hooks/use-playback-loop.js';
import { AppHeader } from '../../ui/index.js';
import type { AppView } from '../../ui/index.js';
import { TimelinePlaybackVideo } from '../../components/TimelinePlaybackVideo.js';
import { TimelineStrip } from '../edit/TimelineStrip.js';
import type { ExportRange } from '../edit/TimelineStrip.js';

interface ExportTabProps {
  activeTab: AppView;
  onTabChange: (tab: AppView) => void;
}

const READ_ONLY = {
  canTrim: false,
  canSelect: false,
  canSnap: false,
} as const;

export function ExportTab({ activeTab, onTabChange }: ExportTabProps) {
  const projectName = useProjectStore((s) => s.project.name);
  const updateProject = useProjectStore((s) => s.updateProject);
  const tracks = useProjectStore((s) => s.project.composition.tracks);
  const assets = useProjectStore((s) => s.project.assets);
  const durationFrames = useProjectStore((s) => s.project.composition.duration);
  const projectFps = useProjectStore((s) => s.project.settings.frameRate);
  const resolution = useProjectStore((s) => s.project.settings.resolution);
  const currentFrame = useTransportStore((s) => s.playheadFrame);
  const isPlaying = useTransportStore((s) => s.isPlaying);

  const captureSummary = `${resolution.width}×${resolution.height} · ${projectFps} fps`;
  usePlaybackLoop(projectFps, durationFrames);

  const [exportRange, setExportRange] = useState<ExportRange>({
    inFrame: 0,
    outFrame: durationFrames || 300,
  });

  const handleScrub = useCallback((frame: number) => {
    transportStore.getState().setPlayheadFrame(frame);
  }, []);

  return (
    <div data-testid="export-tab-root" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0d0d0d', color: '#e8e8e8', overflow: 'hidden' }}>
      <AppHeader activeTab={activeTab} onTabChange={onTabChange} projectName={projectName} onProjectNameChange={(name) => updateProject((doc) => ({ ...doc, name }))} captureSummary={captureSummary} />

      {/* Main content */}
      <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'row', gap: 16, padding: '12px 24px 8px', minHeight: 0, background: 'linear-gradient(to bottom, #111111, #050505)' }}>
        {/* Left: preview */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
          <div style={{ width: '100%', maxWidth: 1040 }}>
            <div style={{
              position: 'relative',
              aspectRatio: '16 / 9',
              width: '100%',
              borderRadius: 18,
              background: '#050505',
              boxShadow: '0 18px 60px rgba(0,0,0,0.80)',
              overflow: 'hidden',
            }}>
              <TimelinePlaybackVideo />
            </div>
          </div>
        </div>

        {/* Right: export settings panel */}
        <aside data-testid="export-settings" style={{
          flex: '0 0 280px',
          maxWidth: 280,
          borderRadius: 14,
          background: 'radial-gradient(circle at 0% 0%, rgba(255,255,255,0.05) 0%, rgba(8,8,8,1) 50%, #050505 100%)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.85)',
          border: '1px solid rgba(255,255,255,0.08)',
          padding: '16px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          overflowX: 'hidden',
          overflowY: 'auto',
        }}>
          {/* Format */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.68)', marginBottom: 8 }}>
              Format
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.80)' }}>MP4 (H.264)</div>
          </div>

          {/* Resolution */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.68)', marginBottom: 8 }}>
              Resolution
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.80)' }}>{resolution.width}×{resolution.height}</div>
          </div>

          {/* Frame Rate */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.68)', marginBottom: 8 }}>
              Frame Rate
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.80)' }}>{projectFps} fps</div>
          </div>

          {/* Range info */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.68)', marginBottom: 8 }}>
              Export Range
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.80)' }}>
              {exportRange.inFrame} – {exportRange.outFrame} ({exportRange.outFrame - exportRange.inFrame} frames)
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {/* Export button */}
          <button
            data-testid="btn-export"
            style={{
              height: 40,
              borderRadius: 999,
              border: 'none',
              background: '#ff6b5a',
              color: '#000',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Export
          </button>
        </aside>
      </div>

      {/* Timeline with export range */}
      <div style={{
        height: 180,
        flexShrink: 0,
        borderRadius: 12,
        margin: '0 24px 12px',
        background: 'rgba(8,8,8,0.96)',
        boxShadow: '0 10px 28px rgba(0,0,0,0.75)',
        border: '1px solid rgba(255,255,255,0.06)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          height: 32,
          minHeight: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          background: 'rgba(0,0,0,0.80)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => transportStore.getState().togglePlay()}
              style={{
                width: 22,
                height: 22,
                borderRadius: 4,
                border: 'none',
                background: isPlaying ? 'rgba(255,112,67,0.20)' : 'rgba(255,255,255,0.06)',
                color: isPlaying ? '#ff7043' : 'rgba(255,255,255,0.70)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                padding: 0,
              }}
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? '\u23F8' : '\u25B6'}
            </button>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.72)', userSelect: 'none' }}>
              Export Timeline
            </span>
          </div>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)' }}>
            Drag handles to set export range
          </span>
        </div>

        {/* Timeline body */}
        <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <TimelineStrip
            tracks={tracks}
            assets={assets}
            playheadFrame={currentFrame}
            pixelsPerFrame={3}
            interaction={READ_ONLY}
            exportRange={exportRange}
            onChangeExportRange={setExportRange}
            onScrub={handleScrub}
          />
        </div>
      </div>
    </div>
  );
}
