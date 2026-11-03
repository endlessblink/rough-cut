import React from 'react';
import { clampVoiceCleanAmount } from './voice-clean-mix.mjs';

// "Clean voice" in the editor: one button to make the cleaned voice (a GPU job
// in the main process, cached next to the recording), then an Amount slider
// that mixes it in live at playback. Dev/local only for now (needs the
// setup-voice-clean.sh env and an NVIDIA card); without them it only says so.

export type VoiceCleanReason = 'needs-setup' | 'needs-nvidia-gpu' | null;

export type VoiceCleanStatus = {
  available: boolean;
  reason: VoiceCleanReason;
  state: 'none' | 'running' | 'ready';
  phase: string | null;
  progress: number;
  cleanedMediaUrl: string | null;
};

export type VoiceCleanProgress = { sourcePath: string; phase: string; progress: number };

export type VoiceCleanBridge = {
  getVoiceCleanStatus: (payload: { sourcePath: string }) => Promise<VoiceCleanStatus>;
  startVoiceClean: (payload: { sourcePath: string }) => Promise<{ status: VoiceCleanStatus } | { error: { code: string; message: string } }>;
  cancelVoiceClean: (payload: { sourcePath: string }) => Promise<{ cancelled: boolean }>;
  onVoiceCleanProgress: (callback: (progress: VoiceCleanProgress) => void) => () => void;
};

export type VoiceCleanController = {
  status: VoiceCleanStatus | null;
  /** Amount heard right now: the slider while dragging, else the saved value. */
  amount: number;
  error: string | null;
  start: () => void;
  cancel: () => void;
  setDraftAmount: (amount: number) => void;
  commitAmount: (amount: number) => void;
  /** What the preview mixes; null keeps the old audio path. */
  preview: { url: string; amount: number } | null;
};

export const VoiceCleanContext = React.createContext<VoiceCleanController | null>(null);

function bridge(): VoiceCleanBridge | null {
  const api = (typeof window !== 'undefined' ? (window as unknown as { roughCut?: Partial<VoiceCleanBridge> }).roughCut : undefined);
  return api?.getVoiceCleanStatus && api.startVoiceClean && api.cancelVoiceClean && api.onVoiceCleanProgress
    ? (api as VoiceCleanBridge)
    : null;
}

function friendlyError(code: string, message: string) {
  if (code === 'needs-setup') return 'Clean voice is not set up on this computer yet.';
  if (code === 'needs-nvidia-gpu') return 'Clean voice needs an NVIDIA graphics card.';
  if (code === 'invalid-source') return 'This project has no recording sound to clean.';
  if (/out of memory/i.test(message)) return 'The graphics card ran out of memory. Close other GPU apps and try again.';
  return 'Cleaning did not finish. Your recording is unchanged.';
}

export function useVoiceCleanController({
  sourcePath,
  savedAmount,
  onCommitAmount,
}: {
  sourcePath: string | null;
  savedAmount: number;
  onCommitAmount: (amount: number) => void;
}): VoiceCleanController {
  const [status, setStatus] = React.useState<VoiceCleanStatus | null>(null);
  const [draft, setDraft] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const commitRef = React.useRef(onCommitAmount);
  commitRef.current = onCommitAmount;
  const savedRef = React.useRef(savedAmount);
  savedRef.current = savedAmount;

  const refresh = React.useCallback(async () => {
    const api = bridge();
    if (!api || !sourcePath) return;
    try {
      setStatus(await api.getVoiceCleanStatus({ sourcePath }));
    } catch {
      setStatus({ available: false, reason: 'needs-setup', state: 'none', phase: null, progress: 0, cleanedMediaUrl: null });
    }
  }, [sourcePath]);

  React.useEffect(() => {
    setStatus(null);
    setDraft(null);
    setError(null);
    const api = bridge();
    if (!api || !sourcePath) return undefined;
    void refresh();
    return api.onVoiceCleanProgress((progress) => {
      if (progress.sourcePath !== sourcePath || progress.phase === 'ready') return;
      setStatus((previous) => previous ? { ...previous, state: 'running', phase: progress.phase, progress: progress.progress } : previous);
    });
  }, [sourcePath, refresh]);

  const start = React.useCallback(() => {
    const api = bridge();
    if (!api || !sourcePath) return;
    setError(null);
    setStatus((previous) => previous ? { ...previous, state: 'running', phase: 'queued', progress: 0 } : previous);
    void api.startVoiceClean({ sourcePath }).then((result) => {
      if ('error' in result) {
        if (result.error.code !== 'cancelled') setError(friendlyError(result.error.code, result.error.message));
        void refresh();
        return;
      }
      setStatus(result.status);
      // First clean: turn it on fully so the result is heard right away.
      if (savedRef.current <= 0) commitRef.current(1);
    }).catch(() => {
      setError(friendlyError('failed', ''));
      void refresh();
    });
  }, [sourcePath, refresh]);

  const cancel = React.useCallback(() => {
    const api = bridge();
    if (api && sourcePath) void api.cancelVoiceClean({ sourcePath });
  }, [sourcePath]);

  const setDraftAmount = React.useCallback((amount: number) => setDraft(clampVoiceCleanAmount(amount)), []);
  const commitAmount = React.useCallback((amount: number) => {
    const value = clampVoiceCleanAmount(amount);
    setDraft(null);
    if (Math.abs(value - savedRef.current) > 1e-9) commitRef.current(value);
  }, []);

  const amount = draft ?? clampVoiceCleanAmount(savedAmount);
  const url = status?.state === 'ready' ? status.cleanedMediaUrl : null;
  const preview = React.useMemo(() => (url && amount > 0 ? { url, amount } : null), [url, amount]);
  return { status, amount, error, start, cancel, setDraftAmount, commitAmount, preview };
}

export function VoiceCleanPanel({ disabled = false }: { disabled?: boolean }) {
  const controller = React.useContext(VoiceCleanContext);
  if (!controller) return null;
  const { status, amount, error } = controller;
  const percent = Math.round(amount * 100);
  const state = status?.state ?? 'none';
  const unavailable = status && !status.available && state === 'none';
  const stateLabel = !status
    ? 'Checking…'
    : state === 'ready'
      ? (percent > 0 ? 'On' : 'Off')
      : state === 'running'
        ? 'Working'
        : unavailable
          ? 'Unavailable'
          : 'Not cleaned yet';

  return (
    <section className="capPanel voiceClean" aria-label="Clean voice" data-ui-region="voice-clean-panel" data-voice-clean-state={unavailable ? 'unavailable' : state}>
      <header className="capHead">
        <h2>Clean voice</h2>
        <span className="voiceCleanState">{stateLabel}</span>
      </header>
      {state === 'ready' ? (
        <>
          <VoiceCleanAmountSlider
            value={amount}
            disabled={disabled}
            onDraft={controller.setDraftAmount}
            onCommit={controller.commitAmount}
          />
          <p className="capMessage">{percent === 0 ? 'Off: you hear your original sound.' : 'Plays live. Your recording file is not changed.'}</p>
        </>
      ) : state === 'running' ? (
        <div className="capProgress" role="status">
          <span>{status?.phase === 'queued' ? 'Waiting…' : status?.phase === 'extracting' ? 'Reading sound…' : `Cleaning… ${Math.round((status?.progress ?? 0) * 100)}%`}</span>
          <div className="capBar"><b style={{ width: `${Math.max(3, Math.round((status?.progress ?? 0) * 100))}%` }} /></div>
          <button type="button" className="capLink" onClick={controller.cancel}>Cancel</button>
        </div>
      ) : unavailable ? (
        <p className="capMessage">
          {status?.reason === 'needs-nvidia-gpu' ? 'Needs an NVIDIA graphics card.' : 'Needs setup on this computer first.'}
        </p>
      ) : (
        <div className="voiceCleanStart">
          <p className="capMessage">Removes background noise from your voice. Takes a few minutes for a long video.</p>
          <button type="button" className="secondary compact" disabled={disabled || !status} onClick={controller.start}>Clean my voice</button>
        </div>
      )}
      {error ? <p className="capMessage error" role="alert">{error}</p> : null}
    </section>
  );
}

function VoiceCleanAmountSlider({ value, disabled, onDraft, onCommit }: { value: number; disabled: boolean; onDraft: (value: number) => void; onCommit: (value: number) => void }) {
  const percent = Math.round(value * 100);
  const commit = (event: React.SyntheticEvent<HTMLInputElement>) => onCommit(Number(event.currentTarget.value) / 100);
  return (
    <label className="rangeField voiceCleanAmount">
      <span>Amount</span>
      <span className="rangeControl" style={{ '--range-progress': `${percent}%` } as React.CSSProperties}>
        <span className="rangeVisual" aria-hidden="true">
          <span className="rangeFill" />
          <span className="rangeThumb" />
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={percent}
          disabled={disabled}
          aria-label="Clean voice amount"
          onInput={(event) => onDraft(Number(event.currentTarget.value) / 100)}
          onChange={(event) => onDraft(Number(event.currentTarget.value) / 100)}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
          onWheelCapture={(event) => { event.preventDefault(); event.currentTarget.blur(); }}
        />
      </span>
      <output>{percent}%</output>
    </label>
  );
}
