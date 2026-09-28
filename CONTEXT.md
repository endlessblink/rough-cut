# Rough Cut Editing Context

This context defines the shared language for Rough Cut's recording, media, and AI editing surfaces. It exists to keep every surface aligned on one project model and one editing vocabulary.

## Shared editing language

**Shared timeline**:
The single canonical `ProjectDocument.timeline` containing sources, tracks, clips, markers, effects, captions, overlays, and export settings. Recording edit and AI actions read and write this timeline.

**Recording edit**:
Rough Cut's editor and canonical compositor. Every edit happens here or lands here; any view added later is another window onto the same timeline.

**Program feed**:
The composed visual output resolved from the shared timeline, including screen, camera, background, aspect ratio, zoom, censoring, cursor, captions, overlays, and other effects.

**Asset**:
A media or generated-content item registered in Rough Cut's shared project asset graph. Imported assets are copied into managed project storage so every surface resolves the same durable item.

**AI edit**:
A model-generated or automated change represented as standard shared timeline mutations such as clips, captions, markers, overlays, or effects. AI edits remain inspectable, undoable, and manually editable in Recording edit.

**Generated asset**:
Reusable content produced by an AI model, Remotion, Hyperframes, or another generation system and registered in the shared asset graph before timeline placement.

**Generation job**:
An explicit, user-approved request to create an asset or automatic edit. Provider-backed jobs show estimated cost before execution and never start silently.

## Flagged ambiguities

- "Preview" can mean a source-media viewer or the composed Program feed. Use "source viewer" and "Program feed" explicitly.
- "AI result" is not a separate opaque recipe. It means a generated asset or standard shared timeline mutation.

## Example dialogue

**Developer**: Where should the generated subtitle edit go?

**Domain expert**: Into the shared timeline as caption data, so Recording edit can show and edit it.

**Developer**: What about a Hyperframes animation?

**Domain expert**: Register it as a generated asset, then place it on the shared timeline as an overlay or clip.
