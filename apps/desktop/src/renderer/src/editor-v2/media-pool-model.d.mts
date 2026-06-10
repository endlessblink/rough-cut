export type MediaBinId = 'all' | 'video' | 'audio' | 'stills' | 'generated';
export function assetBin(asset: Record<string, unknown>): 'video' | 'audio' | 'stills';
export function binsForAssets(assets: ReadonlyArray<Record<string, unknown>>): Array<{ id: MediaBinId; label: string }>;
export function filterAssets<T extends Record<string, unknown>>(assets: ReadonlyArray<T>, bin: MediaBinId, query: string): Array<{ asset: T; index: number }>;
export function shortProjectName(name: string | null | undefined): string;
