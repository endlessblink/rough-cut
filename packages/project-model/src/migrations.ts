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
        aiAnnotations: doc['aiAnnotations'] ?? { captionSegments: [] },
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
