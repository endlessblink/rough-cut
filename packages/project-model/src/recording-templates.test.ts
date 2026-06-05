import { describe, expect, it } from 'vitest';
import {
  RECORDING_TEMPLATE_PRESETS,
  applyRecordingTemplatePreset,
  findRecordingTemplatePresetId,
  getRecordingTemplatePreset,
} from './recording-templates.js';
import { RECORDING_BACKGROUND_PRESETS } from './background-presets.js';

describe('recording template presets', () => {
  it('exposes the built-in templates in display order', () => {
    expect(RECORDING_TEMPLATE_PRESETS.map((preset) => preset.id)).toEqual([
      'tutorial-16-9',
      'youtube-16-9',
      'mobile-9-16',
      'square-1-1',
      'reel-4-5',
      'portrait-3-4',
      'classic-4-3',
      'native-auto',
    ]);
  });

  it('built-in templates cover every supported aspect ratio', () => {
    const coveredRatios = new Set(RECORDING_TEMPLATE_PRESETS.map((preset) => preset.aspectRatio));
    expect(coveredRatios.has('16:9')).toBe(true);
    expect(coveredRatios.has('9:16')).toBe(true);
    expect(coveredRatios.has('1:1')).toBe(true);
    expect(coveredRatios.has('4:5')).toBe(true);
    expect(coveredRatios.has('3:4')).toBe(true);
    expect(coveredRatios.has('4:3')).toBe(true);
    expect(coveredRatios.has('auto')).toBe(true);
  });

  it('every template references a real background preset', () => {
    const knownIds = new Set(RECORDING_BACKGROUND_PRESETS.map((preset) => preset.id));
    for (const template of RECORDING_TEMPLATE_PRESETS) {
      expect(knownIds.has(template.backgroundPresetId)).toBe(true);
    }
  });

  it('applies the FocuSee split 16:9 template as a vertical camera panel beside a wider screen', () => {
    const result = applyRecordingTemplatePreset(
      { bgPadding: 24, bgCornerRadius: 12, bgShadowBlur: 80, bgShadowOpacity: 0.5, bgShadowOffsetY: 40 },
      'tutorial-16-9',
    );

    expect(result).toBeDefined();
    expect(result?.aspectRatio).toBe('16:9');
    expect(result?.camera).toEqual({ position: 'center', shape: 'rounded', aspectRatio: '9:16', size: 100, roundness: 32, visible: true });
    expect(result?.cameraFrame).toEqual({ x: 0.105, y: 0.17, w: 0.245, h: 0.66 });
    expect(result?.screenFrame).toEqual({ x: 0.385, y: 0.17, w: 0.53, h: 0.66 });
    expect(result?.background.bgColor).toBeDefined();
  });

  it('applies the FocuSee YouTube 16:9 template as a wide screen with lower-left circular camera', () => {
    const result = applyRecordingTemplatePreset(undefined, 'youtube-16-9');

    expect(result).toBeDefined();
    expect(result?.aspectRatio).toBe('16:9');
    expect(result?.camera).toEqual({ position: 'corner-bl', shape: 'circle', aspectRatio: '1:1', size: 112, roundness: 100, visible: true });
    expect(result?.screenFrame).toEqual({ x: 0.09, y: 0.09, w: 0.82, h: 0.82 });
    expect(result?.cameraFrame).toEqual({ x: 0.105, y: 0.53, w: 0.205, h: 0.365 });
  });

  it('applies the templated camera patch (position, shape, size, visibility)', () => {
    const tutorial = applyRecordingTemplatePreset(undefined, 'tutorial-16-9');
    expect(tutorial?.camera).toEqual({ position: 'center', shape: 'rounded', aspectRatio: '9:16', size: 100, roundness: 32, visible: true });

    const mobile = applyRecordingTemplatePreset(undefined, 'mobile-9-16');
    expect(mobile?.camera.position).toBe('center');
    expect(mobile?.camera.shape).toBe('rounded');
    expect(mobile?.camera.aspectRatio).toBe('16:9');

    const square = applyRecordingTemplatePreset(undefined, 'square-1-1');
    expect(square?.camera.position).toBe('corner-br');
    expect(square?.camera.shape).toBe('rounded');
  });

  it('every template carries a complete bounded presentation layout', () => {
    for (const template of RECORDING_TEMPLATE_PRESETS) {
      expect(template.camera.size).toBeGreaterThan(0);
      expect(template.camera.visible).toBe(true);
      expect(['rounded', 'circle']).toContain(template.camera.shape);
      expect(['16:9', '9:16', '1:1']).toContain(template.camera.aspectRatio);
      expect(['corner-br', 'corner-bl', 'corner-tr', 'corner-tl', 'center']).toContain(template.camera.position);
      expect(template.layoutLabel.length).toBeGreaterThan(0);
      for (const rect of [template.screenFrame, template.cameraFrame]) {
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.w).toBeGreaterThan(0);
        expect(rect.h).toBeGreaterThan(0);
        expect(rect.x + rect.w).toBeLessThanOrEqual(1.02);
        expect(rect.y + rect.h).toBeLessThanOrEqual(1.02);
      }
      expect(template.cameraFrame.w).toBeLessThanOrEqual(0.84);
      expect(template.cameraFrame.h).toBeLessThanOrEqual(0.68);
    }
  });

  it('returns undefined for an unknown template id', () => {
    expect(applyRecordingTemplatePreset(undefined, 'no-such-template')).toBeUndefined();
    expect(getRecordingTemplatePreset('no-such-template')).toBeUndefined();
  });

  it('detects an active template from aspect ratio alone (background is ignored)', () => {
    const applied = applyRecordingTemplatePreset(undefined, 'mobile-9-16');
    expect(applied).toBeDefined();
    expect(findRecordingTemplatePresetId(applied!.aspectRatio)).toBe('mobile-9-16');
  });

  it('still matches the template when the user has overridden the background', () => {
    // Custom background that does not correspond to any template's preset.
    // Per the new model, the template stays "active" because aspect matches.
    expect(findRecordingTemplatePresetId('16:9', { bgColor: '#abcdef' })).toBe('tutorial-16-9');
    expect(findRecordingTemplatePresetId('9:16', { bgColor: '#abcdef' })).toBe('mobile-9-16');
    expect(findRecordingTemplatePresetId('4:5', { bgColor: '#abcdef' })).toBe('reel-4-5');
  });

  it('returns undefined when aspect ratio is missing', () => {
    expect(findRecordingTemplatePresetId(undefined, undefined)).toBeUndefined();
  });
});
