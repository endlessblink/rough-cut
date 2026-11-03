import { describe, expect, it } from 'vitest';
import { createProject } from './factories.js';
import { migrate } from './migrations.js';
import { validateProject } from './schemas.js';
import { CURRENT_SCHEMA_VERSION } from './constants.js';
import { getVoiceCleanAmount, withVoiceCleanAmount } from './voice-clean.js';

describe('settings.voiceClean', () => {
  it('is absent on new projects and reads as 0 (original sound only)', () => {
    const project = createProject();
    expect(project.settings.voiceClean).toBeUndefined();
    expect(getVoiceCleanAmount(project.settings)).toBe(0);
  });

  it('loads a current-version document saved before the field existed, unchanged', () => {
    const project = JSON.parse(JSON.stringify(createProject()));
    expect(project.version).toBe(CURRENT_SCHEMA_VERSION);
    const loaded = migrate(project);
    expect(loaded.settings.voiceClean).toBeUndefined();
    expect(loaded.settings).toEqual(validateProject(project).settings);
  });

  it('round-trips through save/load JSON without a schema version bump', () => {
    const project = withVoiceCleanAmount(createProject(), 0.35);
    const loaded = migrate(JSON.parse(JSON.stringify(project)));
    expect(loaded.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(loaded.settings.voiceClean).toEqual({ amount: 0.35 });
    expect(getVoiceCleanAmount(loaded.settings)).toBe(0.35);
  });

  it('clamps out-of-range values and drops junk instead of failing the whole load', () => {
    const base = JSON.parse(JSON.stringify(createProject()));
    const high = validateProject({ ...base, settings: { ...base.settings, voiceClean: { amount: 4 } } });
    expect(high.settings.voiceClean).toEqual({ amount: 1 });
    const text = validateProject({ ...base, settings: { ...base.settings, voiceClean: { amount: 'loud' } } });
    expect(text.settings.voiceClean).toEqual({ amount: 0 });
    const junk = validateProject({ ...base, settings: { ...base.settings, voiceClean: 'yes' } });
    expect(junk.settings.voiceClean).toBeUndefined();
  });

  it('withVoiceCleanAmount clamps, rounds to 1% and keeps other settings', () => {
    const project = createProject();
    const next = withVoiceCleanAmount(project, 0.4567);
    expect(next.settings.voiceClean).toEqual({ amount: 0.46 });
    expect(next.settings.frameRate).toBe(project.settings.frameRate);
    expect(withVoiceCleanAmount(project, -2).settings.voiceClean).toEqual({ amount: 0 });
    expect(project.settings.voiceClean).toBeUndefined();
  });
});
