import type { Resolution } from './types.js';

export const CURRENT_SCHEMA_VERSION = 6;
export const DEFAULT_FRAME_RATE = 30 as const;
export const DEFAULT_SAMPLE_RATE = 48000 as const;
export const DEFAULT_RESOLUTION: Readonly<Resolution> = { width: 1920, height: 1080 } as const;
export const DEFAULT_BACKGROUND_COLOR = '#000000';
