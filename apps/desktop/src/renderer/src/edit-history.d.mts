export type EditHistory<T> = { undo: T[]; redo: T[] };
export const EMPTY_EDIT_HISTORY: Readonly<EditHistory<never>>;
export function recordEdit<T>(history: EditHistory<T>, snapshot: T, limit?: number): EditHistory<T>;
export function undoEdit<T>(history: EditHistory<T>, current: T): { snapshot: T | null; history: EditHistory<T> };
export function redoEdit<T>(history: EditHistory<T>, current: T): { snapshot: T | null; history: EditHistory<T> };
