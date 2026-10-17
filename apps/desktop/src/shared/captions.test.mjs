import assert from 'node:assert/strict';
import test from 'node:test';
import {
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

test('the subtitle file carries Hebrew text, times and the chosen style', () => {
  const ass = buildCaptionsAss(
    [{ id: 'a', startFrame: 30, endFrame: 90, text: 'שלום עולם' }, { id: 'b', startFrame: 90, endFrame: 120, text: ' ' }],
    { width: 1920, height: 1080, fps: 30, settings: { ...DEFAULT_CAPTION_SETTINGS, position: 'top', sizePct: 5 } },
  );
  assert.match(ass, /PlayResX: 1920/);
  assert.match(ass, /Dialogue: 0,0:00:01\.00,0:00:03\.00,Default,,0,0,0,,שלום עולם/);
  assert.equal((ass.match(/Dialogue:/g) ?? []).length, 1);
  assert.match(ass, /Style: Default,Heebo,54,/);
  assert.match(ass, /,8,115,115,65,1/); // top alignment, margins
});
