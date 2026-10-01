// AI app view — editing suggestions for the open project.
//
// Pure UI: receives the project's structural facts (duration, fps, existing
// cuts) and a set of apply callbacks. The shell never touches the
// ProjectDocument directly; main.tsx owns mutation through its existing
// helpers (addManualMarkerAtFrame, addCutRange, applyProjectChange). This
// keeps the renderer's mutation surface in one place.
//
// Suggestions are validated in the renderer (validateSuggestion from
// project-model) *before* Apply is enabled, so a malformed model response
// can't corrupt the project document.
//
// Layout (2026-10-01 redesign): a map of the whole recording showing where
// every suggestion falls, then suggestions grouped by kind — Dead air (measured
// from the audio), Cuts, Zooms, Title — as compact rows with Show / Apply /
// Dismiss, and "Apply all" per group as one undo step.

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
  getAiStatus: () => Promise<{ available: boolean; reason: string | null }>;
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
  /** Several cuts as ONE change (one undo step). */
  onApplyCutRanges: (suggestions: AiCutRangeSuggestion[]) => void;
  onApplyTitle: (suggestion: AiTitleSuggestion) => void;
  /** Open Recording edit at this source frame. */
  onShowFrame: (frame: number) => void;
  onGoToProjects: () => void;
};

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading'; startedAt: number }
  | { kind: 'error'; message: string }
  | { kind: 'analyzed'; analysis: AiAnalysis };

type GroupId = 'silence' | 'cut' | 'zoom' | 'title';

const GROUPS: readonly { id: GroupId; label: string; empty: string }[] = [
  { id: 'silence', label: 'Dead air', empty: 'No long silences found.' },
  { id: 'cut', label: 'Cuts', empty: '' },
  { id: 'zoom', label: 'Zooms', empty: '' },
  { id: 'title', label: 'Title', empty: '' },
];

function groupOf(suggestion: AiSuggestion): GroupId {
  if (suggestion.kind === 'cut-range') return suggestion.id.startsWith('ai-silence') ? 'silence' : 'cut';
  if (suggestion.kind === 'zoom-marker') return 'zoom';
  return 'title';
}

function bridge(): RoughCutBridge | null {
  const win = window as unknown as { roughCut?: RoughCutBridge };
  return win.roughCut ?? null;
}

function clock(frame: number, fps: number) {
  const seconds = Math.max(0, frame / (fps || 30));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(1).padStart(4, '0')}`;
}

function spanSec(s: { startFrame: unknown; endFrame: unknown }, fps: number) {
  return ((s.endFrame as number) - (s.startFrame as number)) / (fps || 30);
}

export function AiShell(props: Props): React.ReactElement {
  const {
    project,
    fps,
    recordingDurationFrames,
    existingCutRanges,
    onApplyZoomMarker,
    onApplyCutRange,
    onApplyCutRanges,
    onApplyTitle,
    onShowFrame,
    onGoToProjects,
  } = props;
  const [status, setStatus] = React.useState<{ available: boolean; reason: string | null } | null>(null);
  const [load, setLoad] = React.useState<LoadState>({ kind: 'idle' });
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());
  const [applied, setApplied] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    const b = bridge();
    if (!b) return;
    b.getAiStatus().then(setStatus).catch(() => setStatus({ available: false, reason: 'Could not check for Claude Code.' }));
  }, []);

  async function onAnalyze() {
    const b = bridge();
    if (!b || !project) return;
    setLoad({ kind: 'loading', startedAt: Date.now() });
    setDismissed(new Set());
    setApplied(new Set());
    try {
      const result = await b.analyzeProjectWithAi({ project, recordingDurationFrames, fps });
      if ('error' in result) {
        setLoad({ kind: 'error', message: result.error.message });
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

  if (status && !status.available) {
    return (
      <section className="aiShell" data-ui-region="ai-workspace" aria-label="AI assistant">
        <div className="aiEmptyState">
          <h2>Claude Code is needed</h2>
          <p>{status.reason ?? 'Install Claude Code and sign in by running claude once.'}</p>
        </div>
      </section>
    );
  }

  const suggestions = load.kind === 'analyzed' ? load.analysis.suggestions : [];
  const visible = suggestions.filter((s) => !dismissed.has(s.id));
  const validationCtx = { recordingDurationFrames, existingCutRanges };
  // A cut counts as applied when the project really has it — so Undo in the
  // editor turns its row back into "Cut". Zooms and the title use the session.
  const isApplied = (s: AiSuggestion) => (s.kind === 'cut-range'
    ? existingCutRanges.some((cut) => cut.startFrame <= (s.startFrame as unknown as number) && cut.endFrame >= (s.endFrame as unknown as number))
    : applied.has(s.id));
  const errors = new Map<string, AiValidationError | null>(visible.map((s) => [s.id, isApplied(s) ? null : validateSuggestion(s, validationCtx)]));

  function markApplied(ids: string[]) {
    setApplied((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }

  function applyOne(suggestion: AiSuggestion) {
    if (isApplied(suggestion) || errors.get(suggestion.id)) return;
    if (suggestion.kind === 'zoom-marker') onApplyZoomMarker(suggestion);
    else if (suggestion.kind === 'cut-range') onApplyCutRange(suggestion);
    else if (suggestion.kind === 'title') onApplyTitle(suggestion);
    markApplied([suggestion.id]);
  }

  function applyGroup(items: AiSuggestion[]) {
    const ready = items.filter((s) => !isApplied(s) && !errors.get(s.id));
    if (ready.length === 0) return;
    const cuts = ready.filter((s): s is AiCutRangeSuggestion => s.kind === 'cut-range');
    if (cuts.length > 0) onApplyCutRanges(cuts);
    for (const s of ready) if (s.kind !== 'cut-range') applyOne(s);
    markApplied(ready.map((s) => s.id));
  }

  const grouped = GROUPS.map((group) => ({ ...group, items: visible.filter((s) => groupOf(s) === group.id) }))
    .filter((group) => group.items.length > 0 || (group.id === 'silence' && load.kind === 'analyzed'));

  return (
    <section className="aiShell" data-ui-region="ai-workspace" aria-label="AI assistant">
      <header className="aiHeader">
        <div className="aiHeaderText">
          <h2>AI edit</h2>
          <p className="aiHeaderHint">Dead air is measured from your audio on this computer; other ideas come from your Claude Code login.</p>
        </div>
        <button
          type="button"
          className="primary"
          onClick={() => void onAnalyze()}
          disabled={load.kind === 'loading'}
          data-ai-run="true"
        >
          {load.kind === 'loading' ? 'Reviewing…' : load.kind === 'analyzed' ? 'Review again' : 'Review recording'}
        </button>
      </header>

      {load.kind === 'loading' ? <AiWorking startedAt={load.startedAt} /> : null}

      {load.kind === 'error' ? (
        <div className="aiBanner aiBannerError" role="alert">
          <strong>The review did not finish.</strong> {load.message}
        </div>
      ) : null}

      {load.kind === 'idle' ? (
        <p className="aiEmptyHint">Review the recording to find dead air, retakes and moments worth a zoom. Nothing changes until you apply it.</p>
      ) : null}

      {load.kind === 'analyzed' ? (
        <>
          {load.analysis.summary ? <p className="aiSummaryText">{load.analysis.summary}</p> : null}
          <SuggestionMap
            suggestions={visible}
            isApplied={isApplied}
            durationFrames={recordingDurationFrames}
            fps={fps}
            onShow={(s) => onShowFrame(s.kind === 'title' ? 0 : (s.startFrame as unknown as number))}
          />
          {visible.length === 0 ? <p className="aiEmptyHint">Nothing to change — the recording reads clean.</p> : null}
          <div className="aiGroups">
            {grouped.map((group) => {
              const pending = group.items.filter((s) => !isApplied(s) && !errors.get(s.id));
              const seconds = group.items.reduce((sum, s) => sum + (s.kind === 'title' ? 0 : spanSec(s, fps)), 0);
              return (
                <section key={group.id} className="aiGroup" data-ai-group={group.id} aria-label={group.label}>
                  <header className="aiGroupHead">
                    <h3>
                      <span className={`aiGroupSwatch aiKind-${group.id}`} aria-hidden="true" />
                      {group.label}
                      <span className="aiGroupMeta">
                        {group.items.length}
                        {group.id === 'silence' || group.id === 'cut' ? ` · ${seconds.toFixed(1)} s` : ''}
                      </span>
                    </h3>
                    {group.items.length > 1 ? (
                      <button type="button" className="secondary compact" disabled={pending.length === 0} onClick={() => applyGroup(group.items)} data-ai-apply-all={group.id}>
                        {pending.length === 0 ? 'All applied' : group.id === 'silence' || group.id === 'cut' ? `Cut all ${pending.length}` : `Apply all ${pending.length}`}
                      </button>
                    ) : null}
                  </header>
                  {group.items.length === 0 ? <p className="aiGroupEmpty">{group.empty}</p> : (
                    <ol className="aiRows">
                      {group.items.map((s) => (
                        <SuggestionRow
                          key={s.id}
                          suggestion={s}
                          group={group.id}
                          fps={fps}
                          applied={isApplied(s)}
                          error={errors.get(s.id) ?? null}
                          onShow={() => onShowFrame(s.kind === 'title' ? 0 : (s.startFrame as unknown as number))}
                          onApply={() => applyOne(s)}
                          onDismiss={() => setDismissed((prev) => new Set(prev).add(s.id))}
                        />
                      ))}
                    </ol>
                  )}
                </section>
              );
            })}
          </div>
        </>
      ) : null}
    </section>
  );
}

/** Where every suggestion falls in the recording; click a mark to jump there. */
function SuggestionMap({ suggestions, isApplied, durationFrames, fps, onShow }: {
  suggestions: AiSuggestion[];
  isApplied: (s: AiSuggestion) => boolean;
  durationFrames: number;
  fps: number;
  onShow: (s: AiSuggestion) => void;
}) {
  const total = Math.max(1, durationFrames);
  const ranged = suggestions.filter((s) => s.kind !== 'title') as (AiCutRangeSuggestion | AiZoomMarkerSuggestion)[];
  return (
    <div className="aiMap" aria-label="Where the suggestions are in the recording">
      <div className="aiMapTrack">
        {ranged.map((s) => {
          const start = s.startFrame as unknown as number;
          const end = s.endFrame as unknown as number;
          return (
            <button
              key={s.id}
              type="button"
              className={`aiMapMark aiKind-${groupOf(s)}${isApplied(s) ? ' isApplied' : ''}`}
              style={{ left: `${(start / total) * 100}%`, width: `max(3px, ${((end - start) / total) * 100}%)` }}
              title={`${clock(start, fps)} – ${clock(end, fps)}`}
              aria-label={`Show ${clock(start, fps)}`}
              onClick={() => onShow(s)}
            />
          );
        })}
      </div>
      <div className="aiMapScale" aria-hidden="true"><span>0:00</span><span>{clock(total, fps)}</span></div>
    </div>
  );
}

function SuggestionRow({ suggestion, group, fps, applied, error, onShow, onApply, onDismiss }: {
  suggestion: AiSuggestion;
  group: GroupId;
  fps: number;
  applied: boolean;
  error: AiValidationError | null;
  onShow: () => void;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const ranged = suggestion.kind !== 'title';
  const why = suggestion.kind === 'title'
    ? suggestion.description || ''
    : group === 'silence' ? 'No speech' : suggestion.rationale || '';
  return (
    <li className={`aiRow${applied ? ' isApplied' : ''}${error ? ' isInvalid' : ''}`} data-suggestion-kind={suggestion.kind} data-ai-row={suggestion.id}>
      {ranged ? (
        <button type="button" className="aiRowTime" onClick={onShow} title="Show this moment in Recording edit">
          {clock(suggestion.startFrame as unknown as number, fps)}<span aria-hidden="true">–</span>{clock(suggestion.endFrame as unknown as number, fps)}
        </button>
      ) : (
        <span className="aiRowTitle" dir="auto">{suggestion.title}</span>
      )}
      {ranged ? <span className="aiRowLength">{spanSec(suggestion, fps).toFixed(1)} s</span> : null}
      <span className="aiRowWhy" dir="auto" title={why}>{error ? `Can't apply: ${error.detail}` : why}</span>
      <span className="aiRowActions">
        {applied ? (
          <span className="aiRowDone">Applied</span>
        ) : (
          <>
            <button type="button" className="secondary compact" onClick={onApply} disabled={Boolean(error)} data-ai-apply={suggestion.id}>
              {suggestion.kind === 'cut-range' ? 'Cut' : suggestion.kind === 'zoom-marker' ? 'Add zoom' : 'Use title'}
            </button>
            <button type="button" className="aiRowDismiss" onClick={onDismiss} aria-label="Dismiss this suggestion" title="Dismiss">×</button>
          </>
        )}
      </span>
    </li>
  );
}

/** Working state: the scan runs locally first, then Claude reviews. */
function AiWorking({ startedAt }: { startedAt: number }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);
  const elapsed = Math.round((now - startedAt) / 1000);
  return (
    <div className="aiWorking" role="status" aria-live="polite" data-ai-working="true">
      <div className="aiWorkingText">
        <span>{elapsed < 4 ? 'Listening for silences…' : 'Claude is reviewing the recording…'}</span>
        <span className="aiWorkingTime">{elapsed} s</span>
      </div>
      <div className="aiWorkingTrack"><div className="aiWorkingSweep" /></div>
    </div>
  );
}
