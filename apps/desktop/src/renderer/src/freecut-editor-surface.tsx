import React from 'react';

type FreecutUrlResult = {
  ok: boolean;
  url?: string;
  reason?: string;
};

export function FreecutEditorSurface({ projectId }: { projectId: string | null }) {
  const [result, setResult] = React.useState<FreecutUrlResult | null>(null);

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
      <section className="freecutEditorSurface" data-ui-region="freecut-editor-surface" aria-label="FreeCut editor">
        <iframe
          className="freecutEditorFrame"
          title="FreeCut editor"
          src={result.url}
          allow="clipboard-read; clipboard-write"
        />
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
