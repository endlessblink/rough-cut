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
  | 'SOCIAL_VERTICAL'
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
  /** Camera shape for this template: circle for PIP, rectangle for splits */
  cameraShape: 'circle' | 'rectangle';
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

// ─── Dynamic rect computation ─────────────────────────────────────────────────

const REGION_GAP = 0.02; // 2% gap between regions

/**
 * Compute region rects dynamically from layout pattern + recording aspect ratio.
 * Templates define the KIND (stacked, side-by-side, PIP, etc.).
 * Actual rects are computed so the recording fills width and height follows
 * from its native aspect ratio — no cropping, no stretching, no gaps.
 */
export function computeLayoutRects(
  kind: LayoutKind,
  cardAspect: number,
  screenAspect: number,
  template: LayoutTemplate,
): { screenRect: NormalizedRect | null; cameraRect: NormalizedRect | null } {
  switch (kind) {
    case 'FULL_SCREEN': {
      return { screenRect: { x: 0, y: 0, w: 1, h: 1 }, cameraRect: null };
    }

    case 'SPLIT_VERTICAL': {
      // Screen on top fills width, height from aspect ratio
      const screenH = Math.min(1, cardAspect / screenAspect);
      const cameraY = screenH + REGION_GAP;
      const cameraH = Math.max(0.1, 1 - cameraY);
      return {
        screenRect: { x: 0, y: 0, w: 1, h: screenH },
        cameraRect: { x: 0, y: cameraY, w: 1, h: cameraH },
      };
    }

    case 'SPLIT_HORIZONTAL': {
      // Screen on right, camera on left
      const screenW = 0.62;
      const cameraW = 1 - screenW - REGION_GAP;
      return {
        screenRect: { x: 1 - screenW, y: 0, w: screenW, h: 1 },
        cameraRect: { x: 0, y: 0, w: cameraW, h: 1 },
      };
    }

    case 'PIP': {
      // Screen fills, camera is small overlay from template
      return {
        screenRect: { x: 0, y: 0, w: 1, h: 1 },
        cameraRect: template.cameraRect,
      };
    }

    case 'SOCIAL_VERTICAL': {
      return layoutSocialVertical(cardAspect, screenAspect);
    }

    case 'CAMERA_ONLY': {
      return { screenRect: null, cameraRect: { x: 0, y: 0, w: 1, h: 1 } };
    }
  }
}

// ─── Social Vertical layout ─────────────────────────────────────────────────

const SOCIAL_VERT_PADDING = 0.06;        // 6% inset on all sides
const SOCIAL_VERT_GAP_FRAC = 0.02;       // 2% of inner height
const SOCIAL_VERT_CAMERA_FRAC = 0.11;    // 11% of inner height for camera
const SOCIAL_VERT_FRAME_W_FRAC = 0.24;   // 24% of inner width — narrow portrait column

/**
 * Dedicated column layout for Social Vertical (9:16 portrait).
 *
 * The screen FRAME rect is template-driven — it does NOT derive from the
 * source recording's aspect ratio. The recorded media is later fit inside
 * this frame using object-fit contain (handled by PreviewCard).
 *
 * Layout (top to bottom inside padded inner area):
 *   1. Screen frame — narrow centered column, full remaining height
 *   2. Gap
 *   3. Camera band — full inner width, fixed fraction of inner height
 *
 * All values in 0–1 normalized space relative to the content frame.
 */
export function layoutSocialVertical(
  _cardAspect: number,
  _screenAspect: number,
): { screenRect: NormalizedRect; cameraRect: NormalizedRect } {
  const pad = SOCIAL_VERT_PADDING;

  // Inner rect after padding
  const innerX = pad;
  const innerY = pad;
  const innerW = 1 - pad * 2;
  const innerH = 1 - pad * 2;

  // Reserve camera + gap at the bottom of inner rect
  const camH = innerH * SOCIAL_VERT_CAMERA_FRAC;
  const gapH = innerH * SOCIAL_VERT_GAP_FRAC;
  const topH = innerH - camH - gapH;

  // Screen frame: narrow portrait column centered in top region
  const frameW = innerW * SOCIAL_VERT_FRAME_W_FRAC;
  const frameH = Math.max(0, topH);
  const frameX = innerX + (innerW - frameW) / 2;
  const frameY = innerY;

  return {
    screenRect: { x: frameX, y: frameY, w: frameW, h: frameH },
    cameraRect: { x: innerX, y: innerY + topH + gapH, w: innerW, h: camH },
  };
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
    cameraShape: 'rectangle',
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
    cameraShape: 'circle',
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
    cameraShape: 'circle',
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
    cameraShape: 'rectangle',
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
    cameraShape: 'circle',
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
    cameraShape: 'rectangle',
  },
  // ── Portrait (9:16) ──
  {
    id: 'social-vertical',
    label: 'Social Vertical',
    description: 'Screen top, camera bottom (vertical split)',
    kind: 'SOCIAL_VERTICAL',
    aspectRatio: '9:16',
    screenRect: { x: 0, y: 0, w: 1, h: 0.5 },
    cameraRect: { x: 0, y: 0.52, w: 1, h: 0.48 },
    zOrder: 'camera-above',
    cameraShape: 'rectangle',
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
    cameraShape: 'rectangle',
  },
];
