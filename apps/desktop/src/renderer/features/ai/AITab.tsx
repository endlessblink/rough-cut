import { useState, useEffect, useCallback } from 'react';
import { useProjectStore } from '../../hooks/use-stores.js';
import { AppHeader } from '../../ui/index.js';
import type { AppView } from '../../ui/index.js';
import type { Asset, AssetId, CaptionSegment, AIAnnotationId } from '@rough-cut/project-model';

type Provider = 'groq' | 'openai';
type AnalysisState = 'idle' | 'processing' | 'complete' | 'error';

interface AITabProps {
  activeTab: AppView;
  onTabChange: (tab: AppView) => void;
}

// ─── Timecode helper ─────────────────────────────────────────────────────────

function framesToTimecode(frames: number, fps: number): string {
  const totalSeconds = frames / fps;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const ms = Math.round((totalSeconds % 1) * 100);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

// ─── Provider Config ─────────────────────────────────────────────────────────

function ProviderConfig({
  provider,
  onProviderChange,
  apiKey,
  onApiKeyChange,
  onApiKeySave,
  isSaved,
}: {
  provider: Provider;
  onProviderChange: (p: Provider) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  onApiKeySave: () => void;
  isSaved: boolean;
}) {
  return (
    <div style={{
      padding: 12,
      borderRadius: 8,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Provider
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {(['groq', 'openai'] as Provider[]).map((p) => (
          <button
            key={p}
            onClick={() => onProviderChange(p)}
            style={{
              flex: 1,
              padding: '5px 8px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
              background: provider === p ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.03)',
              color: provider === p ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.4)',
              transition: 'all 120ms ease',
            }}
          >
            {p === 'groq' ? 'Groq' : 'OpenAI'}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          type="password"
          placeholder={`${provider === 'groq' ? 'Groq' : 'OpenAI'} API Key`}
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          onBlur={onApiKeySave}
          onKeyDown={(e) => { if (e.key === 'Enter') onApiKeySave(); }}
          style={{
            flex: 1,
            padding: '6px 8px',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.03)',
            color: 'rgba(255,255,255,0.8)',
            fontSize: 12,
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
      </div>
      {isSaved && apiKey && (
        <div style={{ fontSize: 11, color: '#4ade80' }}>Key saved</div>
      )}
    </div>
  );
}

// ─── Asset Selector ──────────────────────────────────────────────────────────

function AssetSelector({
  assets,
  selectedIds,
  onToggle,
}: {
  assets: readonly Asset[];
  selectedIds: Set<string>;
  onToggle: (id: AssetId) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
        Source Assets
      </div>
      {assets.length === 0 ? (
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', padding: '20px 0', textAlign: 'center' }}>
          No assets yet. Record or import media first.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {assets.map((asset) => {
            const isSelected = selectedIds.has(asset.id);
            return (
              <button
                key={asset.id}
                onClick={() => onToggle(asset.id)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  background: isSelected ? 'rgba(37, 99, 235, 0.15)' : 'rgba(255,255,255,0.03)',
                  border: isSelected ? '1px solid rgba(37, 99, 235, 0.4)' : '1px solid transparent',
                  fontSize: 13,
                  color: isSelected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  transition: 'all 120ms ease',
                }}
              >
                <span style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  border: isSelected ? '2px solid #2563eb' : '2px solid rgba(255,255,255,0.2)',
                  background: isSelected ? '#2563eb' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  color: '#fff',
                  flexShrink: 0,
                }}>
                  {isSelected ? '\u2713' : ''}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {asset.filePath.split('/').pop() ?? asset.id}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Caption Card ────────────────────────────────────────────────────────────

function CaptionCard({
  segment,
  fps,
  onAccept,
  onReject,
  onUpdateText,
}: {
  segment: CaptionSegment;
  fps: number;
  onAccept: () => void;
  onReject: () => void;
  onUpdateText: (text: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(segment.text);

  const statusColor = segment.status === 'accepted' ? '#4ade80' : segment.status === 'rejected' ? '#f87171' : 'rgba(255,255,255,0.4)';
  const statusBg = segment.status === 'accepted' ? 'rgba(74, 222, 128, 0.1)' : segment.status === 'rejected' ? 'rgba(248, 113, 113, 0.1)' : 'transparent';

  return (
    <div style={{
      padding: 12,
      borderRadius: 8,
      background: statusBg || 'rgba(255,255,255,0.02)',
      border: `1px solid ${segment.status === 'accepted' ? 'rgba(74, 222, 128, 0.2)' : segment.status === 'rejected' ? 'rgba(248, 113, 113, 0.2)' : 'rgba(255,255,255,0.06)'}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      {/* Header: timecode + status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)' }}>
          {framesToTimecode(segment.startFrame, fps)} - {framesToTimecode(segment.endFrame, fps)}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {segment.status}
        </span>
      </div>

      {/* Caption text */}
      {isEditing ? (
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={() => {
            onUpdateText(editText);
            setIsEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onUpdateText(editText);
              setIsEditing(false);
            }
            if (e.key === 'Escape') {
              setEditText(segment.text);
              setIsEditing(false);
            }
          }}
          autoFocus
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: 6,
            border: '1px solid rgba(37, 99, 235, 0.4)',
            background: 'rgba(255,255,255,0.05)',
            color: 'rgba(255,255,255,0.9)',
            fontSize: 13,
            fontFamily: 'inherit',
            resize: 'vertical',
            minHeight: 40,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      ) : (
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
          {segment.text}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={onAccept}
          disabled={segment.status === 'accepted'}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: 'none',
            fontSize: 11,
            fontWeight: 600,
            cursor: segment.status === 'accepted' ? 'default' : 'pointer',
            background: segment.status === 'accepted' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(255,255,255,0.06)',
            color: segment.status === 'accepted' ? '#4ade80' : 'rgba(255,255,255,0.6)',
            transition: 'all 120ms ease',
          }}
        >
          Accept
        </button>
        <button
          onClick={onReject}
          disabled={segment.status === 'rejected'}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: 'none',
            fontSize: 11,
            fontWeight: 600,
            cursor: segment.status === 'rejected' ? 'default' : 'pointer',
            background: segment.status === 'rejected' ? 'rgba(248, 113, 113, 0.2)' : 'rgba(255,255,255,0.06)',
            color: segment.status === 'rejected' ? '#f87171' : 'rgba(255,255,255,0.6)',
            transition: 'all 120ms ease',
          }}
        >
          Reject
        </button>
        <button
          onClick={() => { setEditText(segment.text); setIsEditing(true); }}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: 'none',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            background: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.6)',
            transition: 'all 120ms ease',
          }}
        >
          Edit
        </button>
      </div>
    </div>
  );
}

// ─── Main AITab ──────────────────────────────────────────────────────────────

export function AITab({ activeTab, onTabChange }: AITabProps) {
  const projectName = useProjectStore((s) => s.project.name);
  const updateProject = useProjectStore((s) => s.updateProject);
  const assets = useProjectStore((s) => s.project.assets);
  const fps = useProjectStore((s) => s.project.settings.frameRate);
  const captionSegments = useProjectStore((s) => s.project.aiAnnotations.captionSegments);
  const addCaptionSegments = useProjectStore((s) => s.addCaptionSegments);
  const updateAnnotationStatus = useProjectStore((s) => s.updateAnnotationStatus);
  const updateCaptionText = useProjectStore((s) => s.updateCaptionText);
  const acceptAllCaptions = useProjectStore((s) => s.acceptAllCaptions);
  const rejectAllCaptions = useProjectStore((s) => s.rejectAllCaptions);
  const clearCaptions = useProjectStore((s) => s.clearCaptions);

  // Provider state
  const [provider, setProvider] = useState<Provider>('groq');
  const [apiKey, setApiKey] = useState('');
  const [isKeySaved, setIsKeySaved] = useState(false);

  // Selection state
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());

  // Analysis state
  const [analysisState, setAnalysisState] = useState<AnalysisState>('idle');
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStage, setAnalysisStage] = useState('');
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Load provider config and API key on mount
  useEffect(() => {
    window.roughcut.aiGetProviderConfig().then((config) => {
      setProvider(config.provider as Provider);
      return window.roughcut.aiGetApiKey(config.provider);
    }).then((key) => {
      if (key) {
        setApiKey(key);
        setIsKeySaved(true);
      }
    }).catch(console.error);
  }, []);

  // Load API key when provider changes
  useEffect(() => {
    window.roughcut.aiGetApiKey(provider).then((key) => {
      setApiKey(key || '');
      setIsKeySaved(!!key);
    }).catch(console.error);
  }, [provider]);

  // Subscribe to progress events
  useEffect(() => {
    const unsub = window.roughcut.onAIProgress((progress) => {
      setAnalysisProgress(progress.percent);
      setAnalysisStage(progress.stage);
      if (progress.stage === 'complete') {
        setAnalysisState('complete');
      }
    });
    return unsub;
  }, []);

  const handleProviderChange = useCallback((p: Provider) => {
    setProvider(p);
    window.roughcut.aiSetProviderConfig(p).catch(console.error);
  }, []);

  const handleSaveApiKey = useCallback(() => {
    if (apiKey.trim()) {
      window.roughcut.aiSetApiKey(provider, apiKey.trim()).then(() => {
        setIsKeySaved(true);
      }).catch(console.error);
    }
  }, [provider, apiKey]);

  const handleToggleAsset = useCallback((id: AssetId) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (selectedAssetIds.size === 0 || !apiKey) return;

    setAnalysisState('processing');
    setAnalysisProgress(0);
    setAnalysisStage('starting');
    setAnalysisError(null);

    // Clear previous results
    clearCaptions();

    const selectedAssets = assets.filter((a) => selectedAssetIds.has(a.id));
    const assetPayload = selectedAssets.map((a) => ({ id: a.id, filePath: a.filePath }));

    try {
      const segments = await window.roughcut.aiAnalyzeCaptions(assetPayload, fps);
      addCaptionSegments(segments as unknown as CaptionSegment[]);
      setAnalysisState('complete');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      setAnalysisError(message);
      setAnalysisState('error');
    }
  }, [selectedAssetIds, apiKey, assets, fps, clearCaptions, addCaptionSegments]);

  const handleCancel = useCallback(() => {
    window.roughcut.aiCancelAnalysis().catch(console.error);
    setAnalysisState('idle');
  }, []);

  const canAnalyze = selectedAssetIds.size > 0 && apiKey.trim().length > 0 && analysisState !== 'processing';
  const acceptedCount = captionSegments.filter((s) => s.status === 'accepted').length;
  const pendingCount = captionSegments.filter((s) => s.status === 'pending').length;

  return (
    <div data-testid="ai-tab-root" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0d0d0d', color: '#e8e8e8', overflow: 'hidden' }}>
      <AppHeader
        activeTab={activeTab}
        onTabChange={onTabChange}
        projectName={projectName}
        onProjectNameChange={(name) => updateProject((doc) => ({ ...doc, name }))}
      />

      {/* Feature toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: '#111',
      }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginRight: 4 }}>Feature</span>
        <button style={{
          padding: '4px 12px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 500,
          border: 'none',
          cursor: 'pointer',
          background: 'rgba(255,255,255,0.10)',
          color: 'rgba(255,255,255,0.96)',
        }}>
          Auto-Captions
        </button>

        {/* Analysis status */}
        {analysisState === 'processing' && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 120,
              height: 4,
              borderRadius: 2,
              background: 'rgba(255,255,255,0.06)',
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${analysisProgress}%`,
                height: '100%',
                background: '#2563eb',
                borderRadius: 2,
                transition: 'width 300ms ease',
              }} />
            </div>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
              {analysisStage}... {analysisProgress}%
            </span>
            <button
              onClick={handleCancel}
              style={{
                padding: '2px 8px',
                borderRadius: 4,
                border: 'none',
                fontSize: 11,
                cursor: 'pointer',
                background: 'rgba(248, 113, 113, 0.15)',
                color: '#f87171',
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Main content — two columns */}
      <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'row', minHeight: 0 }}>
        {/* Left panel */}
        <div style={{
          width: 320,
          minWidth: 320,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          padding: 16,
          gap: 16,
          overflow: 'auto',
        }}>
          <ProviderConfig
            provider={provider}
            onProviderChange={handleProviderChange}
            apiKey={apiKey}
            onApiKeyChange={setApiKey}
            onApiKeySave={handleSaveApiKey}
            isSaved={isKeySaved}
          />

          <AssetSelector
            assets={assets}
            selectedIds={selectedAssetIds}
            onToggle={handleToggleAsset}
          />

          {/* Analyze button */}
          <button
            onClick={handleAnalyze}
            disabled={!canAnalyze}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              cursor: canAnalyze ? 'pointer' : 'not-allowed',
              background: canAnalyze ? '#2563eb' : 'rgba(255,255,255,0.05)',
              color: canAnalyze ? '#fff' : 'rgba(255,255,255,0.3)',
              transition: 'all 120ms ease',
            }}
          >
            {analysisState === 'processing' ? 'Analyzing...' : 'Analyze'}
          </button>

          {/* Error message */}
          {analysisError && (
            <div style={{
              padding: 10,
              borderRadius: 6,
              background: 'rgba(248, 113, 113, 0.1)',
              border: '1px solid rgba(248, 113, 113, 0.2)',
              fontSize: 12,
              color: '#f87171',
            }}>
              {analysisError}
            </div>
          )}
        </div>

        {/* Right panel: results */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}>
          {captionSegments.length === 0 ? (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            }}>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', textAlign: 'center', maxWidth: 360 }}>
                {analysisState === 'processing'
                  ? 'Analyzing audio... This may take a moment.'
                  : 'Select assets and configure your AI provider, then click Analyze to generate captions.'}
              </div>
            </div>
          ) : (
            <>
              {/* Results header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 20px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
                  {captionSegments.length} caption{captionSegments.length !== 1 ? 's' : ''} generated
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={acceptAllCaptions}
                    disabled={pendingCount === 0}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: 'none',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: pendingCount === 0 ? 'default' : 'pointer',
                      background: pendingCount > 0 ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255,255,255,0.04)',
                      color: pendingCount > 0 ? '#4ade80' : 'rgba(255,255,255,0.3)',
                    }}
                  >
                    Accept All
                  </button>
                  <button
                    onClick={rejectAllCaptions}
                    disabled={pendingCount === 0}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: 'none',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: pendingCount === 0 ? 'default' : 'pointer',
                      background: pendingCount > 0 ? 'rgba(248, 113, 113, 0.15)' : 'rgba(255,255,255,0.04)',
                      color: pendingCount > 0 ? '#f87171' : 'rgba(255,255,255,0.3)',
                    }}
                  >
                    Reject All
                  </button>
                </div>
              </div>

              {/* Scrollable results list */}
              <div style={{
                flex: 1,
                overflow: 'auto',
                padding: '12px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                {captionSegments.map((segment) => (
                  <CaptionCard
                    key={segment.id}
                    segment={segment}
                    fps={fps}
                    onAccept={() => updateAnnotationStatus(segment.id as AIAnnotationId, 'accepted')}
                    onReject={() => updateAnnotationStatus(segment.id as AIAnnotationId, 'rejected')}
                    onUpdateText={(text) => updateCaptionText(segment.id as AIAnnotationId, text)}
                  />
                ))}
              </div>

              {/* Bottom action bar */}
              {acceptedCount > 0 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 20px',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(255,255,255,0.02)',
                }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                    {acceptedCount} caption{acceptedCount !== 1 ? 's' : ''} accepted
                  </span>
                  <button style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: 'none',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: '#2563eb',
                    color: '#fff',
                    transition: 'all 120ms ease',
                  }}>
                    Apply Accepted to Timeline
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
