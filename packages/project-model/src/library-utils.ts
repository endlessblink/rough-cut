import type { LibraryDocument, LibrarySourceId, LibraryTranscriptSegment } from './types.js';

export interface LibraryTranscriptionInfo {
  readonly provider: string;
  readonly model: string;
  readonly fps: number;
  readonly transcribedAt: string;
  readonly language?: string;
}

export function updateLibrarySourceTranscript(
  library: LibraryDocument,
  sourceId: LibrarySourceId,
  transcriptSegments: readonly LibraryTranscriptSegment[],
  info: LibraryTranscriptionInfo,
): LibraryDocument {
  let found = false;

  const sources = library.sources.map((source) => {
    if (source.id !== sourceId) {
      return source;
    }

    found = true;
    const existingMetadata =
      source.metadata && typeof source.metadata === 'object' ? source.metadata : {};

    return {
      ...source,
      transcriptSegments: [...transcriptSegments],
      metadata: {
        ...existingMetadata,
        transcription: {
          provider: info.provider,
          model: info.model,
          fps: info.fps,
          transcribedAt: info.transcribedAt,
          segmentCount: transcriptSegments.length,
          wordCount: transcriptSegments.reduce((sum, segment) => sum + segment.words.length, 0),
          ...(info.language ? { language: info.language } : {}),
        },
      },
    };
  });

  if (!found) {
    throw new Error(`Library source not found: ${sourceId}`);
  }

  return {
    ...library,
    modifiedAt: info.transcribedAt,
    sources,
  };
}
