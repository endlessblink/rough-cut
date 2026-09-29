import React from 'react';

import { buildGraphicDocument, graphicHoldSec, type TimelineGraphic } from '../../shared/motion-graphics.mjs';

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
}: {
  stageRef: React.RefObject<HTMLElement | null>;
  graphics: readonly TimelineGraphic[];
  currentTimeSec: number;
  fps: number;
  canvasWidth: number;
  canvasHeight: number;
  selectedGraphicId?: string | null;
}) {
  const rect = usePreviewCanvasRect(stageRef);
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
          />
        );
      })}
    </div>
  );
}

function GraphicFrame({ graphic, active, selected, localSec, width, height, scale, holdSec, durationSec }: {
  graphic: TimelineGraphic;
  active: boolean;
  selected: boolean;
  localSec: number;
  width: number;
  height: number;
  scale: number;
  holdSec: number;
  durationSec: number;
}) {
  const ref = React.useRef<HTMLIFrameElement | null>(null);
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
    post({ type: 'rc-animate', animate: graphic.animate, holdSec, durationSec });
  }, [post, graphic.animate, holdSec, durationSec]);

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
        width,
        height,
        transform: `scale(${scale})`,
        visibility: active ? 'visible' : 'hidden',
      }}
      onLoad={() => {
        post({ type: 'rc-fields', fields: graphic.fields });
        post({ type: 'rc-animate', animate: graphic.animate, holdSec, durationSec });
        post({ type: 'rc-seek', t: localSecRef.current });
      }}
    />
  );
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
        const next = { left: box.left - stageBox.left, top: box.top - stageBox.top, width: box.width, height: box.height };
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
