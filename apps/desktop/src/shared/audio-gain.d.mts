export const BOOST_LIMIT: number;
export const MAX_COMBINED_GAIN: number;
export const EXPORT_BOOST_LIMITER: string;

export function clampGain(value: unknown): number;
export function combineGains(...gains: readonly unknown[]): number;
export function gainToDb(gain: number): number;
export function dbToGain(db: number): number;
export function formatVolume(level?: { readonly volume?: number; readonly muted?: boolean }): string;
export function exportGainFilter(gain: number): string;
export function needsBoostLimiter(gains: number | readonly number[]): boolean;
export function boostLimiterCurve(length?: number): Float32Array<ArrayBuffer>;
