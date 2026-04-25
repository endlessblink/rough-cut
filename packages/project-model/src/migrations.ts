import { CURRENT_SCHEMA_VERSION } from './constants.js';
import { validateProject } from './schemas.js';
import type { ProjectDocument } from './types.js';

/**
 * A migration is a pure function that transforms a document
 * from version N to version N+1.
 */
export interface Migration {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly migrate: (doc: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Registry of all migrations, ordered by fromVersion.
 */
const migrations: readonly Migration[] = [
  {
    fromVersion: 1,
    toVersion: 2,
    migrate: (doc) => {
      const assets = (doc['assets'] as Array<Record<string, unknown>>) ?? [];
      const migratedAssets = assets.map((asset) => {
        const pres = asset['presentation'] as Record<string, unknown> | undefined;
        if (!pres) return asset;
        const zoom = pres['zoom'] as Record<string, unknown> | undefined;
        if (!zoom) return asset;
        const markers = (zoom['markers'] as Array<Record<string, unknown>>) ?? [];
        const migratedMarkers = markers.map((m) => ({
          ...m,
          focalPoint: m['focalPoint'] ?? { x: 0.5, y: 0.5 },
          zoomInDuration: m['zoomInDuration'] ?? 9,
          zoomOutDuration: m['zoomOutDuration'] ?? 9,
        }));
        return {
          ...asset,
          presentation: {
            ...pres,
            zoom: { ...zoom, markers: migratedMarkers },
          },
        };
      });
      return { ...doc, version: 2, assets: migratedAssets };
    },
  },
  {
    fromVersion: 2,
    toVersion: 3,
    migrate: (doc) => {
      return {
        ...doc,
        version: 3,
        aiAnnotations: doc['aiAnnotations'] ?? {
          captionSegments: [],
          captionStyle: { fontSize: 28, position: 'bottom', backgroundOpacity: 0.55 },
        },
      };
    },
  },
  {
    fromVersion: 3,
    toVersion: 4,
    migrate: (doc) => ({
      ...doc,
      version: 4,
      motionCompositions: doc['motionCompositions'] ?? [],
    }),
  },
  {
    fromVersion: 4,
    toVersion: 5,
    migrate: (doc) => ({
      ...doc,
      version: 5,
      libraryReferences: doc['libraryReferences'] ?? [],
    }),
  },
  {
    fromVersion: 5,
    toVersion: 6,
    migrate: (doc) => {
      const assets = (doc['assets'] as Array<Record<string, unknown>>) ?? [];
      return {
        ...doc,
        version: 6,
        assets: assets.map((asset) => {
          const presentation = asset['presentation'] as Record<string, unknown> | undefined;
          if (!presentation) return asset;
          return {
            ...asset,
            presentation: {
              templateId:
                typeof presentation['templateId'] === 'string'
                  ? presentation['templateId']
                  : 'screen-cam-br-16x9',
              ...presentation,
            },
          };
        }),
      };
    },
  },
  {
    fromVersion: 6,
    toVersion: 7,
    migrate: (doc) => ({
      ...doc,
      version: 7,
      settings: {
        ...((doc['settings'] as Record<string, unknown> | undefined) ?? {}),
        destinationPresetId:
          ((doc['settings'] as Record<string, unknown> | undefined)?.['destinationPresetId'] as
            | string
            | null
            | undefined) ?? null,
      },
    }),
  },
  {
    fromVersion: 7,
    toVersion: 8,
    migrate: (doc) => {
      const existing = (doc['aiAnnotations'] as Record<string, unknown> | undefined) ?? {};
      const existingStyle = existing['captionStyle'] as Record<string, unknown> | undefined;
      return {
        ...doc,
        version: 8,
        aiAnnotations: {
          captionSegments: Array.isArray(existing['captionSegments'])
            ? (existing['captionSegments'] as unknown[])
            : [],
          captionStyle: {
            fontSize: 28,
            position: 'bottom',
            backgroundOpacity: 0.55,
            ...(existingStyle ?? {}),
          },
        },
      };
    },
  },
  {
    // v8 → v9: backfill required Clip fields that legacy saves dropped
    // (trackId, enabled, effects, keyframes). Validation requires them, so
    // older docs that pre-date these defaults fail to load without this.
    fromVersion: 8,
    toVersion: 9,
    migrate: (doc) => {
      const composition = doc['composition'] as Record<string, unknown> | undefined;
      if (!composition) return { ...doc, version: 9 };
      const tracks = (composition['tracks'] as Array<Record<string, unknown>>) ?? [];
      const migratedTracks = tracks.map((track) => {
        const trackId = typeof track['id'] === 'string' ? track['id'] : '';
        const clips = (track['clips'] as Array<Record<string, unknown>>) ?? [];
        const migratedClips = clips.map((clip) => {
          const transform = clip['transform'] as Record<string, unknown> | undefined;
          return {
            ...clip,
            trackId: typeof clip['trackId'] === 'string' ? clip['trackId'] : trackId,
            enabled: typeof clip['enabled'] === 'boolean' ? clip['enabled'] : true,
            effects: Array.isArray(clip['effects']) ? clip['effects'] : [],
            keyframes: Array.isArray(clip['keyframes']) ? clip['keyframes'] : [],
            transform: transform ?? {
              x: 0,
              y: 0,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
              anchorX: 0.5,
              anchorY: 0.5,
              opacity: 1,
            },
          };
        });
        return { ...track, clips: migratedClips };
      });
      return {
        ...doc,
        version: 9,
        composition: { ...composition, tracks: migratedTracks },
      };
    },
  },
  {
    // v9 → v10: add ExportSettings.keepClickSounds (default true).
    fromVersion: 9,
    toVersion: 10,
    migrate: (doc) => {
      const exportSettings = (doc['exportSettings'] as Record<string, unknown> | undefined) ?? {};
      return {
        ...doc,
        version: 10,
        exportSettings: {
          ...exportSettings,
          keepClickSounds:
            typeof exportSettings['keepClickSounds'] === 'boolean'
              ? exportSettings['keepClickSounds']
              : true,
        },
      };
    },
  },
];

/**
 * Returns the ordered chain of migrations needed to go
 * from `fromVersion` to CURRENT_SCHEMA_VERSION.
 */
export function getMigrationChain(fromVersion: number): Migration[] {
  return migrations.filter(
    (m) => m.fromVersion >= fromVersion && m.toVersion <= CURRENT_SCHEMA_VERSION,
  );
}

/**
 * Migrate an unknown document to the current schema version.
 *
 * - If the document is already at the current version, validates and returns it.
 * - If the document is at a future version, throws.
 * - Otherwise applies migrations in order, then validates.
 */
export function migrate(doc: unknown): ProjectDocument {
  if (typeof doc !== 'object' || doc === null) {
    throw new Error('migrate() expects a non-null object');
  }

  const record = doc as Record<string, unknown>;
  const version = record['version'];

  if (typeof version !== 'number' || !Number.isInteger(version)) {
    throw new Error('Document is missing a valid integer "version" field');
  }

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Document version ${version} is newer than supported version ${CURRENT_SCHEMA_VERSION}`,
    );
  }

  if (version === CURRENT_SCHEMA_VERSION) {
    return validateProject(doc);
  }

  const chain = getMigrationChain(version);
  let current = { ...record };

  for (const migration of chain) {
    current = migration.migrate(current);
  }

  return validateProject(current);
}
