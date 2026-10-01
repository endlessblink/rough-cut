import React from 'react';

import { buildGraphicDocument, graphicHoldSec, resizeGraphicLayout, type GraphicHandle, type GraphicLayout, type TimelineGraphic } from '../../shared/motion-graphics.mjs';

type CanvasRect = { x: number; y: number; w: number; h: number };

/**
 * Claude-made graphics drawn live over the whole composite.
 *
 * Each graphic is its own sandboxed frame (scripts only: no same-origin, no
 * network via the page CSP) at the export canvas size, CSS-scaled onto the
 * preview canvas's on-screen rect. The frame never owns time: it is seeked to
 * `timelineSec - start` whenever the playhead moves, exactly as export seeks it
 * frame by frame. Frames stay mounted while hidden so a graphic is already
 * loaded the moment the playhead enters it.
 */
export function GraphicsOverlay({
  stageRef,
  graphics,
  currentTimeSec,
  fps,
  canvasWidth,
  canvasHeight,
  selectedGraphicId = null,
  editable = false,
  onLayoutChange,
  onSelect,
}: {
  stageRef: React.RefObject<HTMLElement | null>;
  graphics: readonly TimelineGraphic[];
  currentTimeSec: number;
  fps: number;
  canvasWidth: number;
  canvasHeight: number;
  selectedGraphicId?: string | null;
  /** Graphics tool open and paused: the selected graphic can be dragged. */
  editable?: boolean;
  onLayoutChange?: (id: string, patch: Partial<GraphicLayout>, commit: boolean) => void;
  onSelect?: (id: string) => void;
}) {
  const rect = usePreviewCanvasRect(stageRef);
  // Where each graphic's visible content sits, reported by its page.
  const [bounds, setBounds] = React.useState<Record<string, CanvasRect | null>>({});
  const reportBounds = React.useCallback((id: string, next: CanvasRect | null) => {
    setBounds((current) => (JSON.stringify(current[id]) === JSON.stringify(next) ? current : { ...current, [id]: next }));
  }, []);
  const frame = Math.round(currentTimeSec * fps);
  if (!rect || graphics.length === 0) return null;
  const scale = rect.width / canvasWidth;
  return (
    <div
      className="graphicsOverlay"
      data-ui-region="graphics-overlay"
      aria-hidden="true"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
    >
      {graphics.map((graphic) => {
        const active = graphic.enabled && frame >= graphic.startFrame && frame < graphic.endFrame;
        const localSec = Math.max(0, (frame - graphic.startFrame) / fps);
        return (
          <GraphicFrame
            key={graphic.id}
            graphic={graphic}
            active={active}
            selected={selectedGraphicId === graphic.id}
            localSec={localSec}
            width={canvasWidth}
            height={canvasHeight}
            scale={scale}
            holdSec={graphicHoldSec((graphic.endFrame - graphic.startFrame) / fps)}
            durationSec={(graphic.endFrame - graphic.startFrame) / fps}
            onBounds={reportBounds}
          />
        );
      })}
      {editable && onLayoutChange ? graphics.map((graphic) => {
        // Every graphic on screen can be grabbed; the selected one on top
        // gets the handles. Grabbing an unselected one selects it.
        const box = bounds[graphic.id];
        const active = graphic.enabled && frame >= graphic.startFrame && frame < graphic.endFrame;
        if (!box || !active) return null;
        const selected = graphic.id === selectedGraphicId;
        return (
          <GraphicHandles
            key={graphic.id}
            selected={selected}
            layout={graphic.layout}
            box={box}
            scale={scale}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            // Always: re-opens the Graphics panel even if this one was already selected.
            onGrab={() => onSelect?.(graphic.id)}
            onChange={(patch, commit) => onLayoutChange(graphic.id, patch, commit)}
          />
        );
      }) : null}
    </div>
  );
}

function GraphicFrame({ graphic, active, selected, localSec, width, height, scale, holdSec, durationSec, onBounds }: {
  graphic: TimelineGraphic;
  active: boolean;
  selected: boolean;
  localSec: number;
  width: number;
  height: number;
  scale: number;
  holdSec: number;
  durationSec: number;
  onBounds: (id: string, rect: CanvasRect | null) => void;
}) {
  const ref = React.useRef<HTMLIFrameElement | null>(null);
  React.useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== ref.current?.contentWindow || event.data?.type !== 'rc-bounds') return;
      onBounds(graphic.id, event.data.rect ?? null);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [graphic.id, onBounds]);
  const localSecRef = React.useRef(localSec);
  localSecRef.current = localSec;
  // Rebuilt only when the content or the canvas changes; field edits and seeks
  // are messages, so typing in a field never reloads the page.
  const srcDoc = React.useMemo(
    () => buildGraphicDocument({ html: graphic.html, fields: graphic.fields, width, height }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fields go by message, see below
    [graphic.html, width, height],
  );
  const fieldsKey = JSON.stringify(graphic.fields);

  const post = React.useCallback((message: unknown) => {
    ref.current?.contentWindow?.postMessage(message, '*');
  }, []);

  React.useEffect(() => {
    post({ type: 'rc-seek', t: localSec });
  }, [post, localSec]);

  React.useEffect(() => {
    post({ type: 'rc-fields', fields: graphic.fields });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- content key
  }, [post, fieldsKey]);

  React.useEffect(() => {
    post({ type: 'rc-animate', animate: graphic.animate, holdSec, durationSec, timing: graphic.timing, designedSec: graphic.designedSec });
  }, [post, graphic.animate, holdSec, durationSec, graphic.timing, graphic.designedSec]);

  // Drawn at the shown size (see the page's viewScale), not shrunk afterwards.
  React.useEffect(() => {
    post({ type: 'rc-viewport', scale });
  }, [post, scale]);

  const layoutKey = JSON.stringify(graphic.layout);
  React.useEffect(() => {
    post({ type: 'rc-layout', layout: graphic.layout });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- content key
  }, [post, layoutKey]);

  return (
    <iframe
      ref={ref}
      title={graphic.title}
      className={`graphicFrame${selected ? ' isSelected' : ''}`}
      data-graphic-id={graphic.id}
      data-graphic-active={active ? 'true' : 'false'}
      sandbox="allow-scripts"
      srcDoc={srcDoc}
      tabIndex={-1}
      style={{
        width: Math.round(width * scale),
        height: Math.round(height * scale),
        visibility: active ? 'visible' : 'hidden',
      }}
      onLoad={() => {
        post({ type: 'rc-viewport', scale });
        post({ type: 'rc-fields', fields: graphic.fields });
        post({ type: 'rc-animate', animate: graphic.animate, holdSec, durationSec, timing: graphic.timing, designedSec: graphic.designedSec });
        post({ type: 'rc-layout', layout: graphic.layout });
        post({ type: 'rc-seek', t: localSecRef.current });
      }}
    />
  );
}

const HANDLES: readonly GraphicHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/**
 * A box around a graphic's visible content. Drag inside to move it; drag any
 * edge or corner to resize it with the opposite side pinned. Previews live and
 * saves once on release, like the panel sliders.
 */
function GraphicHandles({ selected, layout, box, scale, canvasWidth, canvasHeight, onGrab, onChange }: {
  selected: boolean;
  layout: GraphicLayout;
  box: CanvasRect;
  scale: number;
  canvasWidth: number;
  canvasHeight: number;
  onGrab: () => void;
  onChange: (patch: Partial<GraphicLayout>, commit: boolean) => void;
}) {
  // The box moves while dragging (the page re-reports it), so every step is
  // computed from where the drag started.
  const dragRef = React.useRef<{ handle: GraphicHandle | 'move'; startX: number; startY: number; layout: GraphicLayout; box: CanvasRect; last: Partial<GraphicLayout> | null } | null>(null);
  const begin = (handle: GraphicHandle | 'move') => (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onGrab();
    // Take focus so the Delete key reaches the editor and removes this graphic.
    (event.currentTarget.closest(".graphicHandles") as HTMLElement | null)?.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { handle, startX: event.clientX, startY: event.clientY, layout, box, last: null };
    traceDrag('begin', handle);
  };
  const move = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      if (event.buttons) traceDrag('move-without-drag', event.type);
      return;
    }
    traceDrag('move', drag.handle);
    const dx = (event.clientX - drag.startX) / scale;
    const dy = (event.clientY - drag.startY) / scale;
    const patch: Partial<GraphicLayout> = drag.handle === 'move'
      ? { x: round(drag.layout.x + dx / canvasWidth), y: round(drag.layout.y + dy / canvasHeight) }
      : resizeGraphicLayout({ layout: drag.layout, box: drag.box, handle: drag.handle, dx, dy, width: canvasWidth, height: canvasHeight });
    drag.last = patch;
    onChange(patch, false);
  };
  const end = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    traceDrag(drag?.last ? 'commit' : 'end-no-change', drag?.handle ?? 'none');
    if (drag?.last) onChange(drag.last, true);
  };
  React.useEffect(() => {
    traceDrag('mount', selected ? 'selected' : 'idle');
    return () => traceDrag('unmount', selected ? 'selected' : 'idle');
  }, [selected]);
  const handlers = { onPointerMove: move, onPointerUp: end, onPointerCancel: end };
  return (
    <div
      className={`graphicHandles${selected ? ' isSelected' : ''}`}
      data-graphic-handles={selected ? 'selected' : 'idle'}
      tabIndex={-1}
      style={{ left: box.x * scale, top: box.y * scale, width: box.w * scale, height: box.h * scale }}
      onPointerDown={begin('move')}
      {...handlers}
      title="Drag to move · drag an edge or corner to resize"
    >
      {selected ? HANDLES.map((handle) => (
        <span key={handle} className={`graphicHandle graphicHandle-${handle}`} data-graphic-handle={handle} onPointerDown={begin(handle)} {...handlers} />
      )) : null}
    </div>
  );
}

/** Drag trace for diagnosing lost drags (read `__roughCutGraphicDragTrace`). */
function traceDrag(event: string, detail: string) {
  const target = window as unknown as { __roughCutGraphicDragTrace?: string[] };
  const trace = target.__roughCutGraphicDragTrace ?? (target.__roughCutGraphicDragTrace = []);
  if (trace.length > 0 && trace[trace.length - 1] === `${event}:${detail}` && event === 'move') return;
  trace.push(`${event}:${detail}`);
  if (trace.length > 200) trace.shift();
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

/**
 * The preview canvas's rect relative to the stage, tracked through resizes.
 * The canvas letterboxes inside the stage, so the stage rect alone is wrong.
 */
function usePreviewCanvasRect(stageRef: React.RefObject<HTMLElement | null>) {
  const [rect, setRect] = React.useState<{ left: number; top: number; width: number; height: number } | null>(null);
  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const canvas = stage.querySelector<HTMLCanvasElement>('canvas.styledPreviewCanvas');
        if (!canvas) {
          setRect(null);
          return;
        }
        const stageBox = stage.getBoundingClientRect();
        const box = canvas.getBoundingClientRect();
        // Whole screen pixels: a layer at a fractional offset (e.g. x = 269.34)
        // is resampled across pixels and every graphic looks soft.
        const next = { left: Math.round(box.left) - stageBox.left, top: Math.round(box.top) - stageBox.top, width: Math.round(box.width), height: Math.round(box.height) };
        setRect((current) => (
          current && Math.abs(current.left - next.left) < 0.5 && Math.abs(current.top - next.top) < 0.5
            && Math.abs(current.width - next.width) < 0.5 && Math.abs(current.height - next.height) < 0.5
            ? current
            : next
        ));
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    const canvas = stage.querySelector('canvas.styledPreviewCanvas');
    if (canvas) observer.observe(canvas);
    // The canvas mounts after media metadata loads; catch it when it appears.
    const mutations = new MutationObserver(() => {
      const next = stage.querySelector('canvas.styledPreviewCanvas');
      if (next) observer.observe(next);
      measure();
    });
    mutations.observe(stage, { childList: true, subtree: true });
    window.addEventListener('resize', measure);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [stageRef]);
  return rect;
}
