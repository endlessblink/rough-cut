export function toggleSelection(selection: ReadonlySet<string>, path: string): Set<string>;

export function selectRange(
  selection: ReadonlySet<string>,
  orderedPaths: ReadonlyArray<string>,
  anchor: string | null,
  target: string,
): Set<string>;

export function selectAll(orderedPaths: ReadonlyArray<string>): Set<string>;

export function clearSelection(): Set<string>;

export type ClickIntent =
  | { kind: 'toggle' }
  | { kind: 'range' }
  | { kind: 'open' }
  | { kind: 'clear-and-open' };

export function resolveClickIntent(options: {
  selection: ReadonlySet<string>;
  summaryPath: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  selectMode?: boolean;
}): ClickIntent;
