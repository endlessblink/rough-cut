import React from 'react';
import { StyledVideoPreview, type StyledPreviewProject } from './styled-video-preview';

type FreecutUrlResult = {
  ok: boolean;
  url?: string;
  reason?: string;
};

export type FreecutProgramProject = StyledPreviewProject & {
  document: StyledPreviewProject['document'] & { id?: string };
};

type FreecutEditorSurfaceProps = {
  projectId: string | null;
  project: FreecutProgramProject | null;
  currentTimeSec: number;
  cutRanges: Array<{ id: string; startFrame: number; endFrame: number }>;
  onCurrentTimeSecChange: (seconds: number) => void;
};

export function FreecutEditorSurface({
  projectId,
  project,
  currentTimeSec,
  cutRanges,
  onCurrentTimeSecChange,
}: FreecutEditorSurfaceProps) {
  const [result, setResult] = React.useState<FreecutUrlResult | null>(null);
  const [mode, setMode] = React.useState<'program' | 'source'>('program');

  React.useEffect(() => {
    if (!projectId) {
      setResult(null);
      return undefined;
    }
    let cancelled = false;
    window.roughCut.getFreecutEditorUrl(projectId)
      .then((next) => {
        if (!cancelled) setResult(next);
      })
      .catch((error) => {
        if (!cancelled) {
          setResult({
            ok: false,
            reason: error instanceof Error ? error.message : 'FreeCut could not be loaded.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (result?.ok && result.url) {
    return (
      <section className={`freecutEditorSurface freecutEditorSurface-${mode}`} data-ui-region="freecut-editor-surface" aria-label="FreeCut editor">
        <div className="freecutEditorModeBar" role="tablist" aria-label="FreeCut editor view">
          <button type="button" role="tab" aria-selected={mode === 'program'} onClick={() => setMode('program')}>Program</button>
          <button type="button" role="tab" aria-selected={mode === 'source'} onClick={() => setMode('source')}>Source</button>
          <span>{mode === 'program' ? 'Rough Cut program preview' : 'FreeCut native canvas'}</span>
        </div>
        {mode === 'program' && project ? (
          <div className="freecutProgramWorkspace">
            <div className="freecutProgramMonitor" data-ui-region="freecut-program-monitor" aria-label="Rough Cut program preview">
              <StyledVideoPreview
                project={project}
                seekTimeSec={currentTimeSec}
                timeMode="timeline"
                cutRanges={cutRanges}
                onCurrentTimeChange={onCurrentTimeSecChange}
                showControls
              />
            </div>
          </div>
        ) : (
          <iframe
            className="freecutEditorFrame"
            title="FreeCut editor"
            src={result.url}
            allow="clipboard-read; clipboard-write"
          />
        )}
      </section>
    );
  }

  return (
    <section className="freecutEditorSurface freecutEditorSurfaceStatus" data-ui-region="freecut-editor-surface" aria-label="FreeCut editor">
      <div>
        <strong>{result ? 'FreeCut is unavailable' : 'Loading FreeCut'}</strong>
        {result?.reason ? <p>{result.reason}</p> : null}
      </div>
    </section>
  );
}
