---
name: video-edit-quality
description: Use before and after any AI edit of a talking recording in Rough Cut (cutting repeats, silences, retakes, private screens). Forces the checks Noam asked for - one best take per sentence, no repeats left, cuts only in pauses, review as a viewer. Never say an edit is done without the final-cut check.
---

# Editing a spoken recording (Rough Cut)

Noam's complaints on the first AI cuts (2026-10-31): "really bad", "interrupting, jarring", "I still say the same thing over several takes", "kept silent sections I'm not sure why". Follow this every time.

## 1. Before cutting: understand the takes
- Read the whole transcript (get_transcript) in order. Mark every idea said more than once. A retake can be a full paragraph, a single sentence, or a half sentence that restarts.
- For each repeated idea list all takes with time and pick ONE best take: complete sentence, no stumble/filler, clean ending, usually the last. Write the choice down ("keep 55.3-83.3, drop 0-55").
- The transcript can invent words over silence and is Hebrew: compare with the sound (silence map) before trusting a short line. Match repeats by character trigrams, not exact words.

## 2. Cutting rules
- Cut edges only inside real pauses measured from the sound; keep about 0.2 s of room tone each side. Never cut inside a word.
- Never leave a kept fragment under ~8 s between two cuts (it sounds like stuttering); merge it away.
- Remove silent stretches over ~2 s unless something worth watching happens (an animation or result playing); even then shorten to a few seconds.
- Remove private screens (account lists, inbox, email addresses, password fields).
- Work in source time; apply all cuts in one batch (apply_edits). Do not rebuild a cut from scratch without re-applying earlier hand-picked cuts.

## 3. After cutting: check the FINAL cut as a viewer (mandatory)
1. Rebuild the transcript of the final timeline (map the words through the clips). Run the repeat finder on it: zero repeated sentences, or each remaining one is intentional (a recap).
2. List pauses over 2 s in the rendered draft; each one must be justified.
3. Render a draft, look at frames around every join, read the transcript around each join: no sentence starts or ends mid-word.
4. Save the previous cut as a version before replacing it. Never overwrite Noam's own edit; keep a backup.
5. Report what was checked and what was not. Only Noam saying it is good counts as done.
