import { GRID_VIEW } from './grid-view';
import { LIST_VIEW } from './list-view';
import type { LibraryView, LibraryViewId } from './types';

// The view registry. Adding a future view = appending one entry here.
// The shell does not branch on view id — it consults capability flags
// (supportsSizeSlider, supportsDateGrouping) to decide which toolbar
// affordances to render.
export const LIBRARY_VIEWS: ReadonlyArray<LibraryView> = [GRID_VIEW, LIST_VIEW];

export const DEFAULT_VIEW_ID: LibraryViewId = 'grid';

export function findView(id: LibraryViewId): LibraryView {
  const match = LIBRARY_VIEWS.find((view) => view.id === id);
  // LIBRARY_VIEWS is a non-empty constant array, so [0] is always defined.
  return match ?? (LIBRARY_VIEWS[0] as LibraryView);
}
