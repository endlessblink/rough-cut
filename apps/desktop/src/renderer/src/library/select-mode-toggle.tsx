// Header chip that flips the gallery into select-mode. When active, plain
// clicks on cards toggle selection instead of opening — useful for fast
// keyboard-light selection runs.
export function SelectModeToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`librarySelectModeChip ${active ? 'active' : ''}`}
      onClick={onToggle}
      aria-pressed={active}
      title={active ? 'Click cards to toggle selection. Esc exits.' : 'Enter selection mode'}
    >
      {active ? 'Selecting' : 'Select'}
    </button>
  );
}
