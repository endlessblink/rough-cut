import React from 'react';
import {
  ArrowClockwise as PhosphorArrowClockwise,
  MagicWand as PhosphorMagicWand,
  Trash as PhosphorTrash,
} from '@phosphor-icons/react';

import { DEFAULT_GRAPHIC_LAYOUT, type GraphicEntrance, type GraphicField, type GraphicLayout, type TimelineGraphic } from '../../shared/motion-graphics.mjs';
import { cancelGraphicJob, graphicJobProgress, graphicJobSecondsLeft, startGraphicJob, useGraphicJob, type GraphicJob } from './graphics-job';
import { CREATIVITY_LEVELS, DEFAULT_CREATIVITY, DEFAULT_GRAPHICS_STYLE_ID, GRAPHIC_STYLES, normalizeCreativity, resolveGraphicStyle } from '../../shared/graphics-styles.mjs';

export type GraphicsStyle = {
  fontFamily: string;
  textColor: string;
  primaryColor: string;
  accentColor: string;
  notes: string;
  styleId: string;
  creativity: number;
  styleLock?: boolean;
};

export type GeneratedGraphic = {
  title: string;
  html: string;
  fields: GraphicField[];
  durationSec: number;
  startSec: number | null;
  /** Which design direction Claude was given (kept so the next one differs). */
  direction?: string | null;
};

type GraphicsTab = 'create' | 'edit' | 'style';
const GRAPHICS_TABS: readonly { id: GraphicsTab; label: string }[] = [
  { id: 'create', label: 'Create' },
  { id: 'edit', label: 'Edit' },
  { id: 'style', label: 'Style' },
];

type Busy = { kind: 'new' | 'change'; requestId: string } | null;

function formatClock(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${minutes}:${String(secs).padStart(2, '0')}`;
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
  onFieldsChange,
  onAnimateChange,
  onLayoutChange,
  onReorder,
  onTimingChange,
  onRemove,
}: {
  graphics: readonly TimelineGraphic[];
  selectedGraphicId: string | null;
  fps: number;
  canvas: { width: number; height: number };
  disabled?: boolean;
  onSelect: (id: string | null) => void;
  onFieldsChange: (id: string, values: Record<string, string | number>) => void;
  onAnimateChange: (id: string, animate: boolean) => void;
  /** `commit: false` is a live preview while dragging; `true` saves one undo step. */
  onLayoutChange: (id: string, patch: Partial<GraphicLayout>, commit: boolean) => void;
  /** Layer order where graphics overlap in time: front draws on top. */
  onReorder: (id: string, where: 'front' | 'back') => void;
  /** Hold the designed timing, or stretch the whole animation to the new length. */
  onTimingChange: (id: string, timing: 'hold' | 'stretch') => void;
  onRemove: (id: string) => void;
}) {
  const [request, setRequest] = React.useState('');
  const [connection, setConnection] = React.useState<{ ok: boolean; status: string; reason: string } | null>(null);
  const [checkingConnection, setCheckingConnection] = React.useState(false);
  const connectionRequestRef = React.useRef(0);
  const checkConnection = React.useCallback(async () => {
    const requestId = ++connectionRequestRef.current;
    setCheckingConnection(true);
    try {
      const next = await window.roughCut.getClaudeConnection();
      if (requestId === connectionRequestRef.current) setConnection(next);
    } catch {
      if (requestId === connectionRequestRef.current) setConnection({ ok: false, status: 'unavailable', reason: 'Could not check Claude Code. Run claude auth status in your terminal, then check again.' });
    } finally {
      if (requestId === connectionRequestRef.current) setCheckingConnection(false);
    }
  }, []);
  React.useEffect(() => { void checkConnection(); return () => { connectionRequestRef.current++; }; }, [checkConnection]);
  const [changeRequest, setChangeRequest] = React.useState('');
  // The generation lives outside this panel so switching tabs keeps it going.
  const { job, problem } = useGraphicJob();
  const busy: Busy = job ? { kind: job.kind, requestId: job.requestId } : null;
  // Length for the next graphic: 0 = let Claude decide.
  const [lengthSec, setLengthSec] = React.useState(0);
  // The look for the next generation; remembered across sessions.
  const [look, setLook] = React.useState<{ styleId: string; creativity: number; styleLock: boolean }>({ styleId: DEFAULT_GRAPHICS_STYLE_ID, creativity: DEFAULT_CREATIVITY, styleLock: false });
  React.useEffect(() => {
    let cancelled = false;
    void window.roughCut?.getGraphicsStyle?.().then((saved: GraphicsStyle) => {
      if (!cancelled && saved) setLook({ styleId: resolveGraphicStyle(saved.styleId).id, creativity: normalizeCreativity(saved.creativity), styleLock: saved.styleLock === true });
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const changeLook = (patch: Partial<{ styleId: string; creativity: number; styleLock: boolean }>) => {
    setLook((current) => ({ ...current, ...patch }));
    void window.roughCut?.setGraphicsStyle?.(patch).catch(() => undefined);
  };
  const selected = graphics.find((graphic) => graphic.id === selectedGraphicId) ?? null;
  const [tab, setTab] = React.useState<GraphicsTab>(selectedGraphicId ? 'edit' : 'create');
  // Picking a graphic (list, timeline block or viewer) opens the tab that edits it.
  React.useEffect(() => {
    if (selectedGraphicId) setTab('edit');
  }, [selectedGraphicId]);
  const currentStyle = resolveGraphicStyle(look.styleId);
  const available = typeof window !== 'undefined' && typeof window.roughCut?.generateGraphic === 'function';

  async function run(kind: 'new' | 'change') {
    const text = (kind === 'new' ? request : changeRequest).trim();
    if (!text || busy || !available || disabled || checkingConnection || !connection?.ok) return;
    if (kind === 'change' && !selected) return;
    const ok = await startGraphicJob({
      kind,
      targetId: kind === 'change' && selected ? selected.id : null,
      request: text,
      payload: {
        canvas,
        fps,
        styleId: look.styleId,
        creativity: look.creativity,
        styleLock: look.styleLock,
        // What is already in the video, so a new graphic is a new idea, not a re-skin.
        others: kind === 'new' ? graphics.map((graphic) => `${graphic.title}${graphic.request ? ` (asked: ${graphic.request.slice(0, 100)})` : ''}`) : [],
        usedDirections: graphics.map((graphic) => graphic.direction).filter(Boolean),
        lengthSec: kind === 'new' && lengthSec > 0 ? lengthSec : null,
        existing: kind === 'change' && selected
          ? { title: selected.title, html: selected.html, fields: selected.fields, durationSec: (selected.endFrame - selected.startFrame) / fps }
          : null,
      },
    });
    if (ok) {
      if (kind === 'new') setRequest('');
      else setChangeRequest('');
    }
  }

  function cancel() {
    cancelGraphicJob();
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

      <section className="inspectorSection" aria-label="Claude connection" data-claude-connection={connection?.status ?? 'checking'}>
        <div className="inspectorSectionHead"><p className="eyebrow">Your Claude subscription</p></div>
        <p role="status">{checkingConnection ? 'Checking Claude Code…' : connection?.reason}</p>
        <details open={connection?.ok === false}>
          <summary>Connect through Claude Code</summary>
          <ol>
            <li>Install the official Claude Code CLI, version 2.1.248 or later.</li>
            <li>Run <code>claude auth login</code> in your terminal and sign in through Anthropic’s browser flow with your own subscription.</li>
            <li>Run <code>claude auth status</code>, then check your connection below.</li>
          </ol>
          <p>Requires a Claude plan with Claude Code access. Your plan limits apply. This app uses the official CLI; it does not collect passwords, tokens or API keys.</p>
          <p>Graphic requests and design context go to Claude. Requests and answers are kept in local diagnostics. Recording and editing work without Claude.</p>
        </details>
        <button type="button" className="secondary compact" disabled={checkingConnection} onClick={() => { void checkConnection(); }}>Check connection</button>
      </section>

      <div className="graphicsTabBar">
        <div className="segmentedPicker graphicsTabs" role="tablist" aria-label="Graphics sections" data-graphics-tabs="true">
          {GRAPHICS_TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`graphics-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`graphics-tabpanel-${id}`}
              className={`segmentedOption${tab === id ? ' active' : ''}`}
              onClick={() => setTab(id)}
              data-graphics-tab={id}
            >
              <span className="segmentedLabel">{label}</span>
              {id === 'edit' && graphics.length > 0 ? <span className="graphicsTabCount">{graphics.length}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {tab === 'create' ? (
        <div className="graphicsTabPanel" role="tabpanel" id="graphics-tabpanel-create" aria-labelledby="graphics-tab-create" data-graphics-tabpanel="create">
          <section className="inspectorSection" data-inspector-group="graphics-new" aria-label="Make a graphic">
            <label className="graphicsField graphicsRequest">
              <span className="srOnly">Describe the graphic</span>
              <textarea
                value={request}
                rows={4}
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
            <LengthRange value={lengthSec} disabled={controlsDisabled || busy !== null} onChange={setLengthSec} />
            <button type="button" className="graphicsLookSummary" onClick={() => setTab('style')} title="Change the style Claude designs in" data-graphics-look-summary="true">
              <span className="graphicsStyleSwatch" style={{ background: currentStyle.swatch[0] }} aria-hidden="true">
                <span className="graphicsStyleSwatchInk" style={{ background: currentStyle.swatch[1] }} />
                <span className="graphicsStyleSwatchAccent" style={{ background: currentStyle.swatch[2] }} />
              </span>
              <span className="graphicsLookSummaryText">
                <span className="graphicsStyleName">{currentStyle.label}</span>
                <span className="graphicsStyleMood">{look.styleLock ? 'Locked' : 'Light influence'} · {CREATIVITY_LEVELS[look.creativity - 1]?.label}</span>
              </span>
              <span className="graphicsLookSummaryAction">Change</span>
            </button>
            <div className="graphicsActions">
              {busy?.kind === 'new' ? (
                <>
                  <GraphicJobProgressBar job={job!} />
                  <button type="button" className="secondary compact" onClick={cancel}>Cancel</button>
                </>
              ) : (
                <button
                  type="button"
                  className="compact graphicsGenerate"
                  disabled={controlsDisabled || !connection?.ok || checkingConnection || busy !== null || !request.trim()}
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
        </div>
      ) : null}

      {tab === 'edit' ? (
        <div className="graphicsTabPanel" role="tabpanel" id="graphics-tabpanel-edit" aria-labelledby="graphics-tab-edit" data-graphics-tabpanel="edit">
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
              <p className="graphicsEmpty">Nothing yet. Describe one in Create and it lands on the Graphics lane at the playhead.</p>
            )}
          </section>

          <section className={`inspectorSection${selected ? '' : ' mutedSection'}`} data-inspector-group="graphics-selected" aria-label="Selected graphic">
            <div className="inspectorSectionHead">
              <p className="eyebrow">{selected ? 'Selected graphic' : 'No graphic selected'}</p>
              {selected ? (
                <div className="inspectorSectionAction">
                  <button type="button" className="textButton" disabled={disabled} onClick={() => onReorder(selected.id, 'front')} title="Draw this graphic on top of graphics it overlaps" data-graphics-order="front">To front</button>
                  <button type="button" className="textButton" disabled={disabled} onClick={() => onReorder(selected.id, 'back')} title="Draw this graphic behind graphics it overlaps" data-graphics-order="back">To back</button>
                  <button type="button" className="textButton graphicsDelete" disabled={disabled || busy !== null} onClick={() => onRemove(selected.id)}>
                    <PhosphorTrash size={14} weight="regular" aria-hidden /> Delete
                  </button>
                </div>
              ) : null}
            </div>
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
                  <GraphicJobProgressBar job={job!} />
                  <button type="button" className="secondary compact" onClick={cancel}>Cancel</button>
                </>
              ) : (
                <button
                  type="button"
                  className="secondary compact"
                  disabled={controlsDisabled || !connection?.ok || checkingConnection || !selected || busy !== null || !changeRequest.trim()}
                  onClick={() => void run('change')}
                >
                  <PhosphorArrowClockwise size={16} weight="regular" aria-hidden /> Apply change
                </button>
              )}
            </div>
          </section>

          <details className="graphicsGroup" data-graphics-group="motion">
            <summary>Motion &amp; length</summary>
            <div className="graphicsGroupBody">
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
              {selected ? (
                <GraphicTimingControl
                  graphic={selected}
                  fps={fps}
                  disabled={disabled || busy !== null}
                  onChange={(timing) => onTimingChange(selected.id, timing)}
                />
              ) : null}
              {selected ? (
                <GraphicEntranceControls
                  key={selected.id}
                  layout={selected.layout}
                  disabled={disabled || busy !== null}
                  onChange={(patch, commit) => onLayoutChange(selected.id, patch, commit)}
                />
              ) : <p className="graphicsEmpty">Select a graphic to set its motion.</p>}
            </div>
          </details>

          <details className="graphicsGroup" data-graphics-group="placement">
            <summary>Size &amp; position</summary>
            <div className="graphicsGroupBody">
              {selected ? (
                <GraphicPlacementControls
                  key={selected.id}
                  layout={selected.layout}
                  disabled={disabled || busy !== null}
                  onChange={(patch, commit) => onLayoutChange(selected.id, patch, commit)}
                />
              ) : <p className="graphicsEmpty">Select a graphic to set its size and position. You can also drag it on the viewer.</p>}
            </div>
          </details>
        </div>
      ) : null}

      {tab === 'style' ? (
        <div className="graphicsTabPanel" role="tabpanel" id="graphics-tabpanel-style" aria-labelledby="graphics-tab-style" data-graphics-tabpanel="style">
          <section className="inspectorSection" data-inspector-group="graphics-look" aria-label="Style for new graphics">
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
              <label className="toggleField inspectorToggle" title={look.styleLock ? 'Claude follows this style closely: same colours, type and feel every time' : 'The style only flavours each graphic; Claude picks its own look each time'}>
                <span>Lock style</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={look.styleLock}
                  disabled={controlsDisabled || busy !== null}
                  onChange={(event) => changeLook({ styleLock: event.currentTarget.checked })}
                  data-graphics-style-lock="true"
                />
              </label>
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
          </section>
          <HouseStyle disabled={controlsDisabled} />
        </div>
      ) : null}
    </aside>
  );
}

const ENTRANCE_OPTIONS: readonly { value: GraphicEntrance; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade' },
  { value: 'rise', label: 'Rise' },
  { value: 'pop', label: 'Pop' },
  { value: 'slide', label: 'Slide' },
];

type LayoutControlProps = {
  layout: GraphicLayout;
  disabled: boolean;
  onChange: (patch: Partial<GraphicLayout>, commit: boolean) => void;
};

/** How the whole graphic enters: style and speed. */
function GraphicEntranceControls({ layout, disabled, onChange }: LayoutControlProps) {
  return (
    <div className="graphicsLayout" data-graphics-layout="true">
      <div className="graphicsField">
        <span>Entrance</span>
        <div className="segmentedPicker" role="radiogroup" aria-label="Entrance">
          {ENTRANCE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={layout.entrance === option.value}
              disabled={disabled}
              className={`segmentedOption${layout.entrance === option.value ? ' active' : ''}`}
              onClick={() => onChange({ entrance: option.value }, true)}
              data-graphic-entrance={option.value}
            >
              <span className="segmentedLabel">{option.label}</span>
            </button>
          ))}
        </div>
      </div>
      <LayoutRange label="Entrance length" value={layout.entranceSec} min={0.15} max={2} step={0.05} format={(v) => `${v.toFixed(2)}s`} disabled={disabled || layout.entrance === 'none'} onChange={(v, commit) => onChange({ entranceSec: v }, commit)} />
    </div>
  );
}

/**
 * Size, position and opacity. Sliders preview live while dragged and save once
 * on release (one undo step). The same move/resize also works by dragging the
 * graphic on the viewer.
 */
function GraphicPlacementControls({ layout, disabled, onChange }: LayoutControlProps) {
  const isDefault = (Object.keys(DEFAULT_GRAPHIC_LAYOUT) as (keyof GraphicLayout)[])
    .every((key) => layout[key] === DEFAULT_GRAPHIC_LAYOUT[key]);
  return (
    <div className="graphicsLayout" data-graphics-placement="true">
      <LayoutRange label="Size" value={layout.scale} min={0.25} max={3} step={0.01} format={(v) => `${Math.round(v * 100)}%`} disabled={disabled} onChange={(v, commit) => onChange({ scale: v }, commit)} />
      <LayoutRange label="Left / right" value={layout.x} min={-1} max={1} step={0.005} format={(v) => `${Math.round(v * 100)}%`} disabled={disabled} onChange={(v, commit) => onChange({ x: v }, commit)} />
      <LayoutRange label="Up / down" value={layout.y} min={-1} max={1} step={0.005} format={(v) => `${Math.round(v * 100)}%`} disabled={disabled} onChange={(v, commit) => onChange({ y: v }, commit)} />
      <LayoutRange label="Opacity" value={layout.opacity} min={0.1} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} disabled={disabled} onChange={(v, commit) => onChange({ opacity: v }, commit)} />
      <div className="graphicsActions">
        <button type="button" className="textButton" disabled={disabled || isDefault} onClick={() => onChange({ ...DEFAULT_GRAPHIC_LAYOUT }, true)} data-graphics-layout-reset="true">
          Reset size &amp; motion
        </button>
      </div>
    </div>
  );
}

function LayoutRange({ label, value, min, max, step, format, disabled, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  disabled: boolean;
  onChange: (value: number, commit: boolean) => void;
}) {
  const [draft, setDraft] = React.useState(value);
  const editingRef = React.useRef(false);
  React.useEffect(() => {
    if (!editingRef.current) setDraft(value);
  }, [value]);
  const progress = Math.max(0, Math.min(100, ((draft - min) / (max - min)) * 100));
  const preview = (next: number) => {
    setDraft(next);
    onChange(next, false);
  };
  const commit = (next: number) => {
    editingRef.current = false;
    setDraft(next);
    onChange(next, true);
  };
  return (
    <label className="rangeField">
      <span>{label}</span>
      <span className="rangeControl" style={{ '--range-progress': `${progress}%` } as React.CSSProperties}>
        <span className="rangeVisual" aria-hidden="true">
          <span className="rangeFill" />
          <span className="rangeThumb" />
        </span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={draft}
          disabled={disabled}
          onPointerDown={() => { editingRef.current = true; }}
          onChange={(event) => preview(Number(event.currentTarget.value))}
          onPointerUp={(event) => commit(Number(event.currentTarget.value))}
          onKeyUp={(event) => commit(Number(event.currentTarget.value))}
          onBlur={() => { if (editingRef.current) commit(draft); }}
          onWheelCapture={(event) => { event.preventDefault(); event.currentTarget.blur(); }}
        />
      </span>
      <output>{format(draft)}</output>
    </label>
  );
}

/**
 * Progress tied to the real generation: the stage comes from the app (Claude
 * writing, the safety check, a second try), the pace from how long answers
 * have actually taken on this computer.
 */
function GraphicJobProgressBar({ job }: { job: GraphicJob }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  const progress = graphicJobProgress(job, now);
  const left = graphicJobSecondsLeft(job, now);
  const label = job.stage === 'checking'
    ? 'Checking the result…'
    : job.attempt > 1
      ? 'Second try — fixing a problem in the first answer…'
      : job.kind === 'change' ? 'Claude is revising…' : 'Claude is designing…';
  const hint = job.stage === 'checking' ? '' : left > 0 ? `about ${left}s left` : 'taking a little longer than usual…';
  return (
    <div className="graphicsJob" role="status" aria-live="polite" data-graphics-job={job.stage}>
      <div className="graphicsJobText"><span>{label}</span><span className="graphicsJobHint">{hint}</span></div>
      <div className="graphicsJobTrack" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <div className="graphicsJobFill" style={{ transform: `scaleX(${progress})` }} />
      </div>
    </div>
  );
}

/** Length of the next graphic: Auto (Claude decides) or 2–60 s. */
function LengthRange({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (value: number) => void }) {
  const progress = (value / 60) * 100;
  return (
    <label className="rangeField" data-graphics-length="true" title="Up to one minute. Long graphics are built as several beats, not one stretched animation.">
      <span>Length</span>
      <span className="rangeControl" style={{ '--range-progress': `${progress}%` } as React.CSSProperties}>
        <span className="rangeVisual" aria-hidden="true">
          <span className="rangeFill" />
          <span className="rangeThumb" />
        </span>
        <input
          type="range"
          min={0}
          max={60}
          step={1}
          value={value}
          disabled={disabled}
          aria-valuetext={value === 0 ? 'Auto' : `${value} seconds`}
          onChange={(event) => {
            const next = Number(event.currentTarget.value);
            onChange(next > 0 && next < 2 ? 2 : next);
          }}
          onWheelCapture={(event) => { event.preventDefault(); event.currentTarget.blur(); }}
        />
      </span>
      <output>{value === 0 ? 'Auto' : `${value} s`}</output>
    </label>
  );
}

/**
 * What happens when a graphic is made longer or shorter on the timeline:
 * Hold keeps its designed timing (the middle holds longer), Stretch plays the
 * whole animation slower or faster to fill the new length.
 */
function GraphicTimingControl({ graphic, fps, disabled, onChange }: {
  graphic: TimelineGraphic;
  fps: number;
  disabled: boolean;
  onChange: (timing: 'hold' | 'stretch') => void;
}) {
  const now = (graphic.endFrame - graphic.startFrame) / fps;
  const designed = graphic.designedSec;
  const changed = designed !== null && Math.abs(designed - now) > 0.05;
  return (
    <div className="graphicsField graphicsTiming" data-graphics-timing="true">
      <span>
        When the length changes
        <em className="graphicsLookValue">{designed === null ? `${now.toFixed(1)} s` : changed ? `made for ${designed.toFixed(1)} s · now ${now.toFixed(1)} s` : `${now.toFixed(1)} s`}</em>
      </span>
      <div className="segmentedPicker" role="radiogroup" aria-label="When the length changes">
        {([['hold', 'Hold'], ['stretch', 'Stretch']] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={graphic.timing === value}
            disabled={disabled || (value === 'stretch' && designed === null)}
            className={`segmentedOption${graphic.timing === value ? ' active' : ''}`}
            title={value === 'hold' ? 'Keep the designed timing; the middle holds for the extra time' : 'Play the whole animation slower or faster to fill the length'}
            onClick={() => onChange(value)}
            data-graphics-timing-option={value}
          >
            <span className="segmentedLabel">{label}</span>
          </button>
        ))}
      </div>
    </div>
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
    <section className="inspectorSection graphicsHouseStyle" data-inspector-group="graphics-house" aria-label="House style">
      <div className="inspectorSectionHead"><p className="eyebrow">House style</p></div>
      <div className="graphicsHouseStyleBody">
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
    </section>
  );
}
