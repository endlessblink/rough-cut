export interface GraphicStyle {
  readonly id: string;
  readonly label: string;
  readonly mood: string;
  readonly brief: string;
  readonly fonts: string;
  readonly motion: string;
  /** Ground, text and accent colours, for the style picker. */
  readonly swatch: readonly [string, string, string];
}

export interface CreativityLevel {
  readonly level: number;
  readonly label: string;
  readonly brief: string;
}

export const DEFAULT_GRAPHICS_STYLE_ID: string;
export const DEFAULT_CREATIVITY: number;
export const GRAPHIC_STYLES: readonly GraphicStyle[];
export const CREATIVITY_LEVELS: readonly CreativityLevel[];
export const DESIGN_BANS: readonly string[];
export function resolveGraphicStyle(id: unknown): GraphicStyle;
export function normalizeCreativity(value: unknown): number;
export function resolveCreativity(value: unknown): CreativityLevel;
