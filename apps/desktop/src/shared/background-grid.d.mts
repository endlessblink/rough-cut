export const BACKGROUND_GRID_COLUMNS: number;
export const BACKGROUND_GRID_ROWS: number;
export const BACKGROUND_GRID_RGB: readonly number[];
export const BACKGROUND_GRID_ALPHA: number;
export function isBackgroundGridOn(background: { bgGrid?: boolean; bgImage?: string | null; bgGradient?: string | null } | null | undefined): boolean;
export function drawBackgroundGrid(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void;
export function buildBackgroundGridFilter(): string;
