import React from 'react';
import {
  ArrowClockwise as PhosphorArrowClockwise,
  MagicWand as PhosphorMagicWand,
  Trash as PhosphorTrash,
} from '@phosphor-icons/react';

import type { GraphicField, TimelineGraphic } from '../../shared/motion-graphics.mjs';
import { CREATIVITY_LEVELS, DEFAULT_CREATIVITY, DEFAULT_GRAPHICS_STYLE_ID, GRAPHIC_STYLES, normalizeCreativity, resolveGraphicStyle } from '../../shared/graphics-styles.mjs';

export type GraphicsStyle = {
  fontFamily: string;
  textColor: string;
  primaryColor: string;
  accentColor: string;
  notes: string;
  styleId: string;
  creativity: number;
};

export type GeneratedGraphic = {
  title: string;
  html: string;
  fields: GraphicField[];
  durationSec: number;
  startSec: number | null;
};

type GenerateResult = { ok: true; graphic: GeneratedGraphic } | { ok: false; reason: string; errors?: string[]; cancelled?: boolean };

type Busy = { kind: 'new' | 'change'; requestId: string } | null;

function formatClock(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

let requestCounter = 0;
function nextRequestId() {
  requestCounter += 1;
  return `graphic-request-${Date.now()}-${requestCounter}`;
}

/**
 * The Graphics tool: ask Claude for a graphic, see what is on the timeline,
 * edit the selected one's fields, or ask Claude to change it.
 */
export function GraphicsPanel({
  graphics,
  selectedGraphicId,
  fps,
  canvas,
  disabled = false,
  onSelect,
  onAdd,
  onReplace,
  onFieldsChange,
  onAnimateChange,
  onRemove,
}: {
  graphics: readonly TimelineGraphic[];
  selectedGraphicId: string | null;
  fps: number;
  canvas: { width: number; height: number };
  disabled?: boolean;
  onSelect: (id: string | null) => void;
  onAdd: (graphic: GeneratedGraphic, request: string) => void;
  onReplace: (id: string, graphic: GeneratedGraphic, request: string) => void;
  onFieldsChange: (id: string, values: Record<string, string | number>) => void;
  onAnimateChange: (id: string, animate: boolean) => void;
  onRemove: (id: string) => void;
}) {
  const [request, setRequest] = React.useState('');
  const [changeRequest, setChangeRequest] = React.useState('');
  const [busy, setBusy] = React.useState<Busy>(null);
  const [problem, setProblem] = React.useState<{ reason: string; errors?: string[] } | null>(null);
  // The look for the next generation; remembered across sessions.
  const [look, setLook] = React.useState<{ styleId: string; creativity: number }>({ styleId: DEFAULT_GRAPHICS_STYLE_ID, creativity: DEFAULT_CREATIVITY });
  React.useEffect(() => {
    let cancelled = false;
    void window.roughCut?.getGraphicsStyle?.().then((saved: GraphicsStyle) => {
      if (!cancelled && saved) setLook({ styleId: resolveGraphicStyle(saved.styleId).id, creativity: normalizeCreativity(saved.creativity) });
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const changeLook = (patch: Partial<{ styleId: string; creativity: number }>) => {
    setLook((current) => ({ ...current, ...patch }));
    void window.roughCut?.setGraphicsStyle?.(patch).catch(() => undefined);
  };
  const selected = graphics.find((graphic) => graphic.id === selectedGraphicId) ?? null;
  const available = typeof window !== 'undefined' && typeof window.roughCut?.generateGraphic === 'function';

  async function run(kind: 'new' | 'change') {
    const text = (kind === 'new' ? request : changeRequest).trim();
    if (!text || busy || !available) return;
    if (kind === 'change' && !selected) return;
    const requestId = nextRequestId();
    setBusy({ kind, requestId });
    setProblem(null);
    try {
      const result = (await window.roughCut.generateGraphic({
        requestId,
        request: text,
        canvas,
        fps,
        styleId: look.styleId,
        creativity: look.creativity,
        existing: kind === 'change' && selected
          ? { title: selected.title, html: selected.html, fields: selected.fields, durationSec: (selected.endFrame - selected.startFrame) / fps }
          : null,
      })) as GenerateResult;
      if (!result.ok) {
        if (!result.cancelled) setProblem({ reason: result.reason, errors: result.errors });
        return;
      }
      if (kind === 'new') {
        onAdd(result.graphic, text);
        setRequest('');
      } else if (selected) {
        onReplace(selected.id, result.graphic, text);
        setChangeRequest('');
      }
    } catch (error) {
      setProblem({ reason: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  }

  function cancel() {
    if (busy) void window.roughCut.cancelGraphic?.(busy.requestId);
  }

  const controlsDisabled = disabled || !available;

  return (
    <aside className="setupBoard studioPane graphicsPane" aria-label="Graphics board" data-graphics-panel="true">
      <header className="paneTitle">
        <div>
          <h2>Graphics</h2>
          <p>Lower thirds, titles and callouts, made by Claude</p>
        </div>
      </header>

      <section className="inspectorSection" data-inspector-group="graphics-new" aria-label="Make a graphic">
        <div className="inspectorSectionHead"><p className="eyebrow">Make a graphic</p></div>
        <label className="graphicsField graphicsRequest">
          <span className="srOnly">Describe the graphic</span>
          <textarea
            value={request}
            rows={3}
            maxLength={600}
            dir="auto"
            placeholder="Lower third: Noam Naumovsky, AI video tools — at 0:05 for 4 seconds"
            disabled={controlsDisabled || busy !== null}
            onChange={(event) => setRequest(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void run('new');
              }
            }}
            data-graphics-request="true"
          />
        </label>
        <div className="graphicsLook" data-graphics-look="true">
          <div className="graphicsField">
            <span>Style</span>
            <div className="graphicsStyleGrid" role="radiogroup" aria-label="Style" data-graphics-style="true">
              {GRAPHIC_STYLES.map((style) => {
                const current = look.styleId === style.id;
                const [ground, ink, accent] = style.swatch;
                return (
                  <button
                    key={style.id}
                    type="button"
                    role="radio"
                    aria-checked={current}
                    title={`${style.label} — ${style.mood}`}
                    className={`graphicsStyleTile${current ? ' isCurrent' : ''}`}
                    disabled={controlsDisabled || busy !== null}
                    onClick={() => changeLook({ styleId: style.id })}
                    data-graphics-style-id={style.id}
                  >
                    <span className="graphicsStyleSwatch" style={{ background: ground }} aria-hidden="true">
                      <span className="graphicsStyleSwatchInk" style={{ background: ink }} />
                      <span className="graphicsStyleSwatchAccent" style={{ background: accent }} />
                    </span>
                    <span className="graphicsStyleText">
                      <span className="graphicsStyleName">{style.label}</span>
                      <span className="graphicsStyleMood">{style.mood.split(' — ')[0]}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="graphicsField" role="radiogroup" aria-label="Creativity">
            <span>Creativity <em className="graphicsLookValue">{CREATIVITY_LEVELS[look.creativity - 1]?.label}</em></span>
            <div className="graphicsCreativity">
              {CREATIVITY_LEVELS.map((level) => (
                <button
                  key={level.level}
                  type="button"
                  role="radio"
                  aria-checked={look.creativity === level.level}
                  aria-label={`${level.level} — ${level.label}`}
                  title={level.label}
                  className={`graphicsCreativityStep${look.creativity >= level.level ? ' isFilled' : ''}${look.creativity === level.level ? ' isCurrent' : ''}`}
                  disabled={controlsDisabled || busy !== null}
                  onClick={() => changeLook({ creativity: level.level })}
                  data-graphics-creativity={level.level}
                />
              ))}
            </div>
            <div className="graphicsCreativityScale" aria-hidden="true"><span>Calm</span><span>Wild</span></div>
          </div>
        </div>
        <div className="graphicsActions">
          {busy?.kind === 'new' ? (
            <>
              <span className="graphicsWorking" role="status"><span className="graphicsWorkingDot" aria-hidden="true" />Claude is designing…</span>
              <button type="button" className="secondary compact" onClick={cancel}>Cancel</button>
            </>
          ) : (
            <button
              type="button"
              className="compact graphicsGenerate"
              disabled={controlsDisabled || busy !== null || !request.trim()}
              onClick={() => void run('new')}
              data-graphics-generate="true"
            >
              <PhosphorMagicWand size={16} weight="regular" aria-hidden /> Generate
            </button>
          )}
        </div>
        {problem ? (
          <div className="graphicsProblem" role="alert">
            <strong>{problem.reason}</strong>
            {problem.errors && problem.errors.length > 0 ? (
              <ul>{problem.errors.slice(0, 4).map((error) => <li key={error}>{error}</li>)}</ul>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="inspectorSection" data-inspector-group="graphics-list" aria-label="Graphics on the timeline">
        <div className="inspectorSectionHead"><p className="eyebrow">On the timeline</p></div>
        {graphics.length > 0 ? (
          <ul className="graphicsList" data-graphics-list="true">
            {graphics.map((graphic) => {
              const isSelected = graphic.id === selectedGraphicId;
              return (
                <li key={graphic.id}>
                  <button
                    type="button"
                    className={`graphicsListItem${isSelected ? ' isSelected' : ''}`}
                    aria-pressed={isSelected}
                    onClick={() => onSelect(isSelected ? null : graphic.id)}
                  >
                    <span className="graphicsListTitle" dir="auto">{graphic.title}</span>
                    <span className="graphicsListTime">{formatClock(graphic.startFrame / fps)}–{formatClock(graphic.endFrame / fps)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="graphicsEmpty">Nothing yet. Describe one above and it lands on the Graphics lane at the playhead.</p>
        )}
      </section>

      <section className={`inspectorSection${selected ? '' : ' mutedSection'}`} data-inspector-group="graphics-selected" aria-label="Selected graphic">
        <div className="inspectorSectionHead">
          <p className="eyebrow">{selected ? 'Selected graphic' : 'No graphic selected'}</p>
          {selected ? (
            <div className="inspectorSectionAction">
              <button type="button" className="textButton graphicsDelete" disabled={disabled || busy !== null} onClick={() => onRemove(selected.id)}>
                <PhosphorTrash size={14} weight="regular" aria-hidden /> Delete
              </button>
            </div>
          ) : null}
        </div>
        <label className="toggleField inspectorToggle" title={selected && !selected.animate ? 'Holds still for its whole length' : 'Plays its entrance and exit'}>
          <span>Animate</span>
          <input
            type="checkbox"
            role="switch"
            checked={selected ? selected.animate : true}
            disabled={disabled || !selected || busy !== null}
            onChange={(event) => { if (selected) onAnimateChange(selected.id, event.currentTarget.checked); }}
            data-graphics-animate="true"
          />
        </label>
        <div className="graphicsFields" data-graphics-fields="true">
          {(selected?.fields ?? []).length > 0 ? selected!.fields.map((field) => (
            <GraphicFieldInput
              key={`${selected!.id}:${field.key}`}
              field={field}
              disabled={disabled || busy !== null}
              onCommit={(value) => onFieldsChange(selected!.id, { [field.key]: value })}
            />
          )) : (
            <p className="graphicsEmpty">{selected ? 'This graphic has no editable fields.' : 'Select a graphic on the timeline or in the list to edit its text and colours.'}</p>
          )}
        </div>
        <label className="graphicsField">
          <span>Change with Claude</span>
          <textarea
            value={changeRequest}
            rows={2}
            maxLength={600}
            dir="auto"
            placeholder="Slide in from the left, make it Hebrew…"
            disabled={controlsDisabled || !selected || busy !== null}
            onChange={(event) => setChangeRequest(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void run('change');
              }
            }}
          />
        </label>
        <div className="graphicsActions">
          {busy?.kind === 'change' ? (
            <>
              <span className="graphicsWorking" role="status"><span className="graphicsWorkingDot" aria-hidden="true" />Claude is revising…</span>
              <button type="button" className="secondary compact" onClick={cancel}>Cancel</button>
            </>
          ) : (
            <button
              type="button"
              className="secondary compact"
              disabled={controlsDisabled || !selected || busy !== null || !changeRequest.trim()}
              onClick={() => void run('change')}
            >
              <PhosphorArrowClockwise size={16} weight="regular" aria-hidden /> Apply change
            </button>
          )}
        </div>
      </section>

      <HouseStyle disabled={controlsDisabled} />
    </aside>
  );
}

/** Text commits on blur/Enter so undo gets one step per edit; colours on pick. */
function GraphicFieldInput({ field, disabled, onCommit }: { field: GraphicField; disabled: boolean; onCommit: (value: string | number) => void }) {
  const [draft, setDraft] = React.useState(String(field.value));
  React.useEffect(() => setDraft(String(field.value)), [field.value]);
  const commit = () => {
    const value = field.type === 'number' ? Number(draft) : draft;
    if (String(value) !== String(field.value)) onCommit(value);
  };
  if (field.type === 'color') {
    return (
      <label className="graphicsField graphicsColorField">
        <span>{field.label}</span>
        <span className="graphicsColorControl">
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(draft) ? draft : '#ffffff'} disabled={disabled} onChange={(event) => { setDraft(event.target.value); onCommit(event.target.value); }} data-graphic-field={field.key} />
          <span className="graphicsColorValue">{draft.toUpperCase()}</span>
        </span>
      </label>
    );
  }
  return (
    <label className="graphicsField">
      <span>{field.label}</span>
      <input
        type={field.type === 'number' ? 'number' : 'text'}
        dir="auto"
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); commit(); }
          if (event.key === 'Escape') { event.preventDefault(); setDraft(String(field.value)); }
        }}
        data-graphic-field={field.key}
      />
    </label>
  );
}

function HouseStyle({ disabled }: { disabled: boolean }) {
  const [style, setStyle] = React.useState<GraphicsStyle | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    void window.roughCut?.getGraphicsStyle?.().then((value: GraphicsStyle) => { if (!cancelled) setStyle(value); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const save = (patch: Partial<GraphicsStyle>) => {
    if (!style) return;
    setStyle({ ...style, ...patch });
    void window.roughCut?.setGraphicsStyle?.(patch).catch(() => undefined);
  };
  return (
    <details className="studioMore graphicsHouseStyle">
      <summary>House style</summary>
      <div className="studioMoreBody graphicsHouseStyleBody">
        {style ? (
          <>
            <div className="graphicsColorRow">
              {(['textColor', 'primaryColor', 'accentColor'] as const).map((key) => (
                <label key={key} className="graphicsField graphicsColorField">
                  <span>{key === 'textColor' ? 'Text' : key === 'primaryColor' ? 'Primary' : 'Accent'}</span>
                  <span className="graphicsColorControl">
                    <input type="color" value={style[key]} disabled={disabled} onChange={(event) => save({ [key]: event.target.value })} />
                    <span className="graphicsColorValue">{style[key].toUpperCase()}</span>
                  </span>
                </label>
              ))}
            </div>
            <label className="graphicsField">
              <span>Font</span>
              <input type="text" value={style.fontFamily} disabled={disabled} onChange={(event) => setStyle({ ...style, fontFamily: event.target.value })} onBlur={() => save({ fontFamily: style.fontFamily })} />
            </label>
            <label className="graphicsField">
              <span>Notes for Claude</span>
              <textarea rows={2} dir="auto" maxLength={400} value={style.notes} placeholder="Rounded corners, subtle shadow, no all-caps" disabled={disabled} onChange={(event) => setStyle({ ...style, notes: event.target.value })} onBlur={() => save({ notes: style.notes })} />
            </label>
          </>
        ) : <p className="graphicsEmpty">Loading…</p>}
      </div>
    </details>
  );
}
