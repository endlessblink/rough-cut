import { describe, expect, it } from 'vitest';
import { applyRecordingBackgroundPreset, getRecordingBackgroundColors } from './background-presets.js';

describe('recording background presets', () => {
  it('applies a named preset without changing frame controls', () => {
    const next = applyRecordingBackgroundPreset({ bgPadding: 12, bgCornerRadius: 8, bgShadowBlur: 99, bgShadowOpacity: 0.4 }, 'coral-folds');

    expect(next.bgColor).toBe('#c96517');
    expect(next.bgGradient).toContain('#d66bb1');
    expect(next.bgImage).toBe('backgrounds/pexels-steve-29139964.jpg');
    expect(next.bgPadding).toBe(12);
    expect(next.bgCornerRadius).toBe(8);
    expect(next.bgShadowBlur).toBe(99);
    expect(next.bgShadowOpacity).toBe(0.4);
    expect(typeof next.bgShadowEnabled).toBe('boolean');
  });

  it('extracts first and last gradient colors for preview/export', () => {
    expect(getRecordingBackgroundColors({ bgColor: '#000000', bgGradient: 'linear-gradient(135deg, #111111 0%, #222222 50%, #333333 100%)' })).toEqual(['#111111', '#333333']);
  });

  it('falls back to the solid color when no gradient is set', () => {
    expect(getRecordingBackgroundColors({ bgColor: '#123456' })).toEqual(['#123456', '#123456']);
  });
});
