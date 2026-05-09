import { describe, expect, it } from 'vitest';
import {
  RECORDING_TEMPLATE_PRESETS,
  applyRecordingTemplatePreset,
  findRecordingTemplatePresetId,
  getRecordingTemplatePreset,
} from './recording-templates.js';
import { RECORDING_BACKGROUND_PRESETS } from './background-presets.js';

describe('recording template presets', () => {
  it('exposes the three first-slice templates', () => {
    expect(RECORDING_TEMPLATE_PRESETS.map((preset) => preset.id)).toEqual([
      'tutorial-16-9',
      'mobile-9-16',
      'square-1-1',
    ]);
  });

  it('every template references a real background preset', () => {
    const knownIds = new Set(RECORDING_BACKGROUND_PRESETS.map((preset) => preset.id));
    for (const template of RECORDING_TEMPLATE_PRESETS) {
      expect(knownIds.has(template.backgroundPresetId)).toBe(true);
    }
  });

  it('applies a template by setting aspect ratio and background, preserving frame controls', () => {
    const result = applyRecordingTemplatePreset(
      { bgPadding: 24, bgCornerRadius: 12, bgShadowBlur: 80, bgShadowOpacity: 0.5, bgShadowOffsetY: 40 },
      'tutorial-16-9',
    );

    expect(result).toBeDefined();
    expect(result?.aspectRatio).toBe('16:9');
    expect(result?.background.bgImage).toBe('backgrounds/dark-waves.png');
    expect(result?.background.bgPadding).toBe(24);
    expect(result?.background.bgCornerRadius).toBe(12);
    expect(result?.background.bgShadowBlur).toBe(80);
    expect(result?.background.bgShadowOpacity).toBe(0.5);
    expect(result?.background.bgShadowOffsetY).toBe(40);
  });

  it('applies the templated camera patch (position, shape, size, visibility)', () => {
    const tutorial = applyRecordingTemplatePreset(undefined, 'tutorial-16-9');
    expect(tutorial?.camera).toEqual({ position: 'corner-br', shape: 'circle', aspectRatio: '1:1', size: 110, roundness: 50, visible: true });

    const mobile = applyRecordingTemplatePreset(undefined, 'mobile-9-16');
    expect(mobile?.camera.position).toBe('corner-bl');
    expect(mobile?.camera.shape).toBe('rounded');
    expect(mobile?.camera.size).toBe(150);

    const square = applyRecordingTemplatePreset(undefined, 'square-1-1');
    expect(square?.camera.position).toBe('corner-tr');
    expect(square?.camera.shape).toBe('circle');
  });

  it('every template carries a complete camera patch', () => {
    for (const template of RECORDING_TEMPLATE_PRESETS) {
      expect(template.camera.size).toBeGreaterThan(0);
      expect(template.camera.visible).toBe(true);
      expect(['circle', 'rounded', 'square']).toContain(template.camera.shape);
      expect(['corner-br', 'corner-bl', 'corner-tr', 'corner-tl', 'center']).toContain(template.camera.position);
    }
  });

  it('returns undefined for an unknown template id', () => {
    expect(applyRecordingTemplatePreset(undefined, 'no-such-template')).toBeUndefined();
    expect(getRecordingTemplatePreset('no-such-template')).toBeUndefined();
  });

  it('detects an active template from current aspect ratio + background', () => {
    const applied = applyRecordingTemplatePreset(undefined, 'mobile-9-16');
    expect(applied).toBeDefined();
    expect(findRecordingTemplatePresetId(applied!.aspectRatio, applied!.background)).toBe('mobile-9-16');
  });

  it('returns undefined when aspect ratio matches but background does not', () => {
    expect(findRecordingTemplatePresetId('16:9', { bgColor: '#abcdef' })).toBeUndefined();
  });

  it('returns undefined when aspect ratio is missing', () => {
    expect(findRecordingTemplatePresetId(undefined, undefined)).toBeUndefined();
  });
});
