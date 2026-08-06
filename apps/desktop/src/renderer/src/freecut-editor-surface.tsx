import React from 'react';
import { getStyledCanvasResolution } from '@rough-cut/project-model';
import { StyledVideoPreview, type StyledPreviewProject, type EditorOverlayLayer } from './styled-video-preview';
import { resolveOverlayLayers, resolveRecordingTimeSec } from './editor-timeline-placement.mjs';

type FreecutUrlResult = {
  ok: boolean;
  url?: string;
  reason?: string;
};

type FreecutEditorSurfaceProps = {
  projectId: string | null;
  projectVersion?: number;
  /** False while another view is showing. The surface stays mounted either way. */
  active?: boolean;
  /**
   * The project Rough Cut's compositor draws. The Editor's own renderer cannot
   * express camera PiP, zoom markers, click effects or a telemetry-driven
   * cursor, so matching Recording edit inside it would mean re-implementing the
   * compositor in a second engine and letting the two drift. Instead the one
   * compositor Rough Cut already has paints over the Editor's viewer.
   */
  previewProject?: StyledPreviewProject | null;
  /**
   * Publishes the Editor's layer stack to the app.
   *
   * One timeline, many views: a clip added here belongs to the project, not to
   * this view, so every other view has to be able to draw it. Reported already
   * split by track order and with sources resolved, so no other view has to
   * repeat that reasoning.
   */
  onLayersChange?: (layers: { above: EditorOverlayLayer[]; below: EditorOverlayLayer[] }) => void;
};

/** Where the Editor's viewer sits inside the iframe, and what it is showing. */
type FreecutViewerMessage = {
  type: 'freecut:viewer';
  rect: { x: number; y: number; width: number; height: number };
  frame: number;
  fps: number;
  playing: boolean;
  /** Layers on the Editor's timeline. Drawn by Rough Cut's compositor so they
   *  appear in every view, not just this one. */
  layers?: (EditorOverlayLayer & { trackId?: string; isRecording?: boolean })[];
  /** The track stack. Lower order numbers are higher visual tracks in FreeCut. */
  tracks?: { id?: string; order?: number }[];
};

// The placement maths, the track-order split and the media-URL resolution all
// live in a plain module so they are unit-testable, and so every view
// compositing this timeline uses exactly the same arithmetic rather than a
// second copy that drifts.

type FreecutReadyMessage = {
  type: 'freecut-ready' | 'freecut:ready' | 'freecut-boot' | 'freecut-error';
  marker?: { version?: string; embedded?: boolean; buildHash?: string; projectVersion?: number };
  projectId?: string | null;
  projectVersion?: number;
  error?: string;
  probe?: boolean;
};

type FreecutCommandMessage = {
  type: 'freecut-command';
  command?: { opId?: string; projectId?: string; payload?: { project?: { id?: string } } };
};

export function FreecutEditorSurface({ projectId, projectVersion = 0, active = true, previewProject = null, onLayersChange }: FreecutEditorSurfaceProps) {
  // Position and playhead of the Editor's viewer, reported by the embedded
  // editor. Null until it reports, which is also our signal that the embedded
  // build is old enough to lack the bridge — in that case nothing is painted
  // and the Editor keeps its own picture.
  const [viewer, setViewer] = React.useState<FreecutViewerMessage | null>(null);
  const [result, setResult] = React.useState<FreecutUrlResult | null>(null);
  const [ready, setReady] = React.useState(false);
  const [booted, setBooted] = React.useState(false);
  const [bootError, setBootError] = React.useState<string | null>(null);
  const [frameLoaded, setFrameLoaded] = React.useState(false);
  const [probeReceived, setProbeReceived] = React.useState(false);
  const [probeSourceMatched, setProbeSourceMatched] = React.useState(false);
  const [marker, setMarker] = React.useState<FreecutReadyMessage['marker']>(undefined);
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const readyRef = React.useRef(false);

  React.useEffect(() => {
    readyRef.current = false;
    setReady(false);
    setBooted(false);
    setBootError(null);
    setFrameLoaded(false);
    setProbeReceived(false);
    setProbeSourceMatched(false);
    setMarker(undefined);
    const onMessage = (event: MessageEvent<FreecutReadyMessage | FreecutCommandMessage | FreecutViewerMessage>) => {
      const expectedOrigin = result?.url ? new URL(result.url).origin : '';
      const sourceTrusted = event.source === frameRef.current?.contentWindow || event.origin === expectedOrigin;
      // Fires on every viewer move and every frame, so it must not be logged
      // like the one-off handshake messages below.
      if (event.data?.type === 'freecut:viewer') {
        if (sourceTrusted) setViewer(event.data as unknown as FreecutViewerMessage);
        return;
      }
      if (typeof event.data?.type === 'string' && event.data.type.startsWith('freecut')) {
        console.info('[freecut-host-message]', event.data.type, event.origin, sourceTrusted);
      }
      if (event.data?.type === 'freecut:ready' && event.data.probe === true) {
        setProbeReceived(true);
        setProbeSourceMatched(sourceTrusted);
        if (!sourceTrusted) return;
        frameRef.current?.contentWindow?.postMessage({ type: 'freecut:request-status' }, '*');
        return;
      }
      if (!sourceTrusted) return;
      if (event.data?.type === 'freecut-boot') {
        setBooted(true);
        return;
      }
      if (event.data?.type === 'freecut-error') {
        setBootError(event.data.error ?? 'FreeCut startup failed.');
        return;
      }
      if (event.data?.type === 'freecut-command') {
        const command = event.data.command;
        // Always answer. This used to `return` silently when the guard rejected,
        // so a dropped write reached the editor only as a 10s timeout and looked
        // like a hang instead of a refusal.
        const reject = (reason: string) => {
          console.warn('[freecut-host] rejected command', reason, command?.opId);
          frameRef.current?.contentWindow?.postMessage(
            { type: 'freecut-command-ack', ok: false, opId: command?.opId, reason },
            '*',
          );
        };
        if (!readyRef.current) return reject('host-not-ready');
        if (command?.projectId !== projectId) return reject('project-id-mismatch');
        if (command.payload?.project?.id !== projectId) return reject('payload-project-mismatch');
        void window.roughCut.applyFreecutCommand(command as unknown as Record<string, unknown>).then((ack) => {
          frameRef.current?.contentWindow?.postMessage({ type: 'freecut-command-ack', ...ack }, '*');
        });
        return;
      }
      if (event.data?.type !== 'freecut-ready') return;
      const marker = event.data.marker;
      console.info('[freecut-host-ready-payload]', JSON.stringify({
        marker,
        messageProjectId: event.data.projectId,
        expectedProjectId: projectId,
        messageProjectVersion: event.data.projectVersion,
        expectedProjectVersion: projectVersion,
      }));
      // Deliberately NOT gated on projectVersion any more. The version used to
      // travel in the iframe URL, so every write reloaded the editor and threw
      // away playhead, scroll and zoom. With the URL stable, a freshly mounted
      // editor reports version 0 while the host holds a save timestamp — gating
      // on that would leave readiness false forever and silently drop every
      // write. Identity is what matters here: the right build, embedded, on the
      // right project.
      if (
        marker?.embedded !== true
        || marker.version !== 'vendored-freecut-1'
        || event.data.projectId !== projectId
      ) return;
      setMarker(marker);
      readyRef.current = true;
      setReady(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [projectId, result]);

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

  // Leaving the Editor must not race the editor's own save debounce. Hiding with
  // display:none does not fire visibilitychange inside the frame — the frame's
  // document is still "visible" — so the flush has to be an explicit message.
  const wasActive = React.useRef(active);
  React.useEffect(() => {
    if (wasActive.current && !active) {
      frameRef.current?.contentWindow?.postMessage({ type: 'freecut:flush' }, '*');
    }
    wasActive.current = active;
  }, [active]);

  // The frame both views share. Recording edit lets the user pick it — wide,
  // vertical, square, classic, tall, portrait or the recording's own shape — and
  // the compositor cuts the program to it. The Editor is a second window onto
  // that same program, so its canvas is the same canvas; anything else shows one
  // timeline in two different frames.
  const canvas = React.useMemo(() => getStyledCanvasResolution({
    aspectRatio: previewProject?.document?.settings?.aspectRatio ?? 'auto',
    sourceWidth: previewProject?.recording?.width ?? 1920,
    sourceHeight: previewProject?.recording?.height ?? 1080,
  }), [previewProject?.document?.settings?.aspectRatio, previewProject?.recording?.width, previewProject?.recording?.height]);
  const canvasRef = React.useRef(canvas);
  canvasRef.current = canvas;

  const postCanvas = React.useCallback(() => {
    frameRef.current?.contentWindow?.postMessage(
      { type: 'freecut:set-canvas', width: canvasRef.current.width, height: canvasRef.current.height },
      '*',
    );
  }, []);

  // The snapshot that seeds the Editor is read once at boot, so a shape chosen
  // afterwards has to be pushed. Sending it on every change — and again whenever
  // the Editor asks, because its project store populates after ours — is what
  // keeps the two views on one frame without reloading the Editor.
  React.useEffect(() => {
    if (!ready) return;
    postCanvas();
  }, [ready, canvas.width, canvas.height, postCanvas]);

  React.useEffect(() => {
    if (!result?.ok || !result.url) return undefined;
    const onRequest = (event: MessageEvent<{ type?: string }>) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type === 'freecut:request-canvas') postCanvas();
    };
    window.addEventListener('message', onRequest);
    return () => window.removeEventListener('message', onRequest);
  }, [result, postCanvas]);

  React.useEffect(() => {
    if (!result?.ok || !result.url) return undefined;
    const requestStatus = () => frameRef.current?.contentWindow?.postMessage({ type: 'freecut:request-status' }, '*');
    requestStatus();
    const interval = window.setInterval(requestStatus, 250);
    const stop = window.setTimeout(() => window.clearInterval(interval), 10000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(stop);
    };
  }, [result]);

  // Hand the layer stack to the app so every other view draws the same clips.
  // Keyed on content: the viewer message also carries the rectangle and the
  // playhead, which change constantly and mean nothing to anyone else.
  const publishedLayers = viewer && result?.url ? resolveOverlayLayers(viewer, result.url, projectId) : { above: [], below: [] };
  const publishedLayersKey = JSON.stringify(publishedLayers);
  React.useEffect(() => {
    onLayersChange?.(JSON.parse(publishedLayersKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- content key, see above
  }, [publishedLayersKey]);

  React.useEffect(() => {
    if (!result?.ok || !result.url) return undefined;
    const frame = window.requestAnimationFrame(() => {
      void window.roughCut.writePlaybackDebugReport({
        schemaVersion: 1,
        kind: 'packaged-renderer-runtime',
        route: {
          pathname: window.location.pathname,
          search: window.location.search,
          activeAppView: document.querySelector<HTMLElement>('[data-active-app-view]')?.dataset.activeAppView ?? null,
        },
        host: {
          bundleSignature: document.documentElement.dataset.hostBundleSignature ?? '',
          shellMarker: document.querySelector<HTMLElement>('[data-ui-shell="recording-studio"]')?.dataset.uiShell ?? null,
          shellCount: document.querySelectorAll('[data-ui-shell="recording-studio"]').length,
        },
        visibleSurface: {
          freecutSurfaceCount: document.querySelectorAll('[data-ui-region="freecut-editor-surface"]').length,
          freecutFrameCount: 1,
          freecutFrameLoaded: frameLoaded,
          freecutFrameSrc: result.url,
          freecutProbeReceived: probeReceived,
          freecutProbeSourceMatched: probeSourceMatched,
          freecutBooted: booted,
          freecutError: bootError ?? '',
          freecutReady: ready,
          freecutMarkerVersion: marker?.version ?? '',
          freecutBuildHash: marker?.buildHash ?? '',
          freecutProjectId: projectId ?? '',
          freecutProjectVersion: String(projectVersion),
        },
        project: {
          id: projectId,
          version: projectVersion,
        },
        capturedAt: new Date().toISOString(),
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [bootError, booted, frameLoaded, marker, probeReceived, probeSourceMatched, projectId, projectVersion, ready, result]);

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
        data-freecut-booted={booted ? 'true' : 'false'}
        data-freecut-error={bootError ?? ''}
        data-freecut-frame-loaded={frameLoaded ? 'true' : 'false'}
        data-freecut-probe-received={probeReceived ? 'true' : 'false'}
        data-freecut-probe-source-matched={probeSourceMatched ? 'true' : 'false'}
        aria-label="FreeCut editor"
      >
        <iframe
          ref={frameRef}
          className="freecutEditorFrame"
          title="FreeCut editor"
          data-freecut-embed="vendored"
          data-freecut-ready={ready ? 'true' : 'false'}
          data-freecut-booted={booted ? 'true' : 'false'}
          onLoad={() => {
            setFrameLoaded(true);
            frameRef.current?.contentWindow?.postMessage({ type: 'freecut:request-status' }, '*');
          }}
          // Stable URL on purpose: interpolating the project version here made
          // every successful write reload the whole editor, discarding the
          // playhead, scroll position and zoom. The version is informational and
          // is carried in messages instead.
          src={result.url}
          allow="clipboard-read; clipboard-write"
        />
        {/* One compositor draws the picture, and it is Rough Cut's. It is
            positioned over the Editor's own viewer using the rectangle the
            Editor reports, so both views are guaranteed to look identical —
            there is only one renderer. Nothing is pre-rendered: this composites
            live from the raw media exactly as Recording edit does, so a project
            shows instantly regardless of its length. */}
        {viewer && previewProject ? (
          <div
            className="freecutProgramOverlay"
            data-ui-region="freecut-program-overlay"
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: viewer.rect.x,
              top: viewer.rect.y,
              width: viewer.rect.width,
              height: viewer.rect.height,
              // The Editor's gizmos and controls must stay clickable underneath.
              pointerEvents: 'none',
            }}
          >
            <StyledVideoPreview
              project={previewProject}
              // The recording's OWN time under the playhead, not the playhead's.
              // They differ the moment the clip is moved, trimmed or cut.
              seekTimeSec={resolveRecordingTimeSec(viewer) ?? 0}
              // Nothing of the recording exists here: an empty timeline position
              // renders empty, and only the layers on other tracks are drawn.
              recordingAbsent={resolveRecordingTimeSec(viewer) === null}
              isPlaying={viewer.playing}
              overlayLayersAbove={resolveOverlayLayers(viewer, result.url, projectId).above}
              overlayLayersBelow={resolveOverlayLayers(viewer, result.url, projectId).below}
              timeMode="timeline"
              showControls={false}
            />
          </div>
        ) : null}
        {!ready ? <div className="freecutEditorSurfaceStatus" data-freecut-readiness="waiting">{bootError ?? (booted ? 'FreeCut is waiting for readiness…' : 'Loading FreeCut editor…')}</div> : null}
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
