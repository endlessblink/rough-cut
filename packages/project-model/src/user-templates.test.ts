import { describe, expect, it } from 'vitest';
import { createDefaultCameraPresentation, createDefaultRecordingBackgroundStyle } from './factories.js';
import {
  UserRecordingTemplateSchema,
  UserRecordingTemplatesFileSchema,
  applyUserTemplate,
  captureUserTemplate,
  findUserTemplateById,
  renameUserTemplate,
} from './user-templates.js';

const NOW = 1_700_000_000_000;

function makeInput(overrides: Partial<Parameters<typeof captureUserTemplate>[0]> = {}) {
  return {
    id: 'tpl_abc123',
    label: '  My Template  ',
    aspectRatio: '9:16' as const,
    background: createDefaultRecordingBackgroundStyle(),
    camera: createDefaultCameraPresentation(),
    now: NOW,
    ...overrides,
  };
}

describe('captureUserTemplate', () => {
  it('captures aspect, background, camera patch, and trims the label', () => {
    const t = captureUserTemplate(makeInput());
    expect(t.id).toBe('tpl_abc123');
    expect(t.label).toBe('My Template');
    expect(t.aspectRatio).toBe('9:16');
    expect(t.background.bgPadding).toBe(96);
    expect(t.camera).toMatchObject({
      position: 'corner-br',
      shape: 'rounded',
      aspectRatio: '1:1',
      size: 100,
      roundness: 50,
      visible: true,
    });
    // Extended fields (padding/inset/shadow*) now captured too so apply
    // can fully round-trip the user's layout.
    expect(t.camera.padding).toBe(0);
    expect(t.camera.shadowEnabled).toBe(true);
    expect(t.camera.shadowBlur).toBe(24);
    expect(t.camera.shadowOpacity).toBe(0.45);
    expect(t.createdAt).toBe(NOW);
    expect(t.updatedAt).toBe(NOW);
  });

  it('captures screenFrame and cameraFrame when present, null otherwise', () => {
    const a = captureUserTemplate(makeInput());
    expect(a.screenFrame).toBeNull();
    expect(a.cameraFrame).toBeNull();

    const b = captureUserTemplate(
      makeInput({
        presentation: {
          screenFrame: { x: 0.1, y: 0.2, w: 0.5, h: 0.4 },
          cameraFrame: { x: 0.7, y: 0.7, w: 0.2, h: 0.2 },
        },
      }),
    );
    expect(b.screenFrame).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.4 });
    expect(b.cameraFrame).toEqual({ x: 0.7, y: 0.7, w: 0.2, h: 0.2 });
  });
});

describe('applyUserTemplate', () => {
  it('returns the captured aspect/background/camera/frames verbatim', () => {
    const t = captureUserTemplate(
      makeInput({
        presentation: { screenFrame: { x: 0, y: 0, w: 1, h: 1 }, cameraFrame: null },
      }),
    );
    const applied = applyUserTemplate(t);
    expect(applied.aspectRatio).toBe('9:16');
    expect(applied.background).toBe(t.background);
    expect(applied.camera).toBe(t.camera);
    expect(applied.screenFrame).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(applied.cameraFrame).toBeNull();
  });
});

describe('findUserTemplateById', () => {
  it('finds by id or returns undefined', () => {
    const t = captureUserTemplate(makeInput());
    expect(findUserTemplateById([t], 'tpl_abc123')).toBe(t);
    expect(findUserTemplateById([t], 'missing')).toBeUndefined();
  });
});

describe('renameUserTemplate', () => {
  it('updates label (trimmed) and updatedAt; preserves createdAt', () => {
    const t = captureUserTemplate(makeInput());
    const r = renameUserTemplate(t, '  New Name  ', NOW + 1000);
    expect(r.label).toBe('New Name');
    expect(r.createdAt).toBe(NOW);
    expect(r.updatedAt).toBe(NOW + 1000);
  });
});

describe('schemas', () => {
  it('round-trips a captured template through the schema', () => {
    const t = captureUserTemplate(makeInput());
    expect(() => UserRecordingTemplateSchema.parse(t)).not.toThrow();
  });

  it('validates a file shape with empty list', () => {
    expect(() => UserRecordingTemplatesFileSchema.parse({ version: 1, templates: [] })).not.toThrow();
  });

  it('rejects an empty label', () => {
    const t = captureUserTemplate(makeInput({ label: '' }));
    expect(() => UserRecordingTemplateSchema.parse(t)).toThrow();
  });
});
