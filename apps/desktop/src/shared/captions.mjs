// Captions: subtitles built from the project's transcript (word timings in source frames).
//
// Pure functions shared by the editor (preview + panel) and the export (burn-in), so both draw
// exactly the same lines at exactly the same times. Cues live in SOURCE frames like zoom markers;
// the export maps them onto the timeline through the clips.

export const CAPTION_POSITIONS = ['bottom', 'center', 'top'];

/** Languages captions can be created in (translated from the original, as spoken). */
export const CAPTION_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'he', label: 'Hebrew' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ru', label: 'Russian' },
  { code: 'ar', label: 'Arabic' },
];

export const DEFAULT_CAPTION_SETTINGS = {
  enabled: false,
  position: 'bottom',
  /** Text height as a percentage of the video height. */
  sizePct: 4.5,
  textColor: '#ffffff',
  /** 0 = no box behind the text, 1 = solid black box. */
  boxOpacity: 0.55,
};

/** Gap between the caption box and the top/bottom edge, as a share of the video height. */
export const CAPTION_EDGE_MARGIN = 0.015;

const MAX_CHARS = 38;
const MAX_CUE_SEC = 4;
const BREAK_GAP_SEC = 0.7;
const MIN_CUE_SEC = 0.9;

function isSentenceEnd(word) {
  return /[.!?…]["')\]]?$/.test(word);
}

/** Group transcript words into short, readable subtitle lines. */
export function buildCaptionCues(words, { fps = 30 } = {}) {
  const frameRate = Number.isFinite(fps) && fps > 0 ? fps : 30;
  const usable = (Array.isArray(words) ? words : [])
    .filter((item) => item && typeof item.word === 'string' && item.word.trim() && Number.isFinite(item.startFrame) && Number.isFinite(item.endFrame))
    .sort((a, b) => a.startFrame - b.startFrame);
  const groups = [];
  let current = null;
  for (const item of usable) {
    // The transcriber occasionally splits a Hebrew letter in two; drop the broken bytes (the
    // line can be corrected in the Captions panel) rather than burn a "�" into the video.
    const text = item.word.replace(/�/g, '').trim();
    if (!text) continue;
    if (current) {
      const last = current.words[current.words.length - 1];
      const gap = (item.startFrame - last.endFrame) / frameRate;
      const nextChars = current.chars + 1 + text.length;
      const span = (item.endFrame - current.startFrame) / frameRate;
      const sentenceDone = isSentenceEnd(last.text) && current.chars >= 14;
      if (gap > BREAK_GAP_SEC || nextChars > MAX_CHARS || span > MAX_CUE_SEC || sentenceDone) {
        groups.push(current);
        current = null;
      }
    }
    if (!current) current = { startFrame: item.startFrame, words: [], chars: 0 };
    current.words.push({ text, endFrame: item.endFrame });
    current.chars += (current.chars ? 1 : 0) + text.length;
    current.endFrame = item.endFrame;
  }
  if (current) groups.push(current);
  return groups.map((group, index) => {
    const next = groups[index + 1];
    // Hold a short line on screen long enough to read, but never into the next line.
    const readable = group.startFrame + Math.round(MIN_CUE_SEC * frameRate);
    const endFrame = Math.max(group.endFrame, next ? Math.min(readable, next.startFrame) : readable);
    return {
      id: `cap_${index}`,
      startFrame: group.startFrame,
      endFrame,
      text: group.words.map((entry) => entry.text).join(' '),
    };
  });
}

/** The project's captions: settings (defaults filled in) plus cues from its transcript. */
export function getCaptions(document) {
  const stored = document?.captions && typeof document.captions === 'object' ? document.captions : {};
  const settings = { ...DEFAULT_CAPTION_SETTINGS };
  if (typeof stored.enabled === 'boolean') settings.enabled = stored.enabled;
  if (CAPTION_POSITIONS.includes(stored.position)) settings.position = stored.position;
  if (Number.isFinite(stored.sizePct)) settings.sizePct = Math.max(2, Math.min(12, stored.sizePct));
  if (typeof stored.textColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(stored.textColor)) settings.textColor = stored.textColor;
  if (Number.isFinite(stored.boxOpacity)) settings.boxOpacity = Math.max(0, Math.min(1, stored.boxOpacity));
  return { settings, cues: resolveCues(document), tracks: listCaptionTracks(document), activeTrack: activeTrackId(document) };
}

export const ORIGINAL_CAPTION_TRACK = 'original';

function storedTracks(document) {
  const tracks = document?.captions?.tracks;
  return Array.isArray(tracks)
    ? tracks.filter((track) => track && typeof track.id === 'string' && track.id !== ORIGINAL_CAPTION_TRACK && Array.isArray(track.cues))
    : [];
}

function activeTrackId(document) {
  const wanted = document?.captions?.activeTrack;
  return typeof wanted === 'string' && storedTracks(document).some((track) => track.id === wanted) ? wanted : ORIGINAL_CAPTION_TRACK;
}

function cleanCues(cues) {
  return (Array.isArray(cues) ? cues : [])
    .filter((cue) => cue && typeof cue.id === 'string' && typeof cue.text === 'string' && Number.isFinite(cue.startFrame) && Number.isFinite(cue.endFrame) && cue.endFrame > cue.startFrame)
    .map((cue) => ({ id: cue.id, startFrame: cue.startFrame, endFrame: cue.endFrame, text: cue.text }))
    .sort((a, b) => a.startFrame - b.startFrame);
}

/** The caption sets the project has: the one from the recording's speech, plus any translated ones. */
export function listCaptionTracks(document) {
  return [
    { id: ORIGINAL_CAPTION_TRACK, label: 'Original', language: null },
    ...storedTracks(document).map((track) => ({ id: track.id, label: typeof track.label === 'string' && track.label ? track.label : track.id, language: typeof track.language === 'string' ? track.language : null })),
  ];
}

/** Lines of the original (speech) set, whichever set is showing: the source for translations. */
export function getOriginalCaptionCues(document) {
  return resolveOriginalCues(document);
}

/** Add (or replace) a caption set, e.g. an English translation, and show it. */
export function addCaptionTrack(document, { id, label, language = null, cues }) {
  const current = document?.captions && typeof document.captions === 'object' ? document.captions : {};
  const others = storedTracks(document).filter((track) => track.id !== id);
  return { ...document, captions: { ...current, activeTrack: id, tracks: [...others, { id, label, language, cues: cleanCues(cues) }] } };
}

/**
 * Add lines to a caption set without touching the ones already there: a new line that would overlap
 * an existing one (or reuse its id) is skipped, so everything the user already set stays exactly as is.
 * Returns { document, added }.
 */
export function addCaptionCuesToTrack(document, trackId, cues) {
  const current = document?.captions && typeof document.captions === 'object' ? document.captions : {};
  const isOriginal = trackId === ORIGINAL_CAPTION_TRACK;
  const tracks = storedTracks(document);
  if (!isOriginal && !tracks.some((track) => track.id === trackId)) return { document, added: 0 };
  const existing = isOriginal ? resolveOriginalCues(document) : cleanCues(tracks.find((track) => track.id === trackId)?.cues);
  const taken = new Set(existing.map((cue) => cue.id));
  const fresh = cleanCues(cues).filter((cue) => !taken.has(cue.id)
    && !existing.some((other) => cue.startFrame < other.endFrame && cue.endFrame > other.startFrame));
  if (fresh.length === 0) return { document, added: 0 };
  const merged = [...existing, ...fresh].sort((a, b) => a.startFrame - b.startFrame);
  if (isOriginal) {
    const { edits: _edits, ...rest } = current;
    return { document: { ...document, captions: { ...rest, cues: merged } }, added: fresh.length };
  }
  return {
    document: { ...document, captions: { ...current, tracks: tracks.map((track) => (track.id === trackId ? { ...track, cues: merged } : track)) } },
    added: fresh.length,
  };
}

/**
 * Replace the original (as spoken) lines with freshly transcribed speech: the words are grouped
 * into lines, any older edits are dropped, and the original set shows again.
 */
export function withTranscribedSpeech(document, words, { fps = 30, language = null } = {}) {
  const current = document?.captions && typeof document.captions === 'object' ? document.captions : {};
  // Translated sets were made from the old lines, so they are dropped with them.
  const { edits: _edits, tracks: _tracks, ...rest } = current;
  return { ...document, captions: { ...rest, activeTrack: ORIGINAL_CAPTION_TRACK, cues: buildCaptionCues(words, { fps }), speechLanguage: language } };
}

/** Choose which caption set shows in the video and the export. */
export function setActiveCaptionTrack(document, id) {
  const known = id === ORIGINAL_CAPTION_TRACK || storedTracks(document).some((track) => track.id === id);
  if (!known || activeTrackId(document) === id) return document;
  const current = document?.captions && typeof document.captions === 'object' ? document.captions : {};
  return { ...document, captions: { ...current, activeTrack: id } };
}

function transcriptFps(document) {
  return Number.isFinite(document?.transcription?.fps) && document.transcription.fps > 0 ? document.transcription.fps : 30;
}

/** Lines in source frames: the stored (edited) list when there is one, else built from the transcript. */
function resolveCues(document) {
  const active = activeTrackId(document);
  if (active !== ORIGINAL_CAPTION_TRACK) return cleanCues(storedTracks(document).find((track) => track.id === active)?.cues);
  return resolveOriginalCues(document);
}

function resolveOriginalCues(document) {
  const stored = document?.captions && typeof document.captions === 'object' ? document.captions : {};
  if (Array.isArray(stored.cues)) return cleanCues(stored.cues);
  const edits = stored.edits && typeof stored.edits === 'object' ? stored.edits : {};
  return buildCaptionCues(document?.transcript?.words, { fps: transcriptFps(document) }).map((cue) => (
    typeof edits[cue.id] === 'string' ? { ...cue, text: edits[cue.id] } : cue
  ));
}

/** Same document with the lines stored explicitly (so they can be added, moved, split and deleted). */
function withStoredCues(document, cues) {
  const current = document?.captions && typeof document.captions === 'object' ? document.captions : {};
  const active = activeTrackId(document);
  if (active !== ORIGINAL_CAPTION_TRACK) {
    return { ...document, captions: { ...current, tracks: storedTracks(document).map((track) => (track.id === active ? { ...track, cues } : track)) } };
  }
  const { edits: _edits, ...rest } = current;
  return { ...document, captions: { ...rest, cues } };
}

const MIN_CUE_FRAMES = 6;

function newCueId(cues) {
  let n = cues.length;
  const taken = new Set(cues.map((cue) => cue.id));
  while (taken.has(`cap_${n}`) || taken.has(`cap_n${n}`)) n += 1;
  return `cap_n${n}`;
}

/** Move / resize / reword one line. A line never overlaps its neighbours and never gets shorter than a few frames. */
export function updateCaption(document, cueId, patch) {
  const cues = resolveCues(document);
  const index = cues.findIndex((cue) => cue.id === cueId);
  if (index < 0) return document;
  const cue = cues[index];
  let startFrame = Number.isFinite(patch.startFrame) ? Math.round(patch.startFrame) : cue.startFrame;
  let endFrame = Number.isFinite(patch.endFrame) ? Math.round(patch.endFrame) : cue.endFrame;
  const text = typeof patch.text === 'string' ? patch.text : cue.text;
  const previousEnd = index > 0 ? cues[index - 1].endFrame : 0;
  const nextStart = index < cues.length - 1 ? cues[index + 1].startFrame : Infinity;
  const length = Math.max(MIN_CUE_FRAMES, endFrame - startFrame);
  startFrame = Math.max(previousEnd, startFrame);
  endFrame = Math.min(nextStart, Math.max(startFrame + MIN_CUE_FRAMES, startFrame + length));
  if (endFrame - startFrame < MIN_CUE_FRAMES) {
    // Squeezed between neighbours: keep the original place rather than invent overlap.
    startFrame = cue.startFrame;
    endFrame = cue.endFrame;
  }
  if (startFrame === cue.startFrame && endFrame === cue.endFrame && text === cue.text) return document;
  const next = cues.map((item, i) => (i === index ? { ...item, startFrame, endFrame, text } : item));
  return withStoredCues(document, next);
}

/** Add an empty line at a source frame, fitted into the free space there. Returns { document, id } or null. */
export function addCaption(document, atFrame, { lengthFrames = 60, text = '' } = {}) {
  const cues = resolveCues(document);
  const start = Math.max(0, Math.round(atFrame));
  if (cues.some((cue) => start >= cue.startFrame && start < cue.endFrame)) return null;
  const nextStart = cues.find((cue) => cue.startFrame >= start)?.startFrame ?? Infinity;
  const end = Math.min(nextStart, start + lengthFrames);
  if (end - start < MIN_CUE_FRAMES) return null;
  const id = newCueId(cues);
  const next = [...cues, { id, startFrame: start, endFrame: end, text }].sort((a, b) => a.startFrame - b.startFrame);
  return { document: withStoredCues(document, next), id };
}

export function removeCaption(document, cueId) {
  const cues = resolveCues(document);
  if (!cues.some((cue) => cue.id === cueId)) return document;
  return withStoredCues(document, cues.filter((cue) => cue.id !== cueId));
}

/** Split a line in two at a source frame; the words are divided in proportion to the time. Returns { document, ids } or null. */
export function splitCaption(document, cueId, atFrame) {
  const cues = resolveCues(document);
  const index = cues.findIndex((cue) => cue.id === cueId);
  if (index < 0) return null;
  const cue = cues[index];
  const at = Math.round(atFrame);
  if (at - cue.startFrame < MIN_CUE_FRAMES || cue.endFrame - at < MIN_CUE_FRAMES) return null;
  const words = cue.text.split(/\s+/).filter(Boolean);
  const ratio = (at - cue.startFrame) / (cue.endFrame - cue.startFrame);
  const cut = words.length > 1 ? Math.min(words.length - 1, Math.max(1, Math.round(words.length * ratio))) : words.length;
  const firstText = words.slice(0, cut).join(' ');
  const secondText = words.slice(cut).join(' ');
  const secondId = newCueId(cues);
  const next = [
    ...cues.slice(0, index),
    { ...cue, endFrame: at, text: firstText },
    { id: secondId, startFrame: at, endFrame: cue.endFrame, text: secondText },
    ...cues.slice(index + 1),
  ];
  return { document: withStoredCues(document, next), ids: [cue.id, secondId] };
}

/** Return the document with caption settings changed (kept in `document.captions`). */
export function withCaptionSettings(document, patch) {
  const current = document?.captions && typeof document.captions === 'object' ? document.captions : {};
  return { ...document, captions: { ...current, ...patch } };
}

/** Return the document with one line's wording changed (empty text hides that line). */
export function withCaptionEdit(document, cueId, text) {
  return updateCaption(document, cueId, { text });
}

/** The line to show at a source frame, or null (empty edited text counts as hidden). */
export function captionAtSourceFrame(cues, frame) {
  if (!Array.isArray(cues) || !Number.isFinite(frame)) return null;
  const cue = cues.find((item) => frame >= item.startFrame && frame < item.endFrame);
  return cue && cue.text.trim() ? cue : null;
}

function assColor(hex, alpha = 0) {
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  const a = Math.round(Math.max(0, Math.min(255, alpha))).toString(16).padStart(2, '0');
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

function assTime(frame, fps) {
  const totalCs = Math.max(0, Math.round((frame / fps) * 100));
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

const RTL_LETTERS = /[֐-ࣿ]/;

/** 'rtl' for a line with any Hebrew/Arabic letters (even one that starts with an English term), else 'ltr'. */
export function captionTextDirection(text) {
  return RTL_LETTERS.test(String(text ?? '')) ? 'rtl' : 'ltr';
}

function assText(text) {
  const clean = String(text).replace(/\\/g, '').replace(/[{}]/g, '').replace(/\r?\n/g, '\\N');
  // A Hebrew line is right-to-left from its first word, even when it opens with an English term:
  // embed it as RTL (RLE ... PDF) instead of letting the first letter pick the direction.
  return captionTextDirection(clean) === 'rtl' ? `‫${clean}‬` : clean;
}

/**
 * An ASS subtitle file for the exporter. `cues` are in TIMELINE frames. libass shapes and orders
 * Hebrew/Arabic (right-to-left) text itself, so Hebrew captions come out the right way round.
 */
export function buildCaptionsAss(cues, { width, height, fps = 30, settings = DEFAULT_CAPTION_SETTINGS } = {}) {
  const w = Math.round(width);
  const h = Math.round(height);
  const fontSize = Math.round((settings.sizePct / 100) * h);
  const alignment = settings.position === 'top' ? 8 : settings.position === 'center' ? 5 : 2;
  // Close to the edge of the picture: the strip below the screen recording is empty, while a
  // higher caption would sit on top of the screen's own buttons.
  const marginV = Math.round(h * CAPTION_EDGE_MARGIN);
  // BorderStyle 3 paints an opaque box behind the text; its alpha comes from BackColour.
  const boxAlpha = Math.round((1 - settings.boxOpacity) * 255);
  const boxed = settings.boxOpacity > 0;
  const style = [
    'Default', 'Heebo', fontSize,
    assColor(settings.textColor), assColor(settings.textColor), assColor('#000000', 0), assColor('#000000', boxAlpha),
    -1, 0, 0, 0, 100, 100, 0, 0,
    boxed ? 3 : 1, boxed ? Math.round(fontSize * 0.28) : Math.max(2, Math.round(fontSize * 0.06)), 0,
    alignment, Math.round(w * 0.06), Math.round(w * 0.06), marginV, 1,
  ].join(',');
  const lines = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${w}`,
    `PlayResY: ${h}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding',
    `Style: ${style}`,
    '',
    '[Events]',
    'Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text',
  ];
  for (const cue of cues) {
    if (!cue.text.trim() || !(cue.endFrame > cue.startFrame)) continue;
    lines.push(`Dialogue: 0,${assTime(cue.startFrame, fps)},${assTime(cue.endFrame, fps)},Default,,0,0,0,,${assText(cue.text)}`);
  }
  return `${lines.join('\n')}\n`;
}
