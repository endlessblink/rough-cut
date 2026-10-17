import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addCaptionCuesToTrack,
  withTranscribedSpeech,
  captionTextDirection,
  addCaptionTrack,
  getOriginalCaptionCues,
  setActiveCaptionTrack,
  addCaption,
  removeCaption,
  splitCaption,
  updateCaption,
  buildCaptionCues,
  buildCaptionsAss,
  captionAtSourceFrame,
  DEFAULT_CAPTION_SETTINGS,
  getCaptions,
  withCaptionEdit,
  withCaptionSettings,
} from './captions.mjs';

const word = (text, startFrame, endFrame) => ({ word: text, startFrame, endFrame });

test('words become short lines that break on pauses, length and sentence ends', () => {
  const words = [
    word('אז', 0, 20), word('בואו', 20, 40), word('נתחיל.', 40, 70),
    word('היום', 75, 95), word('נדבר', 95, 120),
    word('על', 240, 250), word('משהו', 250, 280),
  ];
  const cues = buildCaptionCues(words, { fps: 30 });
  assert.deepEqual(cues.map((cue) => cue.text), ['אז בואו נתחיל.', 'היום נדבר', 'על משהו']);
  assert.equal(cues[0].startFrame, 0);
  // A short line is held long enough to read, but never into the next line.
  assert.ok(cues[1].endFrame - cues[1].startFrame >= 27 - 1);
  assert.ok(cues[1].endFrame <= cues[2].startFrame);
});

test('captions are off by default and cues come from the transcript', () => {
  const doc = { transcription: { fps: 30 }, transcript: { words: [word('hello', 0, 30), word('world', 30, 60)] } };
  const { settings, cues } = getCaptions(doc);
  assert.equal(settings.enabled, false);
  assert.deepEqual(cues.map((cue) => cue.text), ['hello world']);
  assert.deepEqual(getCaptions({}).cues, []);
});

test('settings and edits are kept in the document; an emptied line is hidden', () => {
  let doc = { transcript: { words: [word('hello', 0, 30)] } };
  doc = withCaptionSettings(doc, { enabled: true, position: 'top' });
  doc = withCaptionEdit(doc, 'cap_0', 'fixed');
  const { settings, cues } = getCaptions(doc);
  assert.equal(settings.enabled, true);
  assert.equal(settings.position, 'top');
  assert.equal(cues[0].text, 'fixed');
  assert.equal(captionAtSourceFrame(cues, 10)?.text, 'fixed');
  assert.equal(captionAtSourceFrame(withCaptionEdit(doc, 'cap_0', '  ') && getCaptions(withCaptionEdit(doc, 'cap_0', '  ')).cues, 10), null);
  assert.equal(captionAtSourceFrame(cues, 500), null);
});

const base = () => ({ transcription: { fps: 30 }, transcript: { words: [word('one', 0, 30), word('two', 30, 60), word('three', 200, 260)] } });

test('lines can be added, moved, split and deleted; each keeps clear of its neighbours', () => {
  let doc = base();
  assert.deepEqual(getCaptions(doc).cues.map((c) => c.text), ['one two', 'three']);

  // Add into free space (English text works the same as Hebrew); inside an existing line is refused.
  assert.equal(addCaption(doc, 10, {}), null);
  const added = addCaption(doc, 100, { lengthFrames: 300, text: 'A new line' });
  assert.ok(added);
  doc = added.document;
  const addedCue = getCaptions(doc).cues.find((c) => c.id === added.id);
  assert.equal(addedCue.startFrame, 100);
  assert.equal(addedCue.endFrame, 200, 'trimmed to the next line, not overlapping it');

  // Moving into a neighbour is clamped.
  const moved = updateCaption(doc, added.id, { startFrame: 20, endFrame: 120 });
  const movedCue = getCaptions(moved).cues.find((c) => c.id === added.id);
  assert.ok(movedCue.startFrame >= 60, 'cannot start before the previous line ends');
  assert.ok(movedCue.endFrame - movedCue.startFrame >= 6);

  // Split divides the words by time.
  const split = splitCaption(doc, getCaptions(doc).cues[0].id, 30);
  assert.deepEqual(getCaptions(split.document).cues.slice(0, 2).map((c) => c.text), ['one', 'two']);
  assert.equal(splitCaption(doc, getCaptions(doc).cues[0].id, 2), null, 'too close to the edge');

  const removed = removeCaption(doc, added.id);
  assert.deepEqual(getCaptions(removed).cues.map((c) => c.text), ['one two', 'three']);
});

test('a translated caption set can be added, picked, and edited without touching the original', () => {
  const doc = base();
  const original = getCaptions(doc).cues;
  let next = addCaptionTrack(doc, {
    id: 'en',
    label: 'English',
    language: 'en',
    cues: original.map((cue) => ({ ...cue, text: `EN ${cue.text}` })),
  });
  // The new set shows right away; the original is still there to switch back to.
  assert.equal(getCaptions(next).activeTrack, 'en');
  assert.deepEqual(getCaptions(next).tracks.map((t) => t.id), ['original', 'en']);
  assert.equal(getCaptions(next).cues[0].text, 'EN one two');

  // Edits go to the set that is showing.
  next = updateCaption(next, getCaptions(next).cues[0].id, { text: 'Fixed english' });
  assert.equal(getCaptions(next).cues[0].text, 'Fixed english');
  next = setActiveCaptionTrack(next, 'original');
  assert.equal(getCaptions(next).cues[0].text, 'one two');
  assert.deepEqual(getOriginalCaptionCues(next).map((c) => c.text), ['one two', 'three']);

  // An unknown set is ignored; regenerating replaces the same set.
  assert.equal(setActiveCaptionTrack(next, 'fr'), next);
  next = addCaptionTrack(next, { id: 'en', label: 'English', language: 'en', cues: original });
  assert.equal(getCaptions(next).tracks.filter((t) => t.id === 'en').length, 1);
});

test('re-transcribing the speech replaces the original lines and drops translations made from the old ones', () => {
  let doc = addCaptionTrack(base(), { id: 'he', label: 'Hebrew', language: 'he', cues: [{ id: 'x', startFrame: 0, endFrame: 30, text: 'old' }] });
  doc = withTranscribedSpeech(doc, [word('Hello', 0, 20), word('there', 20, 40)], { fps: 30, language: 'en' });
  const { cues, tracks, activeTrack } = getCaptions(doc);
  assert.deepEqual(cues.map((c) => c.text), ['Hello there']);
  assert.deepEqual(tracks.map((t) => t.id), ['original']);
  assert.equal(activeTrack, 'original');
  assert.equal(doc.captions.speechLanguage, 'en');
});

test('adding captions for one section never overwrites lines the user already has', () => {
  // Original has lines at 0-60 and 200-260; the user's section covers 100-400 and has no lines yet except 200-260.
  const doc = base();
  const incoming = [
    { id: 's_0', startFrame: 100, endFrame: 150, text: 'new one' },
    { id: 's_1', startFrame: 210, endFrame: 250, text: 'overlaps the user\'s line' },
    { id: 's_2', startFrame: 300, endFrame: 360, text: 'new two' },
  ];
  const { document: next, added } = addCaptionCuesToTrack(doc, 'original', incoming);
  assert.equal(added, 2);
  assert.deepEqual(getCaptions(next).cues.map((c) => c.text), ['one two', 'new one', 'three', 'new two']);
  assert.equal(getCaptions(next).cues.find((c) => c.text === 'three').startFrame, 200, 'existing line untouched');
  // A translated set gets lines only when it exists; running it twice adds nothing new.
  assert.equal(addCaptionCuesToTrack(doc, 'en', incoming).added, 0);
  const withEn = addCaptionTrack(doc, { id: 'en', label: 'English', language: 'en', cues: [] });
  const once = addCaptionCuesToTrack(withEn, 'en', incoming);
  assert.equal(once.added, 3);
  assert.equal(addCaptionCuesToTrack(once.document, 'en', incoming).added, 0);
});

test('the subtitle file carries Hebrew text, times and the chosen style', () => {
  const ass = buildCaptionsAss(
    [{ id: 'a', startFrame: 30, endFrame: 90, text: 'שלום עולם' }, { id: 'b', startFrame: 90, endFrame: 120, text: ' ' }],
    { width: 1920, height: 1080, fps: 30, settings: { ...DEFAULT_CAPTION_SETTINGS, position: 'top', sizePct: 5 } },
  );
  assert.match(ass, /PlayResX: 1920/);
  assert.match(ass, /Dialogue: 0,0:00:01\.00,0:00:03\.00,Default,,0,0,0,,‫שלום עולם‬/);
  assert.equal(captionTextDirection('H3 Max הוא מודל'), 'rtl', 'a Hebrew line that opens with an English term is still right-to-left');
  assert.equal(captionTextDirection('Plain English'), 'ltr');
  assert.equal((ass.match(/Dialogue:/g) ?? []).length, 1);
  assert.match(ass, /Style: Default,Heebo,54,/);
  assert.match(ass, /,8,115,115,16,1/); // top alignment, margins (close to the edge, off the screen's buttons)
});
