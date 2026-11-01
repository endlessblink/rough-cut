export function installPlayTracker(proto?: unknown): boolean;
export function trackPlayedMedia(element: HTMLMediaElement): void;
export function pauseAllPlayedMedia(): number;
export function silenceAfterStop(schedule?: (fn: () => void, ms: number) => unknown): number;
