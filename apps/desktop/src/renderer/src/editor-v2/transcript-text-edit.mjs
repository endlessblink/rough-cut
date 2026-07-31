function tokenize(value) {
  return String(value).trim().split(/\s+/).filter(Boolean);
}

function alignedOriginalIndices(originalTokens, nextTokens) {
  if (originalTokens.length === nextTokens.length) {
    return nextTokens.map((_, index) => index);
  }
  const Cell = Math.max(originalTokens.length, nextTokens.length) < 65_535
    ? Uint16Array
    : Uint32Array;
  const rows = [new Cell(nextTokens.length + 1)];
  for (let originalIndex = 1; originalIndex <= originalTokens.length; originalIndex += 1) {
    const row = new Cell(nextTokens.length + 1);
    const previous = rows[originalIndex - 1];
    for (let nextIndex = 1; nextIndex <= nextTokens.length; nextIndex += 1) {
      row[nextIndex] = originalTokens[originalIndex - 1] === nextTokens[nextIndex - 1]
        ? previous[nextIndex - 1] + 1
        : Math.max(previous[nextIndex], row[nextIndex - 1]);
    }
    rows.push(row);
  }

  const aligned = Array(nextTokens.length).fill(null);
  let originalIndex = originalTokens.length;
  let nextIndex = nextTokens.length;
  while (originalIndex > 0 && nextIndex > 0) {
    if (originalTokens[originalIndex - 1] === nextTokens[nextIndex - 1]) {
      aligned[nextIndex - 1] = originalIndex - 1;
      originalIndex -= 1;
      nextIndex -= 1;
    } else if (rows[originalIndex - 1][nextIndex] >= rows[originalIndex][nextIndex - 1]) {
      originalIndex -= 1;
    } else {
      nextIndex -= 1;
    }
  }
  return aligned;
}

function removedGroups(originalLength, aligned) {
  const kept = new Set(aligned.filter((index) => index !== null));
  const groups = [];
  for (let index = 0; index < originalLength; index += 1) {
    if (kept.has(index)) continue;
    const previous = groups.at(-1);
    if (previous && previous.endIndex === index - 1) previous.endIndex = index;
    else groups.push({ startIndex: index, endIndex: index });
  }
  return groups;
}

function shiftFrame(frame, removals) {
  let shift = 0;
  for (const range of removals) {
    if (frame >= range.endFrame) shift += range.endFrame - range.startFrame;
    else if (frame > range.startFrame) shift += frame - range.startFrame;
  }
  return Math.max(0, frame - shift);
}

function timingForAddedWord(index, aligned, previousWords, removals, durationFrames) {
  let previous = index - 1;
  while (previous >= 0 && aligned[previous] === null) previous -= 1;
  let next = index + 1;
  while (next < aligned.length && aligned[next] === null) next += 1;
  const lower = previous >= 0
    ? shiftFrame(previousWords[aligned[previous]].endFrame, removals)
    : 0;
  const upper = next < aligned.length
    ? shiftFrame(previousWords[aligned[next]].startFrame, removals)
    : durationFrames;
  const runStart = previous + 1;
  const runLength = next - runStart;
  const position = index - runStart;
  const startFrame = Math.round(lower + ((upper - lower) * position) / Math.max(1, runLength));
  const endFrame = Math.max(
    startFrame + 1,
    Math.round(lower + ((upper - lower) * (position + 1)) / Math.max(1, runLength)),
  );
  return { startFrame, endFrame };
}

export function applyTranscriptTextEdit(document, value, durationFrames) {
  const previousWords = document.transcript?.words ?? [];
  const nextTokens = tokenize(value);
  const originalTokens = previousWords.map((word) => word.word);
  const aligned = alignedOriginalIndices(originalTokens, nextTokens);
  const removals = removedGroups(previousWords.length, aligned).map((group, index) => ({
    suggestionId: `transcript-text:${group.startIndex}:${group.endIndex}:${index}`,
    startFrame: previousWords[group.startIndex].startFrame,
    endFrame: previousWords[group.endIndex].endFrame,
  }));
  const removedDuration = removals.reduce(
    (total, range) => total + range.endFrame - range.startFrame,
    0,
  );
  const nextDurationFrames = Math.max(1, durationFrames - removedDuration);
  const words = nextTokens.map((word, index) => {
    const originalIndex = aligned[index];
    if (originalIndex !== null) {
      const previous = previousWords[originalIndex];
      return {
        ...previous,
        word,
        startFrame: shiftFrame(previous.startFrame, removals),
        endFrame: Math.max(
          shiftFrame(previous.startFrame, removals) + 1,
          shiftFrame(previous.endFrame, removals),
        ),
      };
    }
    return {
      word,
      ...timingForAddedWord(
        index,
        aligned,
        previousWords,
        removals,
        nextDurationFrames,
      ),
      confidence: 0.5,
    };
  });
  const lines = String(value).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  let wordOffset = 0;
  const paragraphs = lines.map((line) => {
    const lineWordCount = tokenize(line).length;
    const lineWords = words.slice(wordOffset, wordOffset + lineWordCount);
    wordOffset += lineWordCount;
    return {
      text: line,
      startFrame: lineWords[0]?.startFrame ?? 0,
      endFrame: lineWords.at(-1)?.endFrame ?? 1,
    };
  });
  const nonSpeech = (document.transcript?.nonSpeech ?? []).flatMap((range) => {
    const startFrame = shiftFrame(range.startFrame, removals);
    const endFrame = shiftFrame(range.endFrame, removals);
    return endFrame > startFrame ? [{ ...range, startFrame, endFrame }] : [];
  });

  return {
    document: {
      ...document,
      transcript: { words, paragraphs, nonSpeech },
    },
    removals,
  };
}
