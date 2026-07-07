import { describe, expect, it } from 'vitest';
import { createDefaultCameraPresentation } from '@rough-cut/project-model';
import {
  normalizeCompositionPresentationStyle,
  resolveHeadlessCameraLayout,
  resolveHeadlessScreenLayout,
} from './composition-layout.js';

describe('composition layout helpers', () => {
  it('normalizes presentation style defaults and explicit background values', () => {
    expect(normalizeCompositionPresentationStyle(null)).toEqual({
      screenPadding: 96,
      screenCornerRadius: 32,
      screenShadowEnabled: true,
      screenShadowBlur: 58,
      screenShadowOpacity: 0.2,
      screenShadowOffsetY: 34,
      screenShadowOffsetX: 0,
    });

    expect(normalizeCompositionPresentationStyle({
      bgPadding: 48,
      bgCornerRadius: 18,
      bgShadowEnabled: false,
      bgShadowBlur: 22,
      bgShadowOpacity: 0.4,
      bgShadowOffsetY: 12,
      bgShadowOffsetX: -3,
    })).toEqual({
      screenPadding: 48,
      screenCornerRadius: 18,
      screenShadowEnabled: false,
      screenShadowBlur: 22,
      screenShadowOpacity: 0.4,
      screenShadowOffsetY: 12,
      screenShadowOffsetX: -3,
    });
  });

  it('resolves default headless screen layout from background padding and source aspect', () => {
    const layout = resolveHeadlessScreenLayout({
      output: { width: 1920, height: 1080 },
      backgroundLayer: { style: { bgPadding: 96 } },
      screenLayer: {
        sourceSize: { width: 1280, height: 720 },
      },
    });

    expect(layout).toEqual({
      source: 'background-padding',
      frame: {
        x: 0.088802,
        y: 0.088889,
        w: 0.822396,
        h: 0.822222,
      },
    });
  });

  it('resolves manual headless screen layout with crop viewport aspect', () => {
    const layout = resolveHeadlessScreenLayout({
      output: { width: 1920, height: 1080 },
      backgroundLayer: { style: { bgPadding: 96 } },
      screenLayer: {
        frame: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 },
        sourceSize: { width: 1280, height: 720 },
        sourceViewport: { enabled: true, x: 100, y: 50, width: 900, height: 900, aspectRatio: 'free' },
      },
    });

    expect(layout).toEqual({
      source: 'manual',
      frame: {
        x: 0.18125,
        y: 0.2,
        w: 0.3375,
        h: 0.6,
      },
    });
  });

  it('resolves presentation camera layout and style metadata', () => {
    const presentation = {
      ...createDefaultCameraPresentation(),
      position: 'corner-tl' as const,
      size: 50,
      shape: 'rounded' as const,
      roundness: 80,
      shadowEnabled: false,
      shadowBlur: 12,
      shadowOpacity: 0.33,
    };

    const layout = resolveHeadlessCameraLayout({
      output: { width: 1920, height: 1080 },
      cameraLayer: { presentation },
    });

    expect(layout).toEqual({
      source: 'presentation',
      frame: {
        x: 0.040104,
        y: 0.039815,
        w: 0.119792,
        h: 0.212963,
      },
      radius: 92,
      presentation,
      style: {
        shape: 'rounded',
        roundness: 80,
        shadowEnabled: false,
        shadowBlur: 12,
        shadowOpacity: 0.33,
      },
    });
  });

  it('resolves manual circular camera frames through square constrained bounds', () => {
    const presentation = {
      ...createDefaultCameraPresentation(),
      shape: 'circle' as const,
    };

    const layout = resolveHeadlessCameraLayout({
      output: { width: 1920, height: 1080 },
      cameraLayer: {
        presentation,
        frame: { x: 0.75, y: 0.2, w: 0.2, h: 0.4 },
      },
    });

    expect(layout?.source).toBe('manual');
    expect(layout?.frame).toEqual({
      x: 0.75,
      y: 0.222222,
      w: 0.2,
      h: 0.355556,
    });
    expect(layout?.radius).toBe(192);
    expect(layout?.style.shape).toBe('circle');
  });
});
