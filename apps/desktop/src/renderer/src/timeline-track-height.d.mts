export const TRACK_HEIGHT_MIN: number;
export const TRACK_HEIGHT_MAX: number;
export const TRACK_HEIGHT_STORAGE_KEY: string;
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
export function defaultTrackHeight(label: string, minimum?: number): number;
export function clampTrackHeight(value: unknown, minimum?: number): number;
export function readTrackHeight(label: string, storage: PreferenceStorage | null, minimum?: number): number;
export function persistTrackHeight(label: string, value: number, storage: PreferenceStorage | null): void;
export function keyboardTrackHeight(key: string, current: number, minimum: number, defaultValue: number, shift?: boolean): number | null;
