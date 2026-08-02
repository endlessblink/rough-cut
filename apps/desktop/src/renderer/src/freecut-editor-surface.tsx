import React from 'react';

type FreecutUrlResult = {
  ok: boolean;
  url?: string;
  reason?: string;
};

type FreecutEditorSurfaceProps = {
  projectId: string | null;
  projectVersion?: number;
};

type FreecutReadyMessage = {
  type: 'freecut-ready';
  marker?: { version?: string; embedded?: boolean; buildHash?: string; projectVersion?: number };
  projectId?: string | null;
  projectVersion?: number;
};

type FreecutCommandMessage = {
  type: 'freecut-command';
  command?: { opId?: string; projectId?: string; payload?: { project?: { id?: string } } };
};

export function FreecutEditorSurface({ projectId, projectVersion = 0 }: FreecutEditorSurfaceProps) {
  const [result, setResult] = React.useState<FreecutUrlResult | null>(null);
  const [ready, setReady] = React.useState(false);
  const [marker, setMarker] = React.useState<FreecutReadyMessage['marker']>(undefined);
  const frameRef = React.useRef<HTMLIFrameElement>(null);

  React.useEffect(() => {
    setReady(false);
    setMarker(undefined);
    const onMessage = (event: MessageEvent<FreecutReadyMessage | FreecutCommandMessage>) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type === 'freecut-command') {
        const command = event.data.command;
        if (!ready || command?.projectId !== projectId || command.payload?.project?.id !== projectId) return;
        void window.roughCut.applyFreecutCommand(command as unknown as Record<string, unknown>).then((ack) => {
          frameRef.current?.contentWindow?.postMessage({ type: 'freecut-command-ack', ...ack }, '*');
        });
        return;
      }
      if (event.data?.type !== 'freecut-ready') return;
      const marker = event.data.marker;
      if (
        marker?.embedded !== true
        || marker.version !== 'vendored-freecut-1'
        || event.data.projectId !== projectId
        || event.data.projectVersion !== projectVersion
      ) return;
      setMarker(marker);
      setReady(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [projectId, ready]);

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
      <section
        className="freecutEditorSurface"
        data-ui-region="freecut-editor-surface"
        data-freecut-project-id={projectId ?? ''}
        data-freecut-marker-version={marker?.version ?? ''}
        data-freecut-build-hash={marker?.buildHash ?? ''}
        data-freecut-project-version={String(projectVersion)}
        data-freecut-ready={ready ? 'true' : 'false'}
        aria-label="FreeCut editor"
      >
        <iframe
          ref={frameRef}
          className="freecutEditorFrame"
          title="FreeCut editor"
          data-freecut-embed="vendored"
          data-freecut-ready={ready ? 'true' : 'false'}
          src={`${result.url}${result.url.includes('?') ? '&' : '?'}hostVersion=${projectVersion}`}
          allow="clipboard-read; clipboard-write"
        />
        {!ready ? <div className="freecutEditorSurfaceStatus" data-freecut-readiness="waiting">Loading FreeCut editor…</div> : null}
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
