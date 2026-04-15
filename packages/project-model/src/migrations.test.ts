import { describe, it, expect } from 'vitest';
import { migrate, getMigrationChain } from './migrations.js';
import { createProject } from './factories.js';
import { CURRENT_SCHEMA_VERSION } from './constants.js';

describe('migrations', () => {
  it('passes through a document at current version unchanged', () => {
    const project = createProject();
    const result = migrate(project);
    expect(result).toEqual(project);
  });

  it('rejects documents with version > CURRENT_SCHEMA_VERSION', () => {
    const project = createProject();
    const future = { ...project, version: CURRENT_SCHEMA_VERSION + 1 };
    expect(() => migrate(future)).toThrow(/newer than supported/);
  });

  it('rejects non-object input', () => {
    expect(() => migrate(null)).toThrow();
    expect(() => migrate('string')).toThrow();
    expect(() => migrate(42)).toThrow();
  });

  it('rejects documents without a version field', () => {
    expect(() => migrate({})).toThrow(/version/);
  });

  it('getMigrationChain returns empty array for current version', () => {
    const chain = getMigrationChain(CURRENT_SCHEMA_VERSION);
    expect(chain).toEqual([]);
  });

  it('result validates against current schema', () => {
    const project = createProject();
    const result = migrate(project);
    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.id).toBe(project.id);
  });

  it('migrates version 4 documents by adding empty library references', () => {
    const project = createProject();
    const legacy = { ...project, version: 4, libraryReferences: undefined };
    const result = migrate(legacy);
    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.libraryReferences).toEqual([]);
  });
});
