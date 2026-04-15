import { useState, useCallback, useRef } from 'react';
import { Player } from '@remotion/player';
import type { PlayerRef } from '@remotion/player';
import { useProjectStore, useTransportStore, transportStore } from '../../hooks/use-stores.js';
// PlaybackManager singleton handles playback — no usePlaybackLoop needed
import { AppHeader } from '../../ui/index.js';
import type { AppView } from '../../ui/index.js';
import { TEMPLATE_REGISTRY } from './template-registry.js';
import type { TemplateRegistryEntry } from './template-registry.js';
import { PropEditor } from './PropEditor.js';
import { TimelineStrip } from '../edit/TimelineStrip.js';

interface MotionTabProps {
  activeTab: AppView;
  onTabChange: (tab: AppView) => void;
}

const READ_ONLY = { canTrim: false, canSelect: false, canSnap: false } as const;

// ─── Template Browser ────────────────────────────────────────────────────────

function TemplateBrowser({
  templates,
  selectedId,
  onSelect,
}: {
  templates: TemplateRegistryEntry[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  // Group templates by category
  const categories = [...new Set(templates.map((t) => t.category))];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {categories.map((category) => (
        <div key={category}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.35)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 6,
              padding: '0 2px',
            }}
          >
            {category}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {templates
              .filter((t) => t.category === category)
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => onSelect(t.id)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background:
                      selectedId === t.id ? 'rgba(37, 99, 235, 0.15)' : 'rgba(255,255,255,0.02)',
                    border:
                      selectedId === t.id
                        ? '1px solid rgba(37, 99, 235, 0.3)'
                        : '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    transition: 'all 100ms ease',
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: selectedId === t.id ? '#fff' : 'rgba(255,255,255,0.7)',
                    }}
                  >
                    {t.name}
                  </span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                    {t.description}
                  </span>
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── MotionTab ───────────────────────────────────────────────────────────────

export function MotionTab({ activeTab, onTabChange }: MotionTabProps) {
  const projectName = useProjectStore((s) => s.project.name);
  const updateProject = useProjectStore((s) => s.updateProject);
  const fps = useProjectStore((s) => s.project.settings.frameRate);
  const tracks = useProjectStore((s) => s.project.composition.tracks);
  const assets = useProjectStore((s) => s.project.assets);
  const currentFrame = useTransportStore((s) => s.playheadFrame);

  // PlaybackManager singleton handles playback loop

  const playerRef = useRef<PlayerRef>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState(TEMPLATE_REGISTRY[0]?.id ?? '');
  const template =
    TEMPLATE_REGISTRY.find((t) => t.id === selectedTemplateId) ?? TEMPLATE_REGISTRY[0];
  const [currentProps, setCurrentProps] = useState<Record<string, unknown>>(
    () => template?.defaultProps ?? {},
  );

  if (!template) {
    return null;
  }

  // When template changes, reset props
  const handleSelectTemplate = useCallback((id: string) => {
    setSelectedTemplateId(id);
    const nextTemplate = TEMPLATE_REGISTRY.find((t) => t.id === id) ?? TEMPLATE_REGISTRY[0];
    if (nextTemplate) {
      setCurrentProps({ ...nextTemplate.defaultProps });
    }
  }, []);

  const handlePropChange = useCallback((key: string, value: unknown) => {
    setCurrentProps((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleReset = useCallback(() => {
    setCurrentProps({ ...template.defaultProps });
  }, [template]);

  const handleScrub = useCallback((frame: number) => {
    transportStore.getState().setPlayheadFrame(frame);
  }, []);

  return (
    <div
      data-testid="motion-tab-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: '#0d0d0d',
        color: '#e8e8e8',
        overflow: 'hidden',
      }}
    >
      <AppHeader
        activeTab={activeTab}
        onTabChange={onTabChange}
        projectName={projectName}
        onProjectNameChange={(name) => updateProject((doc) => ({ ...doc, name }))}
      />

      {/* Main content — 3 panels */}
      <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'row', minHeight: 0 }}>
        {/* Left panel: Template Browser */}
        <div
          style={{
            width: 240,
            minWidth: 240,
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid rgba(255,255,255,0.06)',
            overflow: 'auto',
            padding: 12,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.5)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: 12,
            }}
          >
            Templates
          </div>
          <TemplateBrowser
            templates={TEMPLATE_REGISTRY}
            selectedId={selectedTemplateId}
            onSelect={handleSelectTemplate}
          />
        </div>

        {/* Center panel: Remotion Player */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 0,
            padding: 24,
            gap: 16,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 800,
              aspectRatio: '16/9',
              borderRadius: 12,
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.06)',
              background: '#000',
            }}
          >
            <Player
              ref={playerRef}
              component={template.component}
              inputProps={currentProps}
              durationInFrames={template.defaultDurationFrames}
              fps={fps}
              compositionWidth={1920}
              compositionHeight={1080}
              style={{ width: '100%', height: '100%' }}
              controls
              loop
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
                {template.name}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                {template.description}
              </div>
            </div>
          </div>
          <button
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              background: '#2563eb',
              color: '#fff',
              transition: 'all 120ms ease',
            }}
          >
            Add to Timeline
          </button>
        </div>

        {/* Right panel: Prop Editor */}
        <div
          style={{
            width: 280,
            minWidth: 280,
            display: 'flex',
            flexDirection: 'column',
            borderLeft: '1px solid rgba(255,255,255,0.06)',
            padding: 16,
            overflow: 'auto',
          }}
        >
          <PropEditor
            schema={template.schema}
            values={currentProps}
            onChange={handlePropChange}
            onReset={handleReset}
          />
        </div>
      </div>

      {/* Bottom: Timeline Strip */}
      <div
        style={{
          height: 140,
          minHeight: 140,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          background: '#0a0a0a',
        }}
      >
        <TimelineStrip
          tracks={tracks}
          assets={assets}
          playheadFrame={currentFrame}
          pixelsPerFrame={3}
          interaction={READ_ONLY}
          onScrub={handleScrub}
        />
      </div>
    </div>
  );
}
