// Captions: subtitles built from the project's transcript (word timings in source frames).
//
// Pure functions shared by the editor (preview + panel) and the export (burn-in), so both draw
// exactly the same lines at exactly the same times. Cues live in SOURCE frames like zoom markers;
// the export maps them onto the timeline through the clips.

export const CAPTION_POSITIONS = ['bottom', 'center', 'top'];

export const DEFAULT_CAPTION_SETTINGS = {
  enabled: false,
  position: 'bottom',
  /** Text height as a percentage of the video height. */
  sizePct: 5,
  textColor: '#ffffff',
  /** 0 = no box behind the text, 1 = solid black box. */
  boxOpacity: 0.55,
};

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
    const text = item.word.trim();
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
  const edits = stored.edits && typeof stored.edits === 'object' ? stored.edits : {};
  const fps = Number.isFinite(document?.transcription?.fps) && document.transcription.fps > 0 ? document.transcription.fps : 30;
  const cues = buildCaptionCues(document?.transcript?.words, { fps }).map((cue) => (
    typeof edits[cue.id] === 'string' ? { ...cue, text: edits[cue.id] } : cue
  ));
  return { settings, cues };
}

/** Return the document with caption settings changed (kept in `document.captions`). */
export function withCaptionSettings(document, patch) {
  const current = document?.captions && typeof document.captions === 'object' ? document.captions : {};
  return { ...document, captions: { ...current, ...patch } };
}

/** Return the document with one line's wording changed (empty text hides that line). */
export function withCaptionEdit(document, cueId, text) {
  const current = document?.captions && typeof document.captions === 'object' ? document.captions : {};
  return { ...document, captions: { ...current, edits: { ...(current.edits ?? {}), [cueId]: text } } };
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

function assText(text) {
  return String(text).replace(/\\/g, '').replace(/[{}]/g, '').replace(/\r?\n/g, '\\N');
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
  const marginV = Math.round(h * 0.06);
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
