---
name: project-model
description: Project model — ProjectDocument schema, Zod validation, schema versioning and migrations, asset registry, types, factories. Auto-activates when working on the project model, schema, types, or migrations.
triggers:
  - ProjectDocument
  - project-model
  - Asset
  - Composition
  - schema
  - migration
  - CURRENT_SCHEMA_VERSION
  - Zod
  - factories
  - ClipId
  - TrackId
  - AssetId
---

# Project Model — Architectural Context

## Overview

`@rough-cut/project-model` is the foundation package. It defines the ProjectDocument schema, all types (Asset, Clip, Track, Composition, etc.), Zod validation schemas, factory functions, branded ID types, and the schema versioning/migration system. It has ZERO runtime dependencies.

## Industry Patterns (Research-Based)

### Project File Format Patterns

| App | Format | Media Refs | Version Field |
|-----|--------|-----------|---------------|
| Camtasia | JSON `.tscproj` | Relative paths, integer IDs in `sourceBin` | `"version": "0.5"` at root |
| ScreenFlow | macOS bundle (directory) | Internal to bundle + security-scoped bookmarks | Bundle metadata |
| Cap | Directory with `recording-meta.json` | Relative paths from project dir | Implicit (serde aliases) |
| DaVinci Resolve | SQLite/PostgreSQL database | Absolute paths, relink on move | Internal DB version |
| Remotion | TypeScript source code | Code imports | Git versioning |

**Rough Cut approach**: Project directory (folder bundle) with `project.json` at root. Media in `recordings/` and `assets/` subdirs. Relative paths for portability.

### Camtasia `.tscproj` Schema (closest reference)

```json
{
  "version": "0.5",
  "editRate": 30,
  "width": 1920,
  "height": 1080,
  "sourceBin": [
    { "id": 1, "src": "relative/path.trec", "rect": [0,0,1920,1080] }
  ],
  "timeline": {
    "sceneTrack": {
      "scenes": [{
        "tracks": [{
          "medias": [{
            "src": 1,
            "start": 0, "duration": 300,
            "mediaStart": 0, "mediaDuration": 300,
            "parameters": {},
            "effects": []
          }]
        }]
      }]
    }
  }
}
```

Key patterns adopted by Rough Cut:
- `editRate` as project-level constant → Rough Cut's `settings.frameRate`
- `sourceBin` as media registry → Rough Cut's `assets[]`
- Integer/UUID IDs as foreign keys between assets and clips
- Separate `start/duration` (timeline) vs `mediaStart/mediaDuration` (source trim)
- `version` at root for schema versioning

## Canonical Constraints

From the project constitution:

1. **ZERO dependencies** — `@rough-cut/project-model` depends on NOTHING (except Zod for validation).

2. **The project document is inert data** (§5) — No methods, no classes, no circular references. Must serialize to/from JSON. Enables trivial undo/redo, save/load, IPC transport, testing.

3. **Frame-based, not time-based** (§4) — All temporal positions are integer frame numbers. Frame rate is a project-level constant.

4. **Recording produces assets, not clips** (§6) — Asset entries have probed metadata (duration, resolution, codec, frame count). Clips reference assets by ID.

5. **Effects are data, not code** (§7) — EffectInstance is a bag of params. No rendering logic in the model.

6. **Branded types for IDs** — `type ClipId = string & { readonly __brand: 'ClipId' }` prevents accidental ID mixing.

## Schema

```typescript
interface ProjectDocument {
  version: number;                      // Schema version for migrations
  settings: ProjectSettings;
  assets: Asset[];                      // Media registry
  composition: Composition;
  motionPresets: MotionPreset[];
  exportSettings: ExportSettings;
  aiAnnotations?: AIAnnotations;        // AI suggestions (pending acceptance)
}

interface ProjectSettings {
  resolution: { width: number; height: number };
  frameRate: number;                    // Frames per second (project constant)
  backgroundColor: string;             // Hex color
  sampleRate: number;                  // Audio sample rate
}

interface Asset {
  id: AssetId;
  type: 'recording' | 'video' | 'audio' | 'image';
  absolutePath: string;                // Stored at import time
  relativePath: string;                // Relative to project dir, computed at save
  status: 'online' | 'offline' | 'relinking';
  name: string;
  durationFrames: number;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  fileSize?: number;
}

interface Composition {
  tracks: Track[];
  transitions: Transition[];
}

interface Track {
  id: TrackId;
  type: 'video' | 'audio';
  name: string;
  clips: Clip[];
  muted: boolean;
  locked: boolean;
}

interface Clip {
  id: ClipId;
  assetId: AssetId;                    // Foreign key into assets[]
  trackId: TrackId;
  startFrame: number;                  // Timeline position (in)
  endFrame: number;                    // Timeline position (out)
  sourceStartFrame: number;            // Source trim in
  sourceEndFrame: number;              // Source trim out
  transform: ClipTransform;
  effects: EffectInstance[];
  keyframes: KeyframeTrack[];
}

interface Transition {
  id: TransitionId;
  type: string;
  clipAId: ClipId;
  clipBId: ClipId;
  durationFrames: number;
  params: Record<string, unknown>;
  easing: EasingType;
}
```

## Asset Path Resolution

At project load, resolve asset paths in priority order:
1. **Relative path** from project file location (most portable — survives moving the project folder)
2. **Absolute path** (survives moving just the project file)
3. **Filename-only search** in project dir and one level of subdirs (fallback)
4. If all fail: mark `status: 'offline'`, show "Relink Media" UI

The "relink" store action takes `assetId` + new path, updates both paths, re-runs ffprobe. This runs in main process only.

Do NOT resolve symlinks at import time — store the symlink path. Resolving breaks the relink model.

## Schema Versioning

```typescript
export const CURRENT_SCHEMA_VERSION = 1;

// Chain of pure migration functions: vN → v(N+1)
const migrations: Record<number, (old: unknown) => unknown> = {
  // 1: (v1) => ({ ...v1, version: 2, newField: defaultValue }),
};

export function migrate(raw: unknown): ProjectDocument {
  let doc = raw as { version: number };
  while (doc.version < CURRENT_SCHEMA_VERSION) {
    const migration = migrations[doc.version];
    if (!migration) throw new Error(`No migration for version ${doc.version}`);
    doc = migration(doc) as { version: number };
  }
  return ProjectDocumentSchema.parse(doc); // Zod validation
}
```

Principles:
- **Version field from day one** — always present, always checked
- **Forward-only migrations** — each `vN → v(N+1)`, never backward
- **Always run through pipeline** — even current-version files pass through validation
- **Each migration is a pure function** — independently testable
- **Never load without migration** — `loadProject()` always calls `migrate()` first

## Factory Functions

```typescript
// Create with sensible defaults + branded IDs
export function createAsset(type: Asset['type'], overrides?: Partial<Asset>): Asset;
export function createTrack(type: Track['type'], overrides?: Partial<Track>): Track;
export function createClip(assetId: AssetId, trackId: TrackId, overrides?: Partial<Clip>): Clip;
export function createProjectDocument(overrides?: Partial<ProjectDocument>): ProjectDocument;
```

Factories generate UUIDs, apply defaults, and return valid typed objects. They are the ONLY way to create model objects (never construct them manually).

## File Map

```
packages/project-model/src/
  index.ts                     — Public API exports
  types.ts                     — All interfaces + branded ID types
  schemas.ts                   — Zod validation schemas
  factories.ts                 — Factory functions for all types
  factories.test.ts            — Factory + validation tests
  migrations.ts                — Version migration chain
  migrations.test.ts           — Per-migration unit tests
  constants.ts                 — CURRENT_SCHEMA_VERSION, defaults
```

## Safety Rules

- **ZERO runtime dependencies** — Only Zod. No lodash, no immer, no anything else.
- **All types are interfaces, not classes** — No methods, no prototypes
- **Branded types for ALL IDs** — Prevents `clipId` being passed where `trackId` is expected
- **All temporal values in frames** — Never milliseconds in the model
- **Factory functions for all creation** — Never `{ id: 'foo', ... }` manually
- **Zod schema must match TypeScript types** — Schema is the runtime enforcement of compile-time types
- **Migration tests are mandatory** — Every migration function gets its own test with before/after snapshots
- **Validate AFTER migration, not before** — the migration pipeline transforms `unknown` to current schema. Zod validation runs only on the final result.
- **Don't run Zod on hot mutation paths** — validate only on load, import, and before save. Zod v3 is acceptable for infrequent validation.

## What NOT to Do

- Don't add runtime dependencies to project-model
- Don't add methods to model types (keep them plain objects)
- Don't use milliseconds or seconds (frames only)
- Don't use class inheritance
- Don't create model objects without factories
- Don't skip Zod validation on load
- Don't store rendering artifacts in the model (PixiJS objects, DOM refs)
- Don't add circular references (must JSON.stringify cleanly)
- Don't put store logic in project-model (store is a separate package)

## References

- Camtasia `.tscproj`: JSON with `editRate`, `sourceBin`, `version` — closest schema reference
- Cap `recording-meta.json`: Relative paths, directory-based project
- ScreenFlow: Bundle format with internal media
- Kdenlive: XML with explicit version field + migration chain
