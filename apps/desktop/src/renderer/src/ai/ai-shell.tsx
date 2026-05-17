// AI app view — Claude-powered editing suggestions for the open project.
//
// Pure UI: receives the project's structural facts (duration, fps, existing
// cuts) and a set of apply callbacks. The shell never touches the
// ProjectDocument directly; main.tsx owns mutation through its existing
// helpers (addManualMarkerAtFrame, addCutRange, applyProjectChange). This
// keeps the renderer's mutation surface in one place.
//
// Suggestions are validated in the renderer (validateSuggestion from
// project-model) *before* the Apply button is enabled, so a malformed model
// response can't corrupt the project document.

import * as React from 'react';
import {
  validateSuggestion,
  type AiSuggestion,
  type AiAnalysis,
  type AiValidationError,
  type AiZoomMarkerSuggestion,
  type AiCutRangeSuggestion,
  type AiTitleSuggestion,
} from '@rough-cut/project-model';

type ProjectLike = { path: string; document: unknown };

type RoughCutBridge = {
  getAiKeyStatus: () => Promise<{ configured: boolean; source: 'env' | 'userData' | null }>;
  setAiApiKey: (apiKey: string) => Promise<{ ok: true }>;
  analyzeProjectWithAi: (payload: {
    project: ProjectLike;
    recordingDurationFrames: number;
    fps: number;
  }) => Promise<AiAnalysis | { error: { code: string; message: string } }>;
};

type Props = {
  project: ProjectLike | null;
  fps: number;
  recordingDurationFrames: number;
  existingCutRanges: ReadonlyArray<{ startFrame: number; endFrame: number }>;
  onApplyZoomMarker: (suggestion: AiZoomMarkerSuggestion) => void;
  onApplyCutRange: (suggestion: AiCutRangeSuggestion) => void;
  onApplyTitle: (suggestion: AiTitleSuggestion) => void;
  onGoToProjects: () => void;
};

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'analyzed'; analysis: AiAnalysis };

function bridge(): RoughCutBridge | null {
  const win = window as unknown as { roughCut?: RoughCutBridge };
  return win.roughCut ?? null;
}

export function AiShell(props: Props): React.ReactElement {
  const {
    project,
    fps,
    recordingDurationFrames,
    existingCutRanges,
    onApplyZoomMarker,
    onApplyCutRange,
    onApplyTitle,
    onGoToProjects,
  } = props;
  const [keyStatus, setKeyStatus] = React.useState<{ configured: boolean; source: string | null } | null>(null);
  const [keyDraft, setKeyDraft] = React.useState('');
  const [keySaving, setKeySaving] = React.useState(false);
  const [keyError, setKeyError] = React.useState<string | null>(null);
  const [load, setLoad] = React.useState<LoadState>({ kind: 'idle' });
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());
  const [applied, setApplied] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    const b = bridge();
    if (!b) return;
    b.getAiKeyStatus().then(setKeyStatus).catch(() => setKeyStatus({ configured: false, source: null }));
  }, []);

  async function onSaveKey() {
    const b = bridge();
    if (!b) return;
    setKeySaving(true);
    setKeyError(null);
    try {
      await b.setAiApiKey(keyDraft);
      setKeyStatus({ configured: true, source: 'userData' });
      setKeyDraft('');
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : String(err));
    } finally {
      setKeySaving(false);
    }
  }

  async function onAnalyze() {
    const b = bridge();
    if (!b || !project) return;
    setLoad({ kind: 'loading' });
    setDismissed(new Set());
    setApplied(new Set());
    try {
      const result = await b.analyzeProjectWithAi({ project, recordingDurationFrames, fps });
      if ('error' in result) {
        setLoad({ kind: 'error', message: `${result.error.code}: ${result.error.message}` });
        return;
      }
      setLoad({ kind: 'analyzed', analysis: result });
    } catch (err) {
      setLoad({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  if (!project) {
    return (
      <section className="aiShell" data-ui-region="ai-workspace" aria-label="AI assistant">
        <div className="aiEmptyState">
          <h2>No project open</h2>
          <p>Open a project in Recording edit to get AI editing suggestions.</p>
          <button type="button" className="primary" onClick={onGoToProjects}>
            Go to Projects
          </button>
        </div>
      </section>
    );
  }

  if (keyStatus && !keyStatus.configured) {
    return (
      <section className="aiShell" data-ui-region="ai-workspace" aria-label="AI assistant">
        <div className="aiEmptyState">
          <h2>Set your Anthropic API key</h2>
          <p>
            The AI view uses Claude. Paste an API key (starts with{' '}
            <code>sk-ant-</code>) — or set <code>ANTHROPIC_API_KEY</code> in
            your environment. Keys are stored locally with 0600 permissions.
          </p>
          <input
            type="password"
            value={keyDraft}
            onChange={(event) => setKeyDraft(event.target.value)}
            placeholder="sk-ant-…"
            className="aiKeyInput"
            autoComplete="off"
            spellCheck={false}
          />
          <div className="aiKeyActions">
            <button
              type="button"
              className="primary"
              onClick={() => void onSaveKey()}
              disabled={keySaving || keyDraft.trim().length === 0}
            >
              {keySaving ? 'Saving…' : 'Save key'}
            </button>
            {keyError ? <span className="aiKeyError">{keyError}</span> : null}
          </div>
        </div>
      </section>
    );
  }

  const suggestions = load.kind === 'analyzed' ? load.analysis.suggestions : [];
  const visible = suggestions.filter((s) => !dismissed.has(s.id));
  const validationCtx = {
    recordingDurationFrames,
    existingCutRanges,
  };

  function onApply(suggestion: AiSuggestion) {
    if (suggestion.kind === 'zoom-marker') onApplyZoomMarker(suggestion);
    else if (suggestion.kind === 'cut-range') onApplyCutRange(suggestion);
    else if (suggestion.kind === 'title') onApplyTitle(suggestion);
    setApplied((prev) => new Set(prev).add(suggestion.id));
  }

  return (
    <section className="aiShell" data-ui-region="ai-workspace" aria-label="AI assistant">
      <header className="aiHeader">
        <div>
          <h2>AI suggestions</h2>
          {keyStatus?.source === 'env' ? (
            <p className="aiHeaderHint">Using ANTHROPIC_API_KEY from your environment.</p>
          ) : keyStatus?.source === 'userData' ? (
            <p className="aiHeaderHint">Using saved API key.</p>
          ) : null}
        </div>
        <button
          type="button"
          className="primary"
          onClick={() => void onAnalyze()}
          disabled={load.kind === 'loading'}
        >
          {load.kind === 'loading' ? 'Analyzing…' : load.kind === 'analyzed' ? 'Re-run analysis' : 'Run analysis'}
        </button>
      </header>

      {load.kind === 'error' ? (
        <div className="aiBanner aiBannerError" role="alert">
          {load.message}
        </div>
      ) : null}

      {load.kind === 'analyzed' ? (
        <div className="aiSummary">
          <h3>Summary</h3>
          <p>{load.analysis.summary || 'No summary returned.'}</p>
        </div>
      ) : null}

      <div className="aiSuggestionList" role="list">
        {visible.length === 0 && load.kind === 'analyzed' ? (
          <p className="aiEmptyHint">Claude didn't suggest anything to change. Nice recording.</p>
        ) : null}
        {visible.length === 0 && load.kind === 'idle' ? (
          <p className="aiEmptyHint">Click <strong>Run analysis</strong> to get editing suggestions.</p>
        ) : null}
        {visible.map((suggestion) => {
          const validationError = validateSuggestion(suggestion, validationCtx);
          const isApplied = applied.has(suggestion.id);
          return (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              fps={fps}
              validationError={validationError}
              applied={isApplied}
              onDismiss={() => setDismissed((prev) => new Set(prev).add(suggestion.id))}
              onApply={() => {
                if (validationError || isApplied) return;
                onApply(suggestion);
              }}
            />
          );
        })}
      </div>
    </section>
  );
}

function SuggestionCard({
  suggestion,
  fps,
  validationError,
  applied,
  onApply,
  onDismiss,
}: {
  suggestion: AiSuggestion;
  fps: number;
  validationError: AiValidationError | null;
  applied: boolean;
  onApply: () => void;
  onDismiss: () => void;
}): React.ReactElement {
  const label = suggestionLabel(suggestion, fps);
  return (
    <article
      className={`aiSuggestionCard ${applied ? 'applied' : ''} ${validationError ? 'invalid' : ''}`}
      role="listitem"
      data-suggestion-kind={suggestion.kind}
    >
      <div className="aiSuggestionBody">
        <span className="aiSuggestionKind">{labelForKind(suggestion.kind)}</span>
        <h4>{label}</h4>
        {suggestion.kind !== 'title' ? <p>{suggestion.rationale || 'No rationale provided.'}</p> : null}
        {suggestion.kind === 'title' ? <p>{suggestion.description || ''}</p> : null}
        {validationError ? (
          <p className="aiValidationError">Rejected: {validationError.detail}</p>
        ) : null}
      </div>
      <div className="aiSuggestionActions">
        <button
          type="button"
          className="primary compact"
          onClick={onApply}
          disabled={Boolean(validationError) || applied}
          title={validationError ? validationError.detail : undefined}
        >
          {applied ? 'Applied' : 'Apply'}
        </button>
        <button type="button" className="secondary compact" onClick={onDismiss} disabled={applied}>
          Dismiss
        </button>
      </div>
    </article>
  );
}

function suggestionLabel(suggestion: AiSuggestion, fps: number): string {
  if (suggestion.kind === 'title') return suggestion.title;
  const startS = ((suggestion.startFrame as unknown as number) / fps).toFixed(1);
  const endS = ((suggestion.endFrame as unknown as number) / fps).toFixed(1);
  return `${startS}s — ${endS}s`;
}

function labelForKind(kind: AiSuggestion['kind']): string {
  if (kind === 'zoom-marker') return 'Zoom marker';
  if (kind === 'cut-range') return 'Cut range';
  return 'Title';
}
