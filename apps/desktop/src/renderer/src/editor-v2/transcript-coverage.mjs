function boundedFrame(value, durationFrames) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(durationFrames, Math.max(0, Math.trunc(value)));
}

function normalizedRange(value, durationFrames) {
  const startFrame = boundedFrame(value?.startFrame, durationFrames);
  const endFrame = boundedFrame(value?.endFrame, durationFrames);
  return endFrame > startFrame ? { startFrame, endFrame } : null;
}

function appendCoverageBlock(blocks, block) {
  const previous = blocks.at(-1);
  const sameNonWordKind =
    previous?.kind !== 'word' &&
    block.kind !== 'word' &&
    previous?.kind === block.kind;
  const sameWord =
    previous?.kind === 'word' &&
    block.kind === 'word' &&
    previous.wordIndex === block.wordIndex;
  if (
    previous &&
    previous.endFrame === block.startFrame &&
    (sameNonWordKind || sameWord)
  ) {
    blocks[blocks.length - 1] = { ...previous, endFrame: block.endFrame };
    return;
  }
  blocks.push(block);
}

export function transcriptCoverageBlockIndexAtFrame(blocks, frame) {
  if (!Number.isFinite(frame) || frame < 0 || blocks.length === 0) return -1;
  const normalizedFrame = Math.trunc(frame);
  return blocks.findIndex(
    (block, index) =>
      normalizedFrame >= block.startFrame
      && (
        normalizedFrame < block.endFrame
        || (index === blocks.length - 1 && normalizedFrame === block.endFrame)
      ),
  );
}

export function buildTranscriptCoverage(
  document,
  durationFrames,
  { minimumReviewFrames = 1 } = {},
) {
  const duration = Number.isFinite(durationFrames)
    ? Math.max(0, Math.trunc(durationFrames))
    : 0;
  if (duration === 0) return [];

  const words = (document.transcript?.words ?? [])
    .map((value, wordIndex) => {
      const range = normalizedRange(value, duration);
      return range ? { value, wordIndex, ...range } : null;
    })
    .filter(Boolean)
    .sort(
      (left, right) =>
        left.startFrame - right.startFrame ||
        left.endFrame - right.endFrame ||
        left.wordIndex - right.wordIndex,
    );
  const nonSpeech = (document.transcript?.nonSpeech ?? [])
    .map((value, sourceIndex) => {
      const range = normalizedRange(value, duration);
      return range ? { value, sourceIndex, ...range } : null;
    })
    .filter(Boolean)
    .sort(
      (left, right) =>
        left.startFrame - right.startFrame ||
        left.endFrame - right.endFrame ||
        left.sourceIndex - right.sourceIndex,
    );
  const boundaries = [
    0,
    duration,
    ...words.flatMap(({ startFrame, endFrame }) => [startFrame, endFrame]),
    ...nonSpeech.flatMap(({ startFrame, endFrame }) => [
      startFrame,
      endFrame,
    ]),
  ]
    .sort((left, right) => left - right)
    .filter((frame, index, values) => index === 0 || frame !== values[index - 1]);

  const blocks = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const startFrame = boundaries[index];
    const endFrame = boundaries[index + 1];
    if (endFrame <= startFrame) continue;

    const activeWord = words.find(
      (word) => word.startFrame < endFrame && word.endFrame > startFrame,
    );
    if (activeWord) {
      appendCoverageBlock(blocks, {
        kind: 'word',
        startFrame,
        endFrame,
        wordIndex: activeWord.wordIndex,
        text: activeWord.value.word,
        confidence: activeWord.value.confidence,
      });
      continue;
    }

    const activeNonSpeech = nonSpeech.find(
      (segment) =>
        segment.startFrame < endFrame && segment.endFrame > startFrame,
    );
    appendCoverageBlock(blocks, {
      kind:
        activeNonSpeech?.value.kind === 'silence'
          ? 'pause'
          : activeNonSpeech?.value.kind ?? 'unrecognized',
      startFrame,
      endFrame,
    });
  }
  if (minimumReviewFrames <= 1) return blocks;
  const compacted = blocks.map((block) => ({ ...block }));
  for (let index = compacted.length - 1; index >= 0; index -= 1) {
    const block = compacted[index];
    if (
      block.kind !== 'unrecognized' ||
      block.endFrame - block.startFrame >= minimumReviewFrames
    ) {
      continue;
    }
    const previous = compacted[index - 1];
    const next = compacted[index + 1];
    if (previous) {
      previous.endFrame = block.endFrame;
      compacted.splice(index, 1);
    } else if (next) {
      next.startFrame = block.startFrame;
      compacted.splice(index, 1);
    }
  }
  return compacted;
}

function coalescedRemovals(ranges) {
  const normalized = ranges
    .map((range) => {
      const startFrame = Math.max(0, Math.trunc(range?.startFrame) || 0);
      const endFrame = Math.max(0, Math.trunc(range?.endFrame) || 0);
      return endFrame > startFrame ? { startFrame, endFrame } : null;
    })
    .filter(Boolean)
    .sort(
      (left, right) =>
        left.startFrame - right.startFrame || left.endFrame - right.endFrame,
    );
  const coalesced = [];
  for (const range of normalized) {
    const previous = coalesced.at(-1);
    if (previous && range.startFrame <= previous.endFrame) {
      previous.endFrame = Math.max(previous.endFrame, range.endFrame);
    } else {
      coalesced.push({ ...range });
    }
  }
  return coalesced.map((range, index) => ({
    suggestionId: `transcript-block:${range.startFrame}:${range.endFrame}:${index}`,
    ...range,
  }));
}

function shiftedFrame(frame, removals) {
  let removedBefore = 0;
  for (const range of removals) {
    if (frame >= range.endFrame) {
      removedBefore += range.endFrame - range.startFrame;
    } else if (frame > range.startFrame) {
      removedBefore += frame - range.startFrame;
      break;
    } else {
      break;
    }
  }
  return Math.max(0, frame - removedBefore);
}

function overlapsRemoval(value, removals) {
  return removals.some(
    (range) =>
      value.startFrame < range.endFrame && value.endFrame > range.startFrame,
  );
}

function shiftTimedValues(values, removals, removeOverlaps) {
  return values.flatMap((value) => {
    if (removeOverlaps && overlapsRemoval(value, removals)) return [];
    const startFrame = shiftedFrame(value.startFrame, removals);
    const endFrame = shiftedFrame(value.endFrame, removals);
    return endFrame > startFrame ? [{ ...value, startFrame, endFrame }] : [];
  });
}

export function removeTranscriptBlockRanges(document, selectedBlocks) {
  const removals = coalescedRemovals(selectedBlocks);
  if (removals.length === 0 || !document.transcript) {
    return { document, removals };
  }
  return {
    document: {
      ...document,
      transcript: {
        words: shiftTimedValues(document.transcript.words ?? [], removals, true),
        paragraphs: shiftTimedValues(
          document.transcript.paragraphs ?? [],
          removals,
          false,
        ),
        nonSpeech: shiftTimedValues(
          document.transcript.nonSpeech ?? [],
          removals,
          false,
        ),
      },
    },
    removals,
  };
}
