# Rough Cut Editing Context

This context defines the shared language for Rough Cut's recording, FreeCut, media, and AI editing surfaces. It exists to keep every surface aligned on one project model and one editing vocabulary.

## Shared editing language

**Shared timeline**:
The single canonical `ProjectDocument.timeline` containing sources, tracks, clips, markers, effects, captions, overlays, and export settings. Recording edit, FreeCut, and AI actions read and write this timeline.

**Recording edit**:
Rough Cut's focused screen-recording toolset and canonical compositor. It remains available as a full editing surface and must reflect all shared timeline changes.

**FreeCut editor**:
The full advanced timeline editor embedded in Rough Cut. It is a second synchronized toolset over the shared timeline, not a separate project system or replacement for Recording edit.

**Program feed**:
The composed visual output resolved from the shared timeline, including screen, camera, background, aspect ratio, zoom, censoring, cursor, captions, overlays, and other effects. FreeCut receives this as its primary project video view.

**Asset**:
A media or generated-content item registered in Rough Cut's shared project asset graph. Imported assets are copied into managed project storage so every surface resolves the same durable item.

**AI edit**:
A model-generated or automated change represented as standard shared timeline mutations such as clips, captions, markers, overlays, or effects. AI edits remain inspectable, undoable, and manually editable in FreeCut and Recording edit.

**Generated asset**:
Reusable content produced by an AI model, Remotion, Hyperframes, or another generation system and registered in the shared asset graph before timeline placement.

**Generation job**:
An explicit, user-approved request to create an asset or automatic edit. Provider-backed jobs show estimated cost before execution and never start silently.

## Flagged ambiguities

- “Editor” can refer to Recording edit or FreeCut. Use the surface name when precision matters; use “video editor” for the combined capability.
- “Preview” can mean a source-media viewer or the composed Program feed. Use “source viewer” and “Program feed” explicitly.
- “AI result” is not a separate opaque recipe. It means a generated asset or standard shared timeline mutation.

## Example dialogue

**Developer**: Where should the generated subtitle edit go?

**Domain expert**: Into the shared timeline as caption data, so FreeCut can edit it and Recording edit can reflect it.

**Developer**: What about a Hyperframes animation?

**Domain expert**: Register it as a generated asset, then place it on the shared timeline as an overlay or clip.

**Developer**: Which video should FreeCut show for the recording?

**Domain expert**: The Program feed resolved from the same timeline as Recording edit, not a separate raw or baked-only interpretation.
