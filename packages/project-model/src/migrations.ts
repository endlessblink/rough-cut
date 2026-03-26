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
 * v1 is the current (and first) version, so the registry starts empty.
 * When v2 is added, a migration from 1 -> 2 will be registered here.
 */
const migrations: readonly Migration[] = [
  // Example for future:
  // { fromVersion: 1, toVersion: 2, migrate: (doc) => ({ ...doc, version: 2, newField: 'default' }) },
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
