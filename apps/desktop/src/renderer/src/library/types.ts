export type ProjectSummary = {
  path: string;
  name: string;
  createdAt: string | null;
  modifiedAt: string | null;
  durationFrames: number;
  durationMs: number;
  frameRate: number;
  width: number | null;
  height: number | null;
  resolutionLabel: string | null;
  hasCamera: boolean;
  thumbnailUrl: string | null;
  recordingUrl: string | null;
};

export type CardClickEvent = {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
};

export type LibraryViewProps = {
  summaries: ReadonlyArray<ProjectSummary>;
  sizeStep: SizeStep;
  onOpen: (path: string) => void;
  // Multi-select state owned by LibraryShell; views render but never mutate it.
  selection: ReadonlySet<string>;
  // Suppress hover-scrub while a selection is active.
  hoverScrubEnabled: boolean;
  // Modifier-aware click: views forward the React MouseEvent metaKey/ctrlKey/
  // shiftKey to the shell, which resolves intent (toggle/range/open).
  onCardClick: (path: string, event: CardClickEvent) => void;
  // Explicit checkbox toggle — bypasses modifier-aware open/select logic and
  // just adds or removes the card from the selection.
  onToggleSelected: (path: string) => void;
  // Right-click on a card. Receives the card's path + cursor coordinates so
  // the shell can position the context menu. If the card is not currently
  // selected, the shell will replace the selection with just this card
  // before opening the menu (Finder/Resolve pattern).
  onCardContextMenu: (path: string, x: number, y: number) => void;
};

export type SizeStep = 'S' | 'M' | 'L';

export type LibraryViewId = 'grid' | 'list';

export type LibraryView = {
  id: LibraryViewId;
  label: string;
  iconName: 'frame' | 'timeline';
  render: (props: LibraryViewProps) => JSX.Element;
  supportsSizeSlider?: boolean;
  supportsDateGrouping?: boolean;
};
