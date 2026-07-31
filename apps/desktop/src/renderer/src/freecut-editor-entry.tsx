import React from 'react';

type FreecutStatus = { available: boolean; root: string | null };

export function FreecutEditorEntry({ projectName }: { projectName?: string }) {
  const [status, setStatus] = React.useState<FreecutStatus | null>(null);
  const [opening, setOpening] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    window.roughCut.getFreecutStatus()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {
        if (!cancelled) setStatus({ available: false, root: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function openFreecut() {
    setOpening(true);
    setMessage(null);
    try {
      const result = await window.roughCut.openFreecutEditor();
      if (!result.ok) setMessage(result.reason ?? 'FreeCut could not be opened.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'FreeCut could not be opened.');
    } finally {
      setOpening(false);
    }
  }

  return (
    <section className="freecutEditorEntry" data-ui-region="freecut-editor-entry" aria-label="FreeCut editor">
      <div className="freecutEditorEntryHeader">
        <div>
          <p className="eyebrow">Main editor</p>
          <h2>FreeCut</h2>
        </div>
        <span className={`freecutStatus ${status?.available ? 'available' : ''}`} role="status">
          {status === null ? 'Checking' : status.available ? 'Ready' : 'Not packaged'}
        </span>
      </div>
      <p className="freecutEditorEntryProject">{projectName ?? 'No Rough Cut project open'}</p>
      <button type="button" className="primaryAction" disabled={!status?.available || opening} onClick={() => void openFreecut()}>
        {opening ? 'Opening FreeCut…' : 'Open FreeCut editor'}
      </button>
      {message ? <p className="freecutEditorEntryMessage" role="alert">{message}</p> : null}
    </section>
  );
}
