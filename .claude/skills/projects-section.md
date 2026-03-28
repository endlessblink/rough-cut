---
name: projects-section
description: Architectural context for the Projects tab and project management features in Rough Cut. Auto-activates when working on project browsing, recent projects, project persistence, or the Projects tab UI.
triggers:
  - ProjectsTab
  - RecentProject
  - recent-projects
  - projectFilePath
  - projectOpenPath
  - electron-store
  - app-settings
---

# Projects Section — Architectural Context

## Canonical Constraints

These rules come from the project constitution (docs/ARCHITECTURE.md, docs/MVP_SPEC.md) and MUST be followed:

1. **Main process owns all I/O** (§8) — File operations, project save/load, recent projects persistence all run in the main Electron process. The renderer never touches the filesystem directly.

2. **The project document is inert data** (§5) — No methods, no classes, no circular refs. Must serialize to JSON. This means RecentProjectEntry metadata is extracted AT SAVE TIME, not lazily.

3. **Recording produces assets + metadata, not clips** (§6) — Recordings create Asset entries. The UI separately creates Clips that reference assets. The Projects tab shows per-project assets (from `ProjectDocument.assets[]`), NOT a global media library.

4. **Asset paths should be relative to project root** for portability (MVP_SPEC). Currently absolute — a future task.

5. **Frame-based, not time-based** (§4) — All temporal values are frame numbers. Asset durations are in frames.

## Recording-Asset-Project Relationship

```
Recording (webm file on disk)
  ↓ saveRecording() in main process
Asset entry (in ProjectDocument.assets[])
  ↓ user places on timeline
Clip (on a Track, references Asset by ID)
```

- Recordings for saved projects go to `{projectDir}/recordings/`
- Recordings for unsaved projects go to `/tmp/rough-cut/recordings/` (orphan risk)
- `Asset.filePath` currently stores absolute paths
- No "consolidate media" or "relink" feature exists yet

## Store Structure

`packages/store/src/project-store.ts`:
- `project: ProjectDocument` — the full document (single source of truth)
- `projectFilePath: string | null` — absolute path to `.roughcut` file, null if unsaved
- `isDirty: boolean` — unsaved changes flag
- `setProjectFilePath(path)` — does NOT create undo entries (excluded from zundo temporal check)

## IPC Channel Map

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `project:open` | renderer→main | Open via native dialog, returns `{ project, filePath }` |
| `project:save` | renderer→main | Save to known path |
| `project:save-as` | renderer→main | Save via native dialog |
| `project:new` | renderer→main | Signal new project |
| `project:open-path` | renderer→main | Open by known file path (no dialog) |
| `recent-projects:get` | renderer→main | Get recent list (validates file existence) |
| `recent-projects:remove` | renderer→main | Remove single entry |
| `recent-projects:clear` | renderer→main | Clear all recents |

All channels registered in `apps/desktop/src/shared/ipc-channels.mjs`.
Handlers in `apps/desktop/src/main/index.mjs`.
Preload API in `apps/desktop/src/preload/index.mjs`.
TypeScript types in `apps/desktop/src/renderer/env.d.ts`.

## Persistence Layer

- **electron-store** (`app-settings.json` in Electron userData dir)
- Atomic writes via write-file-atomic (crash-safe)
- JSON schema validation on the store
- Service module: `apps/desktop/src/main/recent-projects-service.mjs`
- Max 20 recent entries, auto-pruned for stale file paths

## File Map

```
apps/desktop/src/renderer/features/projects/
  ProjectsTab.tsx              — Top-level tab, loads recent projects on mount
  ProjectsScreenLayout.tsx     — Full-viewport flex column wrapper
  ProjectsContent.tsx          — Scrollable content: hero + recent section
  ProjectsHero.tsx             — Welcome message + New/Open buttons
  RecentProjectsSection.tsx    — Section header + card grid or empty state
  ProjectCard.tsx              — Individual project card with hover/remove
  EmptyRecentState.tsx         — "No recent projects" placeholder
  types.ts                     — RecentProjectEntry interface

apps/desktop/src/main/
  recent-projects-service.mjs  — CRUD for recent projects (electron-store)
  index.mjs                    — IPC handlers (4 new + 3 modified)
```

## Safety Rules

- **Always use atomic writes** for app settings (electron-store handles this)
- **Validate file existence** before returning recent projects to renderer
- **Never scan /tmp globally** — only track paths explicitly saved via IPC
- **Don't mix capture with timeline logic** — recordings → assets only
- **projectFilePath changes must NOT create undo entries** — it's app state, not document state
- **All IPC handlers that read files must handle ENOENT gracefully** — return null or empty

## What NOT to Do

- Don't build a global media library scanner (per-project assets only)
- Don't import PixiJS in the Projects tab (no preview rendering needed)
- Don't store recent projects in the ProjectDocument (it's app-level data, not project data)
- Don't use raw `fs.writeFile` for app settings (use electron-store for atomic writes)
- Don't add Node.js imports in renderer code (contextIsolation is on)
- Don't make `projectFilePath` part of undo/redo history

## Future Work (not yet built)

- Consolidate media: move /tmp recordings to project dir on save
- Relative asset paths for project portability
- Project thumbnails (render first frame as PNG on save)
- Search/filter in recent projects
- Right-click context menu on cards
- Auto-save with timer
- "Relink media" workflow for moved/deleted source files
