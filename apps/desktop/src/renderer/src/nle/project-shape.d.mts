export function resolveProjectFps(project: unknown): number;
export function resolveCompositionDurationFrames(project: unknown): number;
export function frameToSeconds(frame: number, fps: number): number;
export function secondsToFrame(seconds: number, fps: number): number;
export function formatTimecode(frame: number, fps: number): string;
