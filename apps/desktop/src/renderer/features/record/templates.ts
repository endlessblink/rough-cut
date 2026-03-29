/**
 * Layout templates for the Record view.
 *
 * Each template defines normalized rects for screen and camera regions
 * within the preview frame. This matches the Focusee/Screen Studio pattern
 * where templates control spatial layout of two media sources.
 *
 * NormalizedRect uses 0–1 coordinates. toCssRect() converts to CSS percentages.
 */

import type { CSSProperties } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NormalizedRect = {
  x: number;  // 0–1: left edge
  y: number;  // 0–1: top edge
  w: number;  // 0–1: width
  h: number;  // 0–1: height
};

export type LayoutKind =
  | 'FULL_SCREEN'
  | 'PIP'
  | 'SPLIT_VERTICAL'
  | 'SPLIT_HORIZONTAL'
  | 'CAMERA_ONLY';

export interface LayoutTemplate {
  id: string;
  label: string;
  description: string;
  kind: LayoutKind;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3';
  screenRect: NormalizedRect | null;
  cameraRect: NormalizedRect | null;
  zOrder: 'screen-above' | 'camera-above';
}

export type InstanceLayout = {
  templateId: string;
  screenRect?: NormalizedRect;
  cameraRect?: NormalizedRect;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve a region rect: user override wins, then template base, then null */
export function resolveRect(
  base: NormalizedRect | null,
  override?: NormalizedRect,
): NormalizedRect | null {
  return override ?? base ?? null;
}

/** Convert a NormalizedRect to CSS absolute positioning with percentages */
export function toCssRect(r: NormalizedRect): CSSProperties {
  return {
    position: 'absolute',
    left: `${r.x * 100}%`,
    top: `${r.y * 100}%`,
    width: `${r.w * 100}%`,
    height: `${r.h * 100}%`,
  };
}

/** Map aspect ratio string to a canonical resolution */
export function resolutionForAspectRatio(
  ratio: LayoutTemplate['aspectRatio'],
): { width: number; height: number } {
  switch (ratio) {
    case '16:9': return { width: 1920, height: 1080 };
    case '9:16': return { width: 1080, height: 1920 };
    case '1:1':  return { width: 1080, height: 1080 };
    case '4:3':  return { width: 1440, height: 1080 };
    default:     return { width: 1920, height: 1080 };
  }
}

// ─── Presets ──────────────────────────────────────────────────────────────────

export const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  // ── Landscape (16:9) ──
  {
    id: 'screen-only-16x9',
    label: 'Screen Only',
    description: 'Full screen capture, no camera',
    kind: 'FULL_SCREEN',
    aspectRatio: '16:9',
    screenRect: { x: 0, y: 0, w: 1, h: 1 },
    cameraRect: null,
    zOrder: 'screen-above',
  },
  {
    id: 'screen-cam-br-16x9',
    label: 'Screen + Camera',
    description: 'Screen with camera in bottom-right',
    kind: 'PIP',
    aspectRatio: '16:9',
    screenRect: { x: 0, y: 0, w: 1, h: 1 },
    cameraRect: { x: 0.72, y: 0.70, w: 0.24, h: 0.26 },
    zOrder: 'camera-above',
  },
  {
    id: 'screen-cam-bl-16x9',
    label: 'Screen + Camera (Left)',
    description: 'Screen with camera in bottom-left',
    kind: 'PIP',
    aspectRatio: '16:9',
    screenRect: { x: 0, y: 0, w: 1, h: 1 },
    cameraRect: { x: 0.04, y: 0.70, w: 0.24, h: 0.26 },
    zOrder: 'camera-above',
  },
  {
    id: 'presentation-16x9',
    label: 'Presentation',
    description: 'Camera left, screen right (side-by-side)',
    kind: 'SPLIT_HORIZONTAL',
    aspectRatio: '16:9',
    screenRect: { x: 0.38, y: 0, w: 0.62, h: 1 },
    cameraRect: { x: 0.02, y: 0.1, w: 0.34, h: 0.8 },
    zOrder: 'camera-above',
  },
  {
    id: 'tutorial-16x9',
    label: 'Tutorial',
    description: 'Screen with camera in bottom-right',
    kind: 'PIP',
    aspectRatio: '16:9',
    screenRect: { x: 0, y: 0, w: 1, h: 1 },
    cameraRect: { x: 0.72, y: 0.70, w: 0.24, h: 0.26 },
    zOrder: 'camera-above',
  },
  {
    id: 'standard-4x3',
    label: 'Standard (4:3)',
    description: 'Standard 4:3 screen capture',
    kind: 'FULL_SCREEN',
    aspectRatio: '4:3',
    screenRect: { x: 0, y: 0, w: 1, h: 1 },
    cameraRect: null,
    zOrder: 'screen-above',
  },
  // ── Portrait (9:16) ──
  {
    id: 'social-vertical',
    label: 'Social Vertical',
    description: 'Screen top, camera bottom (vertical split)',
    kind: 'SPLIT_VERTICAL',
    aspectRatio: '9:16',
    screenRect: { x: 0, y: 0, w: 1, h: 0.5 },
    cameraRect: { x: 0, y: 0.52, w: 1, h: 0.48 },
    zOrder: 'camera-above',
  },
  // ── Square (1:1) ──
  {
    id: 'talking-head',
    label: 'Talking Head',
    description: 'Camera top, screen bottom (square)',
    kind: 'SPLIT_VERTICAL',
    aspectRatio: '1:1',
    screenRect: { x: 0, y: 0.52, w: 1, h: 0.48 },
    cameraRect: { x: 0, y: 0, w: 1, h: 0.50 },
    zOrder: 'camera-above',
  },
];
