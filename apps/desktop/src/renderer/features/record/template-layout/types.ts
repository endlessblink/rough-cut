/**
 * Core types for the template layout system.
 *
 * All rects use pixel coordinates relative to the canvas container.
 * This file has zero React or DOM dependencies — pure data types only.
 */

/** Pixel-coordinate rect relative to the canvas container. x,y is the top-left corner. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What a layout function returns — subdivided frame rects for each media slot. */
export interface TemplateLayoutResult {
  screenFrame: Rect | null;
  cameraFrame: Rect | null;
}

/** How media content is fitted inside a frame rect. */
export type FitMode = 'contain' | 'cover' | 'fill';

/**
 * Describes one renderable media slot — frame position, fit mode, and content.
 * Used by the MediaFrame React component to render a single slot.
 * `content` is typed as `unknown` to keep this file React-free;
 * callers cast to React.ReactNode at the component boundary.
 */
export interface MediaSlot {
  frame: Rect;
  fitMode: FitMode;
  content: unknown; // React.ReactNode in practice
  borderRadius?: number;
  zIndex?: number;
  /** Optional label shown in debug overlay mode. */
  label?: string;
}
